from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/services",
    tags=['Services API']
)

# --- CREATE (Admin Only) ---
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.ServiceOut)
def create_service(
    service_data: schemas.ServiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    if db.query(models.Service).filter(models.Service.service_name == service_data.service_name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service already exists.")

    new_service = models.Service(**service_data.model_dump())
    db.add(new_service)
    db.commit()
    db.refresh(new_service)
    return new_service

# --- READ ALL (Public - For Dropdowns) ---
@router.get("/", response_model=List[schemas.ServiceOut])
def get_all_services(
    db: Session = Depends(get_db)
    # No auth dependency here so signup page can use it
):
    return db.query(models.Service).order_by(models.Service.service_name).all()

# --- READ ONE (Authenticated) ---
@router.get("/{id}", response_model=schemas.ServiceOut)
def get_service_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    service = db.query(models.Service).filter(models.Service.id == id).first()
    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
    return service

# --- UPDATE (Admin Only) ---
@router.put("/{id}", response_model=schemas.ServiceOut)
def update_service(
    id: int,
    service_data: schemas.ServiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.Service).filter(models.Service.id == id)
    service = query.first()

    if not service:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")

    if service_data.service_name != service.service_name:
        if db.query(models.Service).filter(models.Service.service_name == service_data.service_name).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Service name taken.")

    query.update(service_data.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(service)
    return service

# --- DELETE (Admin Only) ---
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.Service).filter(models.Service.id == id)
    if not query.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service not found.")
        
    query.delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)