from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/maintenances",
    tags=['Maintenances API']
)

# =================================================================================
# BULK VERIFY (CRITICAL: Must be defined BEFORE /{id} endpoints)
# =================================================================================
@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_maintenance_bulk(
    payload: schemas.MaintenanceBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    """
    Verify multiple maintenance records at once.
    """
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
# CREATE (Authenticated)
# =================================================================================
@router.post("/", status_code=201, response_model=schemas.MaintenanceOut)
def create_maintenance(maintenance_data: schemas.MaintenanceCreate, db: Session = Depends(get_db)):
    # 1. Prevent duplicate active maintenance for same vehicle
    existing = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == maintenance_data.vehicle_id,
        models.Maintenance.status == "active"
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="This vehicle is already undergoing active maintenance. Resolve that record first.")

    # 2. Create the record
    new_maint = models.Maintenance(**maintenance_data.model_dump())
    db.add(new_maint)
    
    # 3. Sync Vehicle: Mark as Inactive (Under Repair)
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == maintenance_data.vehicle_id).first()
    if vehicle:
        vehicle.is_active = False 
    
    db.commit()
    db.refresh(new_maint)
    return new_maint
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
def update_maintenance(id: int, maint_update: schemas.MaintenanceUpdate, db: Session = Depends(get_db)):
    maint = db.query(models.Maintenance).filter(models.Maintenance.id == id).first()
    if not maint:
        raise HTTPException(status_code=404, detail="Record not found")

    # Lock logic: Block if already resolved
    if maint.status == "resolved":
        raise HTTPException(status_code=403, detail="Completed maintenance records are locked and cannot be modified.")

    update_data = maint_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(maint, key, value)

    # Sync Vehicle Status
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == maint.vehicle_id).first()
    if vehicle:
        # Check if there are ANY OTHER maintenance or panne records still active
        other_active = db.query(models.Maintenance).filter(
            models.Maintenance.vehicle_id == vehicle.id,
            models.Maintenance.status == "active",
            models.Maintenance.id != maint.id
        ).count()
        
        # Note: You should also check for active Pannes here if applicable
        if maint.status == "resolved" and other_active == 0:
            vehicle.is_active = True # Back in service
        else:
            vehicle.is_active = False # Still under repair

    db.commit()
    db.refresh(maint)
    return maint

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




# app/routers/maintenance.py



