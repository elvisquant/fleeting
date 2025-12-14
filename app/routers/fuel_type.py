from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session

# --- Project Imports ---
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/fuel-types",
    tags=['Fuel Types API']
)

# =================================================================================
# CREATE (Admin Only)
# =================================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.FuelTypeOut)
def create_fuel_type(
    fuel_data: schemas.FuelTypeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    """
    Creates a new fuel type (e.g., 'Diesel', 'Essence', 'Electric').
    """
    # Check duplicate name (Case Insensitive)
    existing_fuel = db.query(models.FuelType).filter(
        models.FuelType.fuel_type.ilike(fuel_data.fuel_type)
    ).first()
    
    if existing_fuel:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, 
            detail=f"Fuel type '{fuel_data.fuel_type}' already exists."
        )

    new_fuel = models.FuelType(**fuel_data.model_dump())
    db.add(new_fuel)
    db.commit()
    db.refresh(new_fuel)
    return new_fuel


# =================================================================================
# READ ALL (Authenticated Users)
# =================================================================================
@router.get("/", response_model=List[schemas.FuelTypeOut])
def get_all_fuel_types(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    """
    Get all fuel types sorted by name.
    """
    return db.query(models.FuelType).order_by(models.FuelType.fuel_type).all()


# =================================================================================
# READ ONE (Authenticated Users)
# =================================================================================
@router.get("/{id}", response_model=schemas.FuelTypeOut)
def get_fuel_type_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    fuel_type = db.query(models.FuelType).filter(models.FuelType.id == id).first()
    if not fuel_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Fuel type with id {id} not found."
        )
    return fuel_type


# =================================================================================
# UPDATE (Admin Only)
# =================================================================================
@router.put("/{id}", response_model=schemas.FuelTypeOut)
def update_fuel_type(
    id: int,
    fuel_data: schemas.FuelTypeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.FuelType).filter(models.FuelType.id == id)
    db_fuel = query.first()

    if not db_fuel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel type not found")

    # Check for name conflict ONLY if the name is actually changing
    if fuel_data.fuel_type.lower() != db_fuel.fuel_type.lower():
        existing = db.query(models.FuelType).filter(
            models.FuelType.fuel_type.ilike(fuel_data.fuel_type)
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, 
                detail=f"Fuel type '{fuel_data.fuel_type}' already exists."
            )

    query.update(fuel_data.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(db_fuel)
    return db_fuel


# =================================================================================
# DELETE (Admin Only)
# =================================================================================
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fuel_type(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.FuelType).filter(models.FuelType.id == id)
    
    if not query.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Fuel type not found")
        
    query.delete(synchronize_session=False)
    db.commit()
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)