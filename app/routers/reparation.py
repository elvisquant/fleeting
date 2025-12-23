# app/routers/reparation.py

from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/reparation",
    tags=["Reparations API"]
)

# ============================================================
# BULK VERIFY (MUST BE BEFORE /{id})
# ============================================================
@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_reparation_bulk(
    payload: schemas.ReparationBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role) # Admin/Charoi
):
    """
    Verify multiple reparation records at once.
    """
    records = db.query(models.Reparation).filter(
        models.Reparation.id.in_(payload.ids),
        models.Reparation.is_verified == False
    ).all()

    if not records:
        # Return success with message to prevent frontend error
        return {"message": "No applicable unverified records found."}

    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    
    db.commit()
    return {"message": f"Successfully verified {len(records)} records."}

# ============================================================
# CREATE (Authenticated) - Default Unverified
# ============================================================
@router.post("/", status_code=201, response_model=schemas.ReparationResponse)
def create_reparation(
    reparation_data: schemas.ReparationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    # 1. Fetch Panne and Vehicle
    panne = db.query(models.Panne).filter(models.Panne.id == reparation_data.panne_id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Panne not found.")
    
    # 2. Prevent duplicate active reparations for the same vehicle
    existing_repair = db.query(models.Reparation).filter(
        models.Reparation.vehicle_id == panne.vehicle_id,
        models.Reparation.status == "Inprogress"
    ).first()
    
    if existing_repair:
        raise HTTPException(status_code=400, detail="This vehicle is already undergoing another repair.")

    # 3. Create the record
    new_reparation = models.Reparation(
        **reparation_data.model_dump(),
        vehicle_id=panne.vehicle_id, # Ensure vehicle ID is synced
        is_verified=False,
        status="Inprogress"
    )
    
    # 4. Update Panne status to indicate repair has started
    panne.status = "active" # Keep active while repairing
    
    db.add(new_reparation)
    db.commit()
    db.refresh(new_reparation)
    return new_reparation

# ============================================================
# READ ALL (Authenticated)
# ============================================================
@router.get("/", response_model=List[schemas.ReparationResponse])
def get_all_reparations(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    return db.query(models.Reparation).options(
        joinedload(models.Reparation.panne),
        joinedload(models.Reparation.garage)
    ).order_by(models.Reparation.repair_date.desc()).all()

# ============================================================
# READ ONE (Authenticated)
# ============================================================
@router.get("/{id}", response_model=schemas.ReparationResponse)
def get_reparation_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    reparation = db.query(models.Reparation).options(
        joinedload(models.Reparation.panne),
        joinedload(models.Reparation.garage)
    ).filter(models.Reparation.id == id).first()

    if not reparation:
        raise HTTPException(status_code=404, detail="Reparation not found.")
    return reparation

# ============================================================
# UPDATE (Admin/Charoi) - LOCKED IF VERIFIED
# ============================================================

@router.put("/{id}", response_model=schemas.ReparationResponse)
def update_reparation(
    id: int,
    reparation_data: schemas.ReparationUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    reparation = db.query(models.Reparation).filter(models.Reparation.id == id).first()
    if not reparation:
        raise HTTPException(status_code=404, detail="Reparation not found.")

    # Only allow editing if not verified or if progress is being updated
    if reparation.is_verified and reparation.status == "Completed":
        raise HTTPException(status_code=403, detail="Completed and verified records are locked.")

    update_data = reparation_data.model_dump(exclude_unset=True)

    # 5. SYNC LOGIC: Reparation -> Panne -> Vehicle
    if update_data.get("status") == "Completed":
        # Mark Panne as Resolved
        panne = db.query(models.Panne).filter(models.Panne.id == reparation.panne_id).first()
        if panne:
            panne.status = "resolved"
            
            # Check if this was the LAST active panne for the vehicle
            remaining_active = db.query(models.Panne).filter(
                models.Panne.vehicle_id == panne.vehicle_id,
                models.Panne.status == "active"
            ).count()
            
            if remaining_active == 0:
                vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == panne.vehicle_id).first()
                if vehicle:
                    vehicle.is_active = True # Vehicle is now available!

    for key, value in update_data.items():
        setattr(reparation, key, value)

    db.commit()
    db.refresh(reparation)
    return reparation

# ============================================================
# DELETE (Admin/Charoi) - LOCKED IF VERIFIED
# ============================================================
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reparation(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    reparation = db.query(models.Reparation).filter(models.Reparation.id == id).first()
    if not reparation:
        raise HTTPException(status_code=404, detail="Reparation not found.")

    # LOCK CHECK
    if reparation.is_verified:
        raise HTTPException(status_code=403, detail="This record is verified and cannot be deleted.")

    db.delete(reparation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)







