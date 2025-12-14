# app/routers/maintenance.py

from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/maintenances",
    tags=['Maintenances API']
)

# =================================================================================
# CREATE (Authenticated) - Default Unverified
# =================================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.MaintenanceOut)
def create_maintenance(
    maintenance_data: schemas.MaintenanceCreate,
    db: Session = Depends(get_db),
    # Allow drivers/staff to report maintenance, verified by Admin later
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Validate vehicle
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == maintenance_data.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found.")

    new_maintenance = models.Maintenance(
        **maintenance_data.model_dump(),
        is_verified=False,
        verified_at=None
    )
    db.add(new_maintenance)
    db.commit()
    db.refresh(new_maintenance)
    return new_maintenance


# =================================================================================
# READ ALL (Authenticated)
# =================================================================================
@router.get("/", response_model=List[schemas.MaintenanceOut])
def get_all_maintenances(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    return db.query(models.Maintenance).order_by(models.Maintenance.maintenance_date.desc()).all()


# =================================================================================
# READ ONE (Authenticated)
# =================================================================================
@router.get("/{id}", response_model=schemas.MaintenanceOut)
def get_maintenance_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    maintenance = db.query(models.Maintenance).filter(models.Maintenance.id == id).first()
    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance record not found.")
    return maintenance


# =================================================================================
# UPDATE (Admin/Charoi Only) - LOCKED IF VERIFIED
# =================================================================================
@router.put("/{id}", response_model=schemas.MaintenanceOut)
def update_maintenance(
    id: int,
    maintenance_data: schemas.MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    query = db.query(models.Maintenance).filter(models.Maintenance.id == id)
    db_maintenance = query.first()

    if not db_maintenance:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    # LOCK CHECK
    if db_maintenance.is_verified:
        raise HTTPException(status_code=403, detail="This record is verified and cannot be modified.")

    update_data = maintenance_data.model_dump(exclude_unset=True)

    # 1. Handle Verification Logic
    if "is_verified" in update_data:
        if update_data["is_verified"] is True:
            db_maintenance.verified_at = datetime.utcnow()
        else:
            db_maintenance.verified_at = None

    # Apply updates
    for key, value in update_data.items():
        setattr(db_maintenance, key, value)

    db.commit()
    db.refresh(db_maintenance)
    return db_maintenance


# =================================================================================
# DELETE (Admin/Charoi Only) - LOCKED IF VERIFIED
# =================================================================================
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    db_maintenance = db.query(models.Maintenance).filter(models.Maintenance.id == id).first()
    if not db_maintenance:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    # LOCK CHECK
    if db_maintenance.is_verified:
        raise HTTPException(status_code=403, detail="This record is verified and cannot be deleted.")

    db.delete(db_maintenance)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)