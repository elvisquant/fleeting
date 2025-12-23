# app/routers/request.py

from fastapi import APIRouter, Depends, status, HTTPException, Response, BackgroundTasks, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List
from datetime import datetime

# Import Schemas and Models
from app.schemas import operations as schemas
from app import models, oauth2
from app.database import get_db

# Imports for PDF & Email
from app.utils.pdf_generator import generate_mission_order_pdf
from app.utils.mailer import send_mission_update_email, send_driver_assignment_email

router = APIRouter(
    prefix="/api/v1/requests",
    tags=['Requests API']
)

# =================================================================================
# 0. HELPER ENDPOINT: GET DRIVERS
# =================================================================================
@router.get("/drivers", response_model=List[schemas.UserSimpleOut])
def get_active_drivers(db: Session = Depends(get_db)):
    """
    Fetches all users who have the 'driver' role and are active.
    """
    drivers = db.query(models.User).join(models.Role).filter(
        func.lower(models.Role.name) == "driver",
        models.User.is_active == True
    ).all()
    return drivers

# =================================================================================
# 1. CREATE REQUEST
# =================================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleRequestOut)
def create_request(
    request_data: schemas.VehicleRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    passenger_list = request_data.passengers if request_data.passengers else []
    if current_user.matricule and current_user.matricule not in passenger_list:
        passenger_list.append(current_user.matricule)

    new_request = models.VehicleRequest(
        destination=request_data.destination,
        description=request_data.description,
        departure_time=request_data.departure_time, 
        return_time=request_data.return_time,      
        passengers=passenger_list,
        requester_id=current_user.id,
        status="pending"
    )
    
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

# =================================================================================
# 2. READ ALL (With Pagination & Role Visibility)
# =================================================================================
@router.get("/", response_model=List[schemas.VehicleRequestOut])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = 1000, skip: int = 0
):
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.approvals),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver)
    )

    user_role = current_user.role.name.lower() if current_user.role else "user"

    # Role filters
    if user_role == "charoi":
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_logistic", "fully_approved", "in_progress", "completed"]))
    elif user_role == "logistic":
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_chef", "approved_by_logistic", "fully_approved", "in_progress", "completed"]))
    elif user_role == "chef":
        query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id).filter(models.User.service_id == current_user.service_id)
    elif user_role == "driver":
        query = query.filter(or_(models.VehicleRequest.driver_id == current_user.id, models.VehicleRequest.requester_id == current_user.id))
    elif user_role not in ["admin", "superadmin"]:
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)
    
    return query.order_by(models.VehicleRequest.id.desc()).limit(limit).offset(skip).all()

# =================================================================================
# 3. ASSIGN VEHICLE & DRIVER
# =================================================================================
@router.put("/{id}/assign", response_model=schemas.VehicleRequestOut)
def assign_vehicle_and_driver(
    id: int,
    assignment_data: schemas.RequestAssignment, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "charoi"]))
):
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == assignment_data.vehicle_id).first()
    driver = db.query(models.User).filter(models.User.id == assignment_data.driver_id).first()

    req.vehicle_id = assignment_data.vehicle_id
    req.driver_id = assignment_data.driver_id
    
    db.commit()
    db.refresh(req)
    return req

# =================================================================================
# 4. PENDING COUNT
# =================================================================================
@router.get("/count/pending")
def get_pending_requests_count(db: Session = Depends(get_db)):
    count = db.query(models.VehicleRequest).filter(models.VehicleRequest.status == "pending").count()
    return {"count": count}