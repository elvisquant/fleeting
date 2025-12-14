from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException, Response, Query
from sqlalchemy.orm import Session

# --- Project Imports ---
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/vehicles",
    tags=['Vehicles API']
)

# =================================================================================
# CREATE (Admin Only)
# =================================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleOut)
def create_vehicle(
    vehicle_data: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    """
    Creates a new vehicle. Checks for duplicate Plate Number or VIN.
    """
    # 1. Check Plate Number
    if db.query(models.Vehicle).filter(models.Vehicle.plate_number == vehicle_data.plate_number).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail=f"Vehicle with plate number '{vehicle_data.plate_number}' already exists."
        )
    
    # 2. Check VIN
    if db.query(models.Vehicle).filter(models.Vehicle.vin == vehicle_data.vin).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail=f"Vehicle with VIN '{vehicle_data.vin}' already exists."
        )

    # 3. Create
    new_vehicle = models.Vehicle(**vehicle_data.model_dump())
    db.add(new_vehicle)
    db.commit()
    db.refresh(new_vehicle)
    return new_vehicle


# =================================================================================
# READ ALL (Authenticated Users)
# =================================================================================
@router.get("/", response_model=List[schemas.VehicleOut])
def get_all_vehicles(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = Query(100, ge=1),
    skip: int = Query(0, ge=0),
    search: Optional[str] = None
):
    """
    Get vehicles with optional Search (by plate number) and Pagination.
    """
    query = db.query(models.Vehicle)
    
    if search:
        # Case-insensitive search on plate number
        search_term = f"%{search}%"
        query = query.filter(models.Vehicle.plate_number.ilike(search_term))
        
    # Apply pagination
    vehicles = query.order_by(models.Vehicle.id).offset(skip).limit(limit).all()
    return vehicles


# =================================================================================
# READ ONE (Authenticated Users)
# =================================================================================
@router.get("/{id}", response_model=schemas.VehicleOut)
def get_vehicle_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == id).first()
    if not vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found.")
    return vehicle


# =================================================================================
# UPDATE DETAILS (Admin Only)
# =================================================================================
@router.put("/{id}", response_model=schemas.VehicleOut)
def update_vehicle(
    id: int,
    vehicle_data: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    vehicle_query = db.query(models.Vehicle).filter(models.Vehicle.id == id)
    db_vehicle = vehicle_query.first()

    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    # Check for conflicts only if changing critical fields
    if vehicle_data.plate_number != db_vehicle.plate_number:
        if db.query(models.Vehicle).filter(models.Vehicle.plate_number == vehicle_data.plate_number).first():
            raise HTTPException(status_code=409, detail="Plate number already in use.")

    vehicle_query.update(vehicle_data.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


# =================================================================================
# UPDATE STATUS (Admin Only)
# =================================================================================
@router.patch("/{id}/status", response_model=schemas.VehicleOut)
def update_vehicle_status(
    id: int,
    status_update: schemas.VehicleStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    """
    Quickly update just the status (e.g., available -> maintenance).
    """
    db_vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == id).first()
    if not db_vehicle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")

    db_vehicle.status = status_update.status
    db.commit()
    db.refresh(db_vehicle)
    return db_vehicle


# =================================================================================
# DELETE (Admin Only)
# =================================================================================
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    vehicle_query = db.query(models.Vehicle).filter(models.Vehicle.id == id)
    
    if not vehicle_query.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
        
    vehicle_query.delete(synchronize_session=False)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)