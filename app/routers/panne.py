# app/routers/panne.py

from fastapi import APIRouter, Depends, status, HTTPException, Response, Query
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
# BULK VERIFY (MUST BE BEFORE /{id})
# =================================================================================
@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_panne_bulk(
    payload: schemas.PanneBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role) # Admin/Charoi only
):
    """
    Verify multiple panne reports at once.
    """
    records = db.query(models.Panne).filter(
        models.Panne.id.in_(payload.ids),
        models.Panne.is_verified == False
    ).all()

    if not records:
        # Return success with message even if 0 to prevent frontend error
        return {"message": "No applicable unverified records found."}

    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    
    db.commit()
    return {"message": f"Successfully verified {len(records)} reports."}

# =================================================================================
# CREATE (Authenticated) - Default Unverified
# =================================================================================
@router.post("/", status_code=201)
def create_panne(panne_data: schemas.PanneCreate, db: Session = Depends(get_db)):
    # 1. Create the Panne
    new_panne = models.Panne(**panne_data.model_dump())
    db.add(new_panne)
    
    # 2. IMMEDIATELY update Vehicle to Inactive (Broken)
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == panne_data.vehicle_id).first()
    if vehicle:
        vehicle.is_active = False  # Vehicle is now broken
    
    db.commit()
    db.refresh(new_panne)
    return new_panne

# =================================================================================
# READ ALL (Authenticated)
# =================================================================================
@router.get("/", response_model=schemas.PaginatedPanneOut)
def get_all_pannes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100)
):
    offset = (page - 1) * page_size
    total_count = db.query(models.Panne).count()

    pannes = db.query(models.Panne).options(
        joinedload(models.Panne.vehicle),
        joinedload(models.Panne.category_panne)
    ).order_by(models.Panne.panne_date.desc()).limit(page_size).offset(offset).all()

    return schemas.PaginatedPanneOut(total_count=total_count, items=pannes)

# =================================================================================
# READ ONE (Authenticated)
# =================================================================================
@router.get("/{id}", response_model=schemas.PanneOut)
def get_panne_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    panne = db.query(models.Panne).options(
        joinedload(models.Panne.vehicle),
        joinedload(models.Panne.category_panne)
    ).filter(models.Panne.id == id).first()

    if not panne:
        raise HTTPException(status_code=404, detail="Panne not found.")
    return panne

# =================================================================================
# UPDATE (Admin/Charoi) - LOCKED IF VERIFIED
# =================================================================================
@router.put("/{id}")
def update_panne(id: int, panne_update: schemas.PanneUpdate, db: Session = Depends(get_db)):
    panne = db.query(models.Panne).filter(models.Panne.id == id).first()
    if not panne:
        raise HTTPException(status_code=404, detail="Record not found")

    # If it was already resolved, don't allow changes
    if panne.status == "resolved":
        raise HTTPException(status_code=403, detail="Completed reports are locked.")

    update_data = panne_update.model_dump(exclude_unset=True)

    # 3. LOGIC TO SYNC VEHICLE STATUS
    if "status" in update_data:
        vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == panne.vehicle_id).first()
        if vehicle:
            if update_data["status"] == "resolved":
                vehicle.is_active = True   # Fixed! Mark vehicle as active again
            else:
                vehicle.is_active = False  # Still broken
    
    for key, value in update_data.items():
        setattr(panne, key, value)

    db.commit()
    db.refresh(panne)
    return panne
# =================================================================================
# DELETE (Admin/Charoi) - LOCKED IF VERIFIED
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
        raise HTTPException(status_code=403, detail="This record is verified and cannot be deleted.")

    db.delete(panne)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)