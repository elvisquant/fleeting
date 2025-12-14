from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/garage",
    tags=['Garages API']
)

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.GarageOut)
def create_garage(
    garage_data: schemas.GarageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    if db.query(models.Garage).filter(models.Garage.nom_garage.ilike(garage_data.nom_garage)).first():
        raise HTTPException(status_code=409, detail="Garage already exists.")

    new_garage = models.Garage(**garage_data.model_dump())
    db.add(new_garage)
    db.commit()
    db.refresh(new_garage)
    return new_garage

@router.get("/", response_model=List[schemas.GarageOut])
def get_all_garages(
    db: Session = Depends(get_db),
    # If you want this public (e.g. for dropdowns before login), remove the dependency below.
    #current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    return db.query(models.Garage).order_by(models.Garage.nom_garage).all()

@router.get("/{id}", response_model=schemas.GarageOut)
def get_garage_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    garage = db.query(models.Garage).filter(models.Garage.id == id).first()
    if not garage:
        raise HTTPException(status_code=404, detail="Garage not found.")
    return garage

@router.put("/{id}", response_model=schemas.GarageOut)
def update_garage(
    id: int,
    garage_data: schemas.GarageCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    garage = db.query(models.Garage).filter(models.Garage.id == id).first()
    if not garage:
        raise HTTPException(status_code=404, detail="Garage not found")

    if garage_data.nom_garage.lower() != garage.nom_garage.lower():
        if db.query(models.Garage).filter(models.Garage.nom_garage.ilike(garage_data.nom_garage)).first():
            raise HTTPException(status_code=409, detail="Garage name exists.")

    garage.nom_garage = garage_data.nom_garage # Update field
    db.commit()
    db.refresh(garage)
    return garage

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_garage(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    garage = db.query(models.Garage).filter(models.Garage.id == id).first()
    if not garage:
        raise HTTPException(status_code=404, detail="Garage not found")
    db.delete(garage)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)