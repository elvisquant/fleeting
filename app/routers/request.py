from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(prefix="/api/v1/requests", tags=['Requests API'])

@router.get("/", response_model=List[schemas.VehicleRequestOut])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Base query with all needed relations
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver),
        joinedload(models.VehicleRequest.approvals)
    )

    # Safety check for role
    user_role = "user"
    if current_user.role and current_user.role.name:
        user_role = current_user.role.name.lower()

    # Apply Filters based on role
    if user_role in ["admin", "superadmin"]:
        pass # See everything
    elif user_role == "charoi":
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_logistic", "fully_approved", "in_progress", "completed"]))
    elif user_role == "logistic":
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_chef", "approved_by_logistic", "fully_approved"]))
    elif user_role == "chef":
        query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id).filter(models.User.service_id == current_user.service_id)
    else:
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)
    
    return query.order_by(models.VehicleRequest.id.desc()).all()

@router.get("/drivers", response_model=List[schemas.UserSimpleOut])
def get_drivers(db: Session = Depends(get_db)):
    return db.query(models.User).join(models.Role).filter(models.Role.name.ilike("driver")).all()

@router.put("/{id}/assign")
def assign_request(id: int, data: schemas.RequestAssignment, db: Session = Depends(get_db), current_user=Depends(oauth2.require_role(["admin", "superadmin", "charoi"]))):
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Check if vehicle exists and is active
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == data.vehicle_id).first()
    if not vehicle or vehicle.status.lower() not in ['active', 'available']:
        raise HTTPException(status_code=400, detail="Selected vehicle is not available")

    req.vehicle_id = data.vehicle_id
    req.driver_id = data.driver_id
    db.commit()
    return {"message": "Assigned successfully"}