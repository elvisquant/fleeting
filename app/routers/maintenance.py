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
# GLOBAL HELPER: SYNC VEHICLE STATUS STRING
# =================================================================================
def sync_vehicle_status(db: Session, vehicle_id: int):
    """
    Updates the Vehicle.status string based on active maintenance or repairs.
    """
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        return

    # 1. Count Active Maintenances
    active_maint = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == vehicle_id,
        models.Maintenance.status == "active"
    ).count()

    # 2. Count Active Reparations (as seen in your Vehicle model)
    active_repairs = 0
    try:
        # Assuming Reparation has a 'status' field similarly
        active_repairs = db.query(models.Reparation).filter(
            models.Reparation.vehicle_id == vehicle_id,
            models.Reparation.status == "active"
        ).count()
    except Exception:
        active_repairs = 0

    # 3. Update the Status String
    if active_maint > 0 or active_repairs > 0:
        vehicle.status = "maintenance"
    else:
        vehicle.status = "available"

    db.commit()

# =================================================================================
# CREATE
# =================================================================================
@router.post("/", status_code=201, response_model=schemas.MaintenanceOut)
def create_maintenance(
    maintenance_data: schemas.MaintenanceCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Check for existing active maintenance
    if maintenance_data.status == "active":
        existing = db.query(models.Maintenance).filter(
            models.Maintenance.vehicle_id == maintenance_data.vehicle_id,
            models.Maintenance.status == "active"
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Vehicle is already in maintenance.")

    new_maint = models.Maintenance(**maintenance_data.model_dump())
    db.add(new_maint)
    db.commit()
    db.refresh(new_maint)

    # Trigger Status Sync
    sync_vehicle_status(db, new_maint.vehicle_id)
    
    return new_maint

# =================================================================================
# UPDATE
# =================================================================================
@router.put("/{id}", response_model=schemas.MaintenanceOut)
def update_maintenance(
    id: int, 
    maint_update: schemas.MaintenanceUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    maint = db.query(models.Maintenance).filter(models.Maintenance.id == id).first()
    if not maint:
        raise HTTPException(status_code=404, detail="Not found")

    # Strict Lock (Verified + Resolved)
    if maint.is_verified and maint.status == "resolved":
        raise HTTPException(status_code=403, detail="Locked record.")

    update_data = maint_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(maint, key, value)

    db.commit()
    db.refresh(maint)

    # Trigger Status Sync
    sync_vehicle_status(db, maint.vehicle_id)

    return maint

# =================================================================================
# DELETE
# =================================================================================
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_maintenance(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    maint = db.query(models.Maintenance).filter(models.Maintenance.id == id).first()
    if not maint:
        raise HTTPException(status_code=404, detail="Not found")

    if maint.is_verified:
        raise HTTPException(status_code=403, detail="Verified records cannot be deleted.")

    v_id = maint.vehicle_id
    db.delete(maint)
    db.commit()

    # Trigger Status Sync
    sync_vehicle_status(db, v_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =================================================================================
# OTHERS
# =================================================================================
@router.get("/", response_model=List[schemas.MaintenanceOut])
def get_all_maintenances(db: Session = Depends(get_db)):
    return db.query(models.Maintenance).order_by(models.Maintenance.id.desc()).all()

@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_maintenance_bulk(payload: schemas.MaintenanceBulkVerify, db: Session = Depends(get_db)):
    records = db.query(models.Maintenance).filter(models.Maintenance.id.in_(payload.ids)).all()
    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    db.commit()
    return {"message": "Success"}