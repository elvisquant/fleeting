from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/roles",
    tags=['Roles API']
)

# --- CREATE (Admin Only) ---
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.RoleOut)
def create_role(
    role_data: schemas.RoleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    existing_role = db.query(models.Role).filter(models.Role.name == role_data.name.lower()).first()
    if existing_role:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role already exists.")

    new_role = models.Role(name=role_data.name.lower(), description=role_data.description)
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role

# --- READ ALL (Public - For Dropdowns) ---
@router.get("/", response_model=List[schemas.RoleOut])
def get_all_roles(
    db: Session = Depends(get_db)
    # No auth dependency here so signup page can use it
):
    return db.query(models.Role).order_by(models.Role.name).all()

# --- READ ONE (Authenticated) ---
@router.get("/{id}", response_model=schemas.RoleOut)
def get_role_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    role = db.query(models.Role).filter(models.Role.id == id).first()
    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
    return role

# --- UPDATE (Admin Only) ---
@router.put("/{id}", response_model=schemas.RoleOut)
def update_role(
    id: int,
    role_data: schemas.RoleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.Role).filter(models.Role.id == id)
    role = query.first()

    if not role:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")

    if role_data.name.lower() != role.name:
        if db.query(models.Role).filter(models.Role.name == role_data.name.lower()).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Role name taken.")

    update_data = role_data.model_dump()
    update_data['name'] = update_data['name'].lower()
    query.update(update_data, synchronize_session=False)
    db.commit()
    db.refresh(role)
    return role

# --- DELETE (Admin Only) ---
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.Role).filter(models.Role.id == id)
    if not query.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found.")
        
    query.delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)