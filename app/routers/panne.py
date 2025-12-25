from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/panne",
    tags=['Pannes API']
)

# =================================================================================
# GLOBAL HELPER: REAL-WORLD STATUS SYNC
# =================================================================================
def sync_vehicle_status_with_real_cases(db: Session, vehicle_id: int):
    """
    Priority Logic:
    1. If ANY Panne is 'active' -> status = "panne"
    2. Else if ANY Maintenance is 'active' -> status = "maintenance"
    3. Else -> status = "available"
    """
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        return

    # Check for active breakdown
    has_active_panne = db.query(models.Panne).filter(
        models.Panne.vehicle_id == vehicle_id,
        models.Panne.status == "active"
    ).first()

    # Check for active maintenance
    has_active_maint = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == vehicle_id,
        models.Maintenance.status == "active"
    ).first()

    if has_active_panne:
        vehicle.status = "panne"
    elif has_active_maint:
        vehicle.status = "maintenance"
    else:
        vehicle.status = "available"
    
    db.commit()

# =================================================================================
# CREATE (Auto-sets Vehicle to "panne")
# =================================================================================
@router.post("/", status_code=201, response_model=schemas.PanneOut)
def create_panne(
    panne_data: schemas.PanneCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Prevent duplicate active pannes
    existing_active = db.query(models.Panne).filter(
        models.Panne.vehicle_id == panne_data.vehicle_id,
        models.Panne.status == "active"
    ).first()

    if existing_active:
        raise HTTPException(status_code=400, detail="Vehicle already has an active panne report.")

    # Create the breakdown record
    new_panne = models.Panne(**panne_data.model_dump())
    new_panne.status = "active" # Enforced by backend
    
    db.add(new_panne)
    db.commit()
    db.refresh(new_panne)

    # Sync Vehicle status to "panne"
    sync_vehicle_status_with_real_cases(db, new_panne.vehicle_id)
    
    return new_panne

# =================================================================================
# UPDATE (Recalculates status)
# =================================================================================
@router.put("/{id}", response_model=schemas.PanneOut)
def update_panne(
    id: int, 
    panne_update: schemas.PanneUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    panne = db.query(models.Panne).filter(models.Panne.id == id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Record not found")

    # Strict Lock Check
    if panne.is_verified and panne.status == "resolved":
        raise HTTPException(status_code=403, detail="Record is locked and verified.")

    update_data = panne_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(panne, key, value)

    db.commit()
    db.refresh(panne)

    # Re-calculate if vehicle is still in "panne", "maintenance", or "available"
    sync_vehicle_status_with_real_cases(db, panne.vehicle_id)

    return panne

# =================================================================================
# DELETE
# =================================================================================
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_panne(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    panne = db.query(models.Panne).filter(models.Panne.id == id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne not found.")

    if panne.is_verified:
        raise HTTPException(status_code=403, detail="Verified records cannot be deleted.")

    v_id = panne.vehicle_id
    db.delete(panne)
    db.commit()

    # Recalculate status
    sync_vehicle_status_with_real_cases(db, v_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =================================================================================
# READ ALL & BULK VERIFY
# =================================================================================
@router.get("/", response_model=List[schemas.PanneOut])
def get_all_pannes(db: Session = Depends(get_db)):
    return db.query(models.Panne).options(joinedload(models.Panne.vehicle)).order_by(models.Panne.id.desc()).all()

@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_panne_bulk(payload: schemas.PanneBulkVerify, db: Session = Depends(get_db)):
    records = db.query(models.Panne).filter(models.Panne.id.in_(payload.ids)).all()
    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    db.commit()
    return {"message": "Success"}