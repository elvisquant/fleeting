from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(prefix="/api/v1/reparation", tags=["Reparations API"])

# ============================================================
# MASTER SYNC HELPER
# ============================================================
def sync_fleet_status(db: Session, vehicle_id: int):
    """
    Recalculates Vehicle.status string based on hierarchy:
    1. Active Panne -> "panne"
    2. Active Reparation -> "reparation"
    3. Active Maintenance -> "maintenance"
    4. Otherwise -> "available"
    """
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle: return

    active_panne = db.query(models.Panne).filter(models.Panne.vehicle_id == vehicle_id, models.Panne.status == "active").first()
    active_rep = db.query(models.Reparation).filter(models.Reparation.vehicle_id == vehicle_id, models.Reparation.status == "Inprogress").first()
    active_maint = db.query(models.Maintenance).filter(models.Maintenance.vehicle_id == vehicle_id, models.Maintenance.status == "active").first()

    if active_rep:
        vehicle.status = "reparation"
    elif active_panne:
        vehicle.status = "panne"
    elif active_maint:
        vehicle.status = "maintenance"
    else:
        vehicle.status = "available"
    
    db.commit()

# ============================================================
# ENDPOINTS
# ============================================================

@router.post("/", status_code=201, response_model=schemas.ReparationResponse)
def create_reparation(reparation_data: schemas.ReparationCreate, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.require_charoi_role)):
    panne = db.query(models.Panne).filter(models.Panne.id == reparation_data.panne_id).first()
    if not panne: raise HTTPException(status_code=404, detail="Broken incident ref not found.")
    
    existing = db.query(models.Reparation).filter(models.Reparation.vehicle_id == panne.vehicle_id, models.Reparation.status == "Inprogress").first()
    if existing: raise HTTPException(status_code=400, detail="This vehicle is already in a repair session.")

    new_rep = models.Reparation(**reparation_data.model_dump(), vehicle_id=panne.vehicle_id, is_verified=False)
    db.add(new_rep)
    db.commit()
    db.refresh(new_rep)

    sync_fleet_status(db, new_rep.vehicle_id)
    return new_rep

@router.put("/{id}", response_model=schemas.ReparationResponse)
def update_reparation(id: int, rep_update: schemas.ReparationUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.require_charoi_role)):
    rep = db.query(models.Reparation).filter(models.Reparation.id == id).first()
    if not rep: raise HTTPException(status_code=404, detail="Reparation log not found")

    # STRICT LOCK: Completed + Verified
    if rep.is_verified and rep.status == "Completed":
        raise HTTPException(status_code=403, detail="Historical records are archived and locked.")

    data = rep_update.model_dump(exclude_unset=True)
    for key, value in data.items(): setattr(rep, key, value)

    # If repair finished, close the breakdown ticket (Panne)
    if rep.status == "Completed":
        panne = db.query(models.Panne).filter(models.Panne.id == rep.panne_id).first()
        if panne: panne.status = "resolved"

    db.commit()
    db.refresh(rep)
    sync_fleet_status(db, rep.vehicle_id)
    return rep

@router.delete("/{id}", status_code=204)
def delete_reparation(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.require_charoi_role)):
    rep = db.query(models.Reparation).filter(models.Reparation.id == id).first()
    if not rep: raise HTTPException(status_code=404, detail="Not found")
    if rep.is_verified: raise HTTPException(status_code=403, detail="Verified records cannot be deleted.")

    v_id = rep.vehicle_id
    db.delete(rep)
    db.commit()
    sync_fleet_status(db, v_id)
    return Response(status_code=204)

@router.get("/", response_model=List[schemas.ReparationResponse])
def get_all(db: Session = Depends(get_db)):
    return db.query(models.Reparation).options(joinedload(models.Reparation.panne)).order_by(models.Reparation.id.desc()).all()

@router.put("/verify-bulk")
def verify_bulk(payload: schemas.ReparationBulkVerify, db: Session = Depends(get_db), current_user: models.User = Depends(oauth2.require_charoi_role)):
    recs = db.query(models.Reparation).filter(models.Reparation.id.in_(payload.ids)).all()
    for r in recs:
        r.is_verified = True
        r.verified_at = datetime.utcnow()
    db.commit()
    return {"message": "Verification complete"}