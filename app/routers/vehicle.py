# app/routers/vehicle.py
from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response, Query
from sqlalchemy.orm import Session
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/vehicles",
    tags=['Vehicles API']
)

# 1. CREATE
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleOut)
def create_vehicle(
    vehicle_data: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    if db.query(models.Vehicle).filter(models.Vehicle.plate_number == vehicle_data.plate_number).first():
        raise HTTPException(status_code=409, detail="Plate number already exists.")
    
    if db.query(models.Vehicle).filter(models.Vehicle.vin == vehicle_data.vin).first():
        raise HTTPException(status_code=409, detail="VIN already exists.")

    new_vehicle = models.Vehicle(
        **vehicle_data.model_dump(),
        is_verified=False,
        verified_at=None
    )
    db.add(new_vehicle)
    db.commit()
    db.refresh(new_vehicle)
    return new_vehicle

# 2. BULK VERIFY (Must be before /{id})
@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_vehicles_bulk(
    payload: schemas.VehicleBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    records = db.query(models.Vehicle).filter(
        models.Vehicle.id.in_(payload.ids),
        models.Vehicle.is_verified == False
    ).all()

    if not records:
        raise HTTPException(status_code=404, detail="No unverified vehicles found with provided IDs.")

    for rec in records:
        rec.is_verified = True
        rec.verified_at = datetime.utcnow()
    
    db.commit()
    return {"message": f"Successfully verified {len(records)} vehicles."}

# 3. READ ALL
@router.get("/", response_model=List[schemas.VehicleOut])
def get_all_vehicles(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = 1000,
    search: str = ""
):
    query = db.query(models.Vehicle)
    if search:
        query = query.filter(models.Vehicle.plate_number.ilike(f"%{search}%"))
    
    return query.limit(limit).all()

# 4. READ ONE
@router.get("/{id}", response_model=schemas.VehicleOut)
def get_vehicle_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    return vehicle

# 5. UPDATE (Locked if Verified)
@router.put("/{id}", response_model=schemas.VehicleOut)
def update_vehicle(
    id: int,
    vehicle_data: schemas.VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Lock Check
    if vehicle.is_verified and vehicle_data.is_verified is not False:
        raise HTTPException(status_code=403, detail="This vehicle is verified and cannot be modified.")

    update_data = vehicle_data.model_dump(exclude_unset=True)

    if "is_verified" in update_data:
        if update_data["is_verified"] is True:
            vehicle.verified_at = datetime.utcnow()
        else:
            vehicle.verified_at = None

    for key, value in update_data.items():
        setattr(vehicle, key, value)

    db.commit()
    db.refresh(vehicle)
    return vehicle

# 6. DELETE (Locked if Verified)
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if vehicle.is_verified:
        raise HTTPException(status_code=403, detail="Verified vehicles cannot be deleted.")

    db.delete(vehicle)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)