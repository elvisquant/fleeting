# app/routers/vehicle_make.py

from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(
    prefix="/api/v1/vehicle-makes",
    tags=["Vehicle Makes API"]
)


# ---------------------------------------------------------
# 🔵 Create Vehicle Make  (Admin Only)
# ---------------------------------------------------------
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleMakeOut)
def create_vehicle_make(
    payload: schemas.VehicleMakeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Create a new vehicle make (e.g., Toyota). 
    Admin or SuperAdmin role required.
    """

    # Ensure uniqueness (case-insensitive)
    existing = (
        db.query(models.VehicleMake)
        .filter(models.VehicleMake.vehicle_make.ilike(payload.vehicle_make))
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle make '{payload.vehicle_make}' already exists."
        )

    new_make = models.VehicleMake(**payload.model_dump())
    db.add(new_make)
    db.commit()
    db.refresh(new_make)

    return new_make


# ---------------------------------------------------------
# 🔵 Get All Vehicle Makes (Any authenticated user)
# ---------------------------------------------------------
@router.get("/", response_model=List[schemas.VehicleMakeOut])
def get_all_vehicle_makes(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
):
    """
    Return all vehicle makes sorted alphabetically.
    Any authenticated user can access.
    """

    makes = (
        db.query(models.VehicleMake)
        .order_by(models.VehicleMake.vehicle_make.asc())
        .all()
    )

    return makes


# ---------------------------------------------------------
# 🔵 Get Vehicle Make By ID (Any authenticated user)
# ---------------------------------------------------------
@router.get("/{id}", response_model=schemas.VehicleMakeOut)
def get_vehicle_make_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
):
    """
    Get a single vehicle make by ID.
    """

    make = db.query(models.VehicleMake).filter(models.VehicleMake.id == id).first()

    if not make:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle make with id {id} not found."
        )

    return make


# ---------------------------------------------------------
# 🔵 Update Vehicle Make (Admin Only)
# ---------------------------------------------------------
@router.put("/{id}", response_model=schemas.VehicleMakeOut)
def update_vehicle_make(
    id: int,
    payload: schemas.VehicleMakeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Update a vehicle make. Admin or SuperAdmin required.
    """

    make_query = db.query(models.VehicleMake).filter(models.VehicleMake.id == id)
    db_make = make_query.first()

    if not db_make:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle make with id {id} not found."
        )

    # Check name change + conflict
    if payload.vehicle_make.lower() != db_make.vehicle_make.lower():
        conflict = (
            db.query(models.VehicleMake)
            .filter(models.VehicleMake.vehicle_make.ilike(payload.vehicle_make))
            .first()
        )
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Vehicle make '{payload.vehicle_make}' already exists."
            )

    make_query.update(payload.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(db_make)

    return db_make


# ---------------------------------------------------------
# 🔵 Delete Vehicle Make (Admin Only)
# ---------------------------------------------------------
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle_make(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Delete a vehicle make. Admin or SuperAdmin only.
    """

    make_query = db.query(models.VehicleMake).filter(models.VehicleMake.id == id)
    db_make = make_query.first()

    if not db_make:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle make with id {id} not found."
        )

    make_query.delete(synchronize_session=False)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
