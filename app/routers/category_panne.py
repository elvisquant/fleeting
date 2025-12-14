from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/category_panne",
    tags=['Panne Categories API']
)

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.CategoryPanneOut)
def create_panne_category(
    category_data: schemas.CategoryPanneCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    if db.query(models.CategoryPanne).filter(models.CategoryPanne.panne_name.ilike(category_data.panne_name)).first():
        raise HTTPException(status_code=409, detail="Category already exists.")

    new_cat = models.CategoryPanne(**category_data.model_dump())
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat

@router.get("/", response_model=List[schemas.CategoryPanneOut])
def get_all_panne_categories(
    db: Session = Depends(get_db),
    #current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    return db.query(models.CategoryPanne).order_by(models.CategoryPanne.panne_name).all()

@router.get("/{id}", response_model=schemas.CategoryPanneOut)
def get_panne_category_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    cat = db.query(models.CategoryPanne).filter(models.CategoryPanne.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    return cat

@router.put("/{id}", response_model=schemas.CategoryPanneOut)
def update_panne_category(
    id: int,
    category_data: schemas.CategoryPanneCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    cat = db.query(models.CategoryPanne).filter(models.CategoryPanne.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if category_data.panne_name.lower() != cat.panne_name.lower():
        if db.query(models.CategoryPanne).filter(models.CategoryPanne.panne_name.ilike(category_data.panne_name)).first():
            raise HTTPException(status_code=409, detail="Name exists.")

    cat.panne_name = category_data.panne_name
    db.commit()
    db.refresh(cat)
    return cat

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_panne_category(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    cat = db.query(models.CategoryPanne).filter(models.CategoryPanne.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)