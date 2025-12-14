from typing import List
from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/agencies",
    tags=['Agencies API']
)

# --- CREATE (Admin Only) ---
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.AgencyOut)
def create_agency(
    agency_data: schemas.AgencyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    # Check duplicate
    if db.query(models.Agency).filter(models.Agency.agency_name == agency_data.agency_name).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agency already exists.")

    new_agency = models.Agency(**agency_data.model_dump())
    db.add(new_agency)
    db.commit()
    db.refresh(new_agency)
    return new_agency

# --- READ ALL (Public - For Dropdowns) ---
@router.get("/", response_model=List[schemas.AgencyOut])
def get_all_agencies(
    db: Session = Depends(get_db)
    # No auth dependency here so signup page can use it
):
    return db.query(models.Agency).order_by(models.Agency.agency_name).all()

# --- READ ONE (Authenticated) ---
@router.get("/{id}", response_model=schemas.AgencyOut)
def get_agency_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    agency = db.query(models.Agency).filter(models.Agency.id == id).first()
    if not agency:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agency not found.")
    return agency

# --- UPDATE (Admin Only) ---
@router.put("/{id}", response_model=schemas.AgencyOut)
def update_agency(
    id: int,
    agency_data: schemas.AgencyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.Agency).filter(models.Agency.id == id)
    agency = query.first()

    if not agency:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agency not found.")

    if agency_data.agency_name != agency.agency_name:
        if db.query(models.Agency).filter(models.Agency.agency_name == agency_data.agency_name).first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Agency name taken.")

    query.update(agency_data.model_dump(), synchronize_session=False)
    db.commit()
    db.refresh(agency)
    return agency

# --- DELETE (Admin Only) ---
@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agency(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_admin_role_for_api)
):
    query = db.query(models.Agency).filter(models.Agency.id == id)
    if not query.first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agency not found.")
        
    query.delete(synchronize_session=False)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)