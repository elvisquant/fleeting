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

# --- HELPER TO SYNC VEHICLE STATUS ---
def sync_vehicle_operational_status(db: Session, vehicle_id: int):
    """
    Checks all maintenance and panne records for a vehicle.
    If ANY maintenance is 'active' or ANY panne is 'active', the vehicle is NOT active.
    """
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        return

    # Check for active maintenance
    active_maint = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == vehicle_id,
        models.Maintenance.status == "active"
    ).first()

    # Check for active pannes (assuming panne model has 'status' or similar)
    # If your panne model uses a different field, adjust this line
    active_panne = db.query(models.Panne).filter(
        models.Panne.vehicle_id == vehicle_id,
        models.Panne.status == "active"
    ).first()

    # If nothing is active, vehicle is available (True), else unavailable (False)
    vehicle.is_active = (active_maint is None and active_panne is None)
    db.commit()

# =================================================================================
# BULK VERIFY
# =================================================================================
@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_maintenance_bulk(
    payload: schemas.MaintenanceBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    records = db.query(models.Maintenance).filter(
        models.Maintenance.id.in_(payload.ids),
        models.Maintenance.is_verified == False
    ).all()

    if not records:
        return {"message": "No applicable unverified records found."}

    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    
    db.commit()
    return {"message": f"Successfully verified {len(records)} records."}

# =================================================================================
# CREATE
# =================================================================================
@router.post("/", status_code=201, response_model=schemas.MaintenanceOut)
def create_maintenance(
    maintenance_data: schemas.MaintenanceCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # 1. Prevent duplicate active maintenance
    existing = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == maintenance_data.vehicle_id,
        models.Maintenance.status == "active"
    ).first()
    
    if existing and maintenance_data.status == "active":
        raise HTTPException(status_code=400, detail="Vehicle already has active maintenance.")

    # 2. Create the record
    new_maint = models.Maintenance(**maintenance_data.model_dump())
    db.add(new_maint)
    db.commit()
    db.refresh(new_maint)

    # 3. Sync Vehicle Status
    sync_vehicle_operational_status(db, new_maint.vehicle_id)
    
    return new_maint

# =================================================================================
# READ ALL
# =================================================================================
@router.get("/", response_model=List[schemas.MaintenanceOut])
def get_all_maintenances(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    return db.query(models.Maintenance).order_by(models.Maintenance.id.desc()).all()

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
        raise HTTPException(status_code=404, detail="Record not found")

    # Lock logic: Strict lock if both Verified and Resolved
    if maint.is_verified and maint.status == "resolved":
        raise HTTPException(status_code=403, detail="Verified and Resolved records are locked.")

    update_data = maint_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(maint, key, value)

    db.commit()
    db.refresh(maint)

    # Sync Vehicle Status (e.g., if status changed from active to resolved)
    sync_vehicle_operational_status(db, maint.vehicle_id)

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
    db_maintenance = db.query(models.Maintenance).filter(models.Maintenance.id == id).first()
    if not db_maintenance:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    if db_maintenance.is_verified:
        raise HTTPException(status_code=403, detail="Verified records cannot be deleted.")

    v_id = db_maintenance.vehicle_id
    db.delete(db_maintenance)
    db.commit()

    # Sync Vehicle Status (if we deleted the only thing keeping the vehicle inactive)
    sync_vehicle_operational_status(db, v_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)