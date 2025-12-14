# In app/routers/vehicle_transmission.py

from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(
    prefix="/api/v1/vehicle-transmissions",
    tags=["Vehicle Transmissions API"]
)

# ──────────────────────────────────────────────────────────────────────────────
# CREATE transmission (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleTransmissionOut)
def create_vehicle_transmission(
    transmission_data: schemas.VehicleTransmissionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Create a new vehicle transmission type (e.g., 'Automatic', 'Manual').
    Requires admin or superadmin role.
    """

    existing = (
        db.query(models.VehicleTransmission)
        .filter(models.VehicleTransmission.vehicle_transmission.ilike(transmission_data.vehicle_transmission))
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle transmission type '{transmission_data.vehicle_transmission}' already exists."
        )

    new_transmission = models.VehicleTransmission(**transmission_data.model_dump())
    db.add(new_transmission)
    db.commit()
    db.refresh(new_transmission)

    return new_transmission


# ──────────────────────────────────────────────────────────────────────────────
# GET all transmissions (Authenticated Users)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/", response_model=List[schemas.VehicleTransmissionOut])
def get_all_vehicle_transmissions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
):
    """
    Get list of all vehicle transmission types.
    Requires authenticated user.
    """

    return (
        db.query(models.VehicleTransmission)
        .order_by(models.VehicleTransmission.vehicle_transmission)
        .all()
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET a transmission by ID (Authenticated Users)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/{id}", response_model=schemas.VehicleTransmissionOut)
def get_vehicle_transmission_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
):
    """
    Get a single vehicle transmission by ID.
    Requires authenticated user.
    """

    transmission = (
        db.query(models.VehicleTransmission)
        .filter(models.VehicleTransmission.id == id)
        .first()
    )

    if not transmission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle transmission type with ID {id} not found."
        )

    return transmission


# ──────────────────────────────────────────────────────────────────────────────
# UPDATE transmission (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.put("/{id}", response_model=schemas.VehicleTransmissionOut)
def update_vehicle_transmission(
    id: int,
    transmission_data: schemas.VehicleTransmissionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Update a vehicle transmission type.
    Admin/superadmin only.
    """

    query = db.query(models.VehicleTransmission).filter(models.VehicleTransmission.id == id)
    db_transmission = query.first()

    if not db_transmission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle transmission type with ID {id} not found."
        )

    # Check for duplicate only when the name actually changes
    if transmission_data.vehicle_transmission.lower() != db_transmission.vehicle_transmission.lower():
        conflict = (
            db.query(models.VehicleTransmission)
            .filter(models.VehicleTransmission.vehicle_transmission.ilike(transmission_data.vehicle_transmission))
            .first()
        )

        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Vehicle transmission type '{transmission_data.vehicle_transmission}' already exists."
            )

    query.update(transmission_data.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(db_transmission)

    return db_transmission


# ──────────────────────────────────────────────────────────────────────────────
# DELETE transmission (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle_transmission(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Delete a vehicle transmission type.
    Requires admin or superadmin role.
    """

    query = db.query(models.VehicleTransmission).filter(models.VehicleTransmission.id == id)

    if not query.first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle transmission type with ID {id} not found."
        )

    query.delete(synchronize_session=False)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
