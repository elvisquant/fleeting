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
# CREATE (Authenticated) - Default Unverified
# ============================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.ReparationResponse)
def create_reparation(
    reparation_data: schemas.ReparationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    # Verify relations
    if not db.query(models.Panne).filter(models.Panne.id == reparation_data.panne_id).first():
        raise HTTPException(status_code=404, detail="Panne not found.")
    
    if not db.query(models.Garage).filter(models.Garage.id == reparation_data.garage_id).first():
        raise HTTPException(status_code=404, detail="Garage not found.")

    new_reparation = models.Reparation(
        **reparation_data.model_dump(),
        is_verified=False,
        verified_at=None
    )

    # Auto-update panne status
    panne = db.query(models.Panne).filter(models.Panne.id == reparation_data.panne_id).first()
    if panne:
        panne.status = "in_progress"

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

    # LOCK CHECK
    if reparation.is_verified:
        raise HTTPException(status_code=403, detail="This record is verified and cannot be modified.")

    update_data = reparation_data.model_dump(exclude_unset=True)

    # Verification Logic
    if "is_verified" in update_data:
        if update_data["is_verified"] is True:
            reparation.verified_at = datetime.utcnow()
        else:
            reparation.verified_at = None

    for key, value in update_data.items():
        setattr(reparation, key, value)

    # Auto-update panne status on complete
    if update_data.get("status") == schemas.ReparationStatusEnum.COMPLETED:
        panne = db.query(models.Panne).filter(models.Panne.id == reparation.panne_id).first()
        if panne:
            panne.status = "resolved"

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