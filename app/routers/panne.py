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
# GLOBAL HELPER: FLEET STATUS SYNC
# =================================================================================
def sync_vehicle_status_logic(db: Session, vehicle_id: int):
    """
    Recalculates vehicle status based on active reports.
    Priority: Panne > Maintenance > Available
    """
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        return

    # Check for any active panne
    has_panne = db.query(models.Panne).filter(
        models.Panne.vehicle_id == vehicle_id,
        models.Panne.status == "active"
    ).first()

    # Check for any active maintenance
    has_maint = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == vehicle_id,
        models.Maintenance.status == "active"
    ).first()

    if has_panne:
        vehicle.status = "panne"
    elif has_maint:
        vehicle.status = "maintenance"
    else:
        vehicle.status = "available"
    
    db.commit()

# =================================================================================
# BULK VERIFY
# =================================================================================
@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_panne_bulk(
    payload: schemas.PanneBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    records = db.query(models.Panne).filter(
        models.Panne.id.in_(payload.ids),
        models.Panne.is_verified == False
    ).all()

    if not records:
        return {"message": "No unverified records found."}

    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    
    db.commit()
    return {"message": f"Successfully verified {len(records)} records."}

# =================================================================================
# CREATE (Forced to Active)
# =================================================================================
@router.post("/", status_code=201, response_model=schemas.PanneOut)
def create_panne(
    panne_data: schemas.PanneCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Check for existing active breakdown
    existing = db.query(models.Panne).filter(
        models.Panne.vehicle_id == panne_data.vehicle_id,
        models.Panne.status == "active"
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Vehicle already has an active breakdown report.")

    # Create Panne (Status defaults to active via schema/backend)
    new_panne = models.Panne(**panne_data.model_dump())
    new_panne.status = "active"
    
    db.add(new_panne)
    db.commit()
    db.refresh(new_panne)

    sync_vehicle_status_logic(db, new_panne.vehicle_id)
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

    # Strict Lock: Verified and Resolved
    if panne.is_verified and panne.status == "resolved":
        raise HTTPException(status_code=403, detail="Record is verified and completed. It cannot be modified.")

    update_data = panne_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(panne, key, value)

    db.commit()
    db.refresh(panne)

    sync_vehicle_status_logic(db, panne.vehicle_id)
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

    sync_vehicle_status_logic(db, v_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# =================================================================================
# READ ALL
# =================================================================================
@router.get("/", response_model=List[schemas.PanneOut])
def get_all_pannes(db: Session = Depends(get_db)):
    return db.query(models.Panne).options(joinedload(models.Panne.vehicle)).order_by(models.Panne.id.desc()).all()