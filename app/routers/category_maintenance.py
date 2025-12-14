from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/category_maintenance",
    tags=['Maintenance Categories API']
)

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.CategoryMaintenanceOut)
def create_maintenance_category(
    category_data: schemas.CategoryMaintenanceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    if db.query(models.CategoryMaintenance).filter(models.CategoryMaintenance.cat_maintenance.ilike(category_data.cat_maintenance)).first():
        raise HTTPException(status_code=409, detail="Category already exists.")

    new_cat = models.CategoryMaintenance(**category_data.model_dump())
    db.add(new_cat)
    db.commit()
    db.refresh(new_cat)
    return new_cat

@router.get("/", response_model=List[schemas.CategoryMaintenanceOut])
def get_all_maintenance_categories(
    db: Session = Depends(get_db),
    #current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    return db.query(models.CategoryMaintenance).order_by(models.CategoryMaintenance.cat_maintenance).all()

@router.get("/{id}", response_model=schemas.CategoryMaintenanceOut)
def get_maintenance_category_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    cat = db.query(models.CategoryMaintenance).filter(models.CategoryMaintenance.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found.")
    return cat

@router.put("/{id}", response_model=schemas.CategoryMaintenanceOut)
def update_maintenance_category(
    id: int,
    category_data: schemas.CategoryMaintenanceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    cat = db.query(models.CategoryMaintenance).filter(models.CategoryMaintenance.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if category_data.cat_maintenance.lower() != cat.cat_maintenance.lower():
        if db.query(models.CategoryMaintenance).filter(models.CategoryMaintenance.cat_maintenance.ilike(category_data.cat_maintenance)).first():
            raise HTTPException(status_code=409, detail="Name exists.")

    cat.cat_maintenance = category_data.cat_maintenance
    db.commit()
    db.refresh(cat)
    return cat

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance_category(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    cat = db.query(models.CategoryMaintenance).filter(models.CategoryMaintenance.id == id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)