# In app/routers/vehicle_model.py

from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from typing import List

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(
    prefix="/api/v1/vehicle-models",
    tags=["Vehicle Models API"]
)

# ──────────────────────────────────────────────────────────────────────────────
# CREATE vehicle model (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleModelOut)
def create_vehicle_model(
    model_data: schemas.VehicleModelCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Create a new vehicle model (e.g., 'Corolla', 'Civic', 'F150').
    Requires 'admin' or 'superadmin'.
    """

    # Case-insensitive unique model name
    existing = (
        db.query(models.VehicleModel)
        .filter(models.VehicleModel.vehicle_model.ilike(model_data.vehicle_model))
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle model '{model_data.vehicle_model}' already exists."
        )

    new_model = models.VehicleModel(**model_data.model_dump())
    db.add(new_model)
    db.commit()
    db.refresh(new_model)

    return new_model


# ──────────────────────────────────────────────────────────────────────────────
# GET all vehicle models (Any Authenticated User)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/", response_model=List[schemas.VehicleModelOut])
def get_all_vehicle_models(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
):
    """
    Get list of all vehicle models.
    Requires a valid logged-in user.
    """

    return (
        db.query(models.VehicleModel)
        .order_by(models.VehicleModel.vehicle_model)
        .all()
    )


# ──────────────────────────────────────────────────────────────────────────────
# GET a specific vehicle model by ID (Any Authenticated User)
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/{id}", response_model=schemas.VehicleModelOut)
def get_vehicle_model_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
):
    """
    Retrieve a single vehicle model by ID.
    Requires any logged-in user.
    """

    model = db.query(models.VehicleModel).filter(models.VehicleModel.id == id).first()

    if not model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle model with ID {id} not found."
        )

    return model


# ──────────────────────────────────────────────────────────────────────────────
# UPDATE vehicle model (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.put("/{id}", response_model=schemas.VehicleModelOut)
def update_vehicle_model(
    id: int,
    model_data: schemas.VehicleModelCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Update vehicle model information.
    Admin/superadmin only.
    """

    query = db.query(models.VehicleModel).filter(models.VehicleModel.id == id)
    db_model = query.first()

    if not db_model:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle model with ID {id} not found."
        )

    # If updating name, check that new name does not conflict
    if model_data.vehicle_model.lower() != db_model.vehicle_model.lower():
        conflict = (
            db.query(models.VehicleModel)
            .filter(models.VehicleModel.vehicle_model.ilike(model_data.vehicle_model))
            .first()
        )

        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Vehicle model '{model_data.vehicle_model}' already exists."
            )

    query.update(model_data.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(db_model)

    return db_model


# ──────────────────────────────────────────────────────────────────────────────
# DELETE vehicle model (Admin Only)
# ──────────────────────────────────────────────────────────────────────────────
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle_model(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api),
):
    """
    Delete a vehicle model.
    Admin/superadmin only.
    """

    query = db.query(models.VehicleModel).filter(models.VehicleModel.id == id)

    if not query.first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle model with ID {id} not found."
        )

    query.delete(synchronize_session=False)
    db.commit()

    return Response(status_code=status.HTTP_204_NO_CONTENT)
