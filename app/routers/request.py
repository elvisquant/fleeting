# app/routers/request.py

from fastapi import APIRouter, Depends, status, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/requests",
    tags=['Requests API']
)

# =================================================================================
# 1. GET ALL REQUESTS (With Advanced Filtering)
# =================================================================================
@router.get("/", response_model=List[schemas.VehicleRequestOut])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = 1000, 
    skip: int = 0
):
    """
    Fetches requests based on user role:
    - Admin/Superadmin: All requests.
    - Logistic/Charoi: Requests ready for their specific processing steps.
    - Chef: Requests from their own service.
    - User/Driver: Only their own requests.
    """
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.approvals),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver)
    )

    user_role = current_user.role.name.lower() if current_user.role else "user"

    # Role-Based Visibility Logic
    if user_role in ["admin", "superadmin"]:
        pass  # View all records
        
    elif user_role == "charoi":
        # Charoi sees requests approved by logistics or higher
        query = query.filter(models.VehicleRequest.status.in_([
            "approved_by_logistic", "fully_approved", "in_progress", "completed"
        ]))
        
    elif user_role == "logistic":
        # Logistics sees requests approved by Chef or higher
        query = query.filter(models.VehicleRequest.status.in_([
            "approved_by_chef", "approved_by_logistic", "fully_approved", "in_progress", "completed"
        ]))
        
    elif user_role == "chef":
        # Chef only sees requests where the requester belongs to their service
        query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                     .filter(models.User.service_id == current_user.service_id)
                     
    elif user_role == "driver":
        # Driver sees missions where they are the driver OR the requester
        query = query.filter(or_(
            models.VehicleRequest.driver_id == current_user.id,
            models.VehicleRequest.requester_id == current_user.id
        ))
        
    else:
        # Standard users see only their own requests
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)
    
    return query.order_by(models.VehicleRequest.id.desc()).limit(limit).offset(skip).all()

# =================================================================================
# 2. CREATE NEW REQUEST
# =================================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleRequestOut)
def create_request(
    request_data: schemas.VehicleRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Prepare passenger list (ensure requester is included if not already there)
    passenger_list = request_data.passengers if request_data.passengers else []
    
    new_request = models.VehicleRequest(
        destination=request_data.destination,
        description=request_data.description,
        departure_time=request_data.departure_time, # Mapped to start_time in model
        return_time=request_data.return_time,      # Mapped to end_time in model
        passengers=passenger_list,
        requester_id=current_user.id,
        status="pending"
    )
    
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

# =================================================================================
# 3. ASSIGN VEHICLE & DRIVER
# =================================================================================
@router.put("/{id}/assign", response_model=schemas.VehicleRequestOut)
def assign_vehicle_and_driver(
    id: int,
    assignment_data: schemas.RequestAssignment, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "charoi"]))
):
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Mission request not found.")

    # Validate Vehicle Availability/Status
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == assignment_data.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found.")
    
    if vehicle.status.lower() not in ["active", "available"]:
        raise HTTPException(status_code=400, detail=f"Vehicle {vehicle.plate_number} is currently {vehicle.status}.")

    req.vehicle_id = assignment_data.vehicle_id
    req.driver_id = assignment_data.driver_id
    
    db.commit()
    db.refresh(req)
    return req

# =================================================================================
# 4. HELPER: GET DRIVERS
# =================================================================================
@router.get("/drivers", response_model=List[schemas.UserSimpleOut])
def get_active_drivers(db: Session = Depends(get_db)):
    """
    Returns only active users with the 'Driver' role for assignment dropdowns.
    """
    drivers = db.query(models.User).join(models.Role).filter(
        models.Role.name.ilike("driver"),
        models.User.is_active == True
    ).all()
    return drivers

# =================================================================================
# 5. HELPER: PENDING COUNT
# =================================================================================
@router.get("/count/pending")
def get_pending_requests_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    """
    Used for dashboard badges.
    """
    query = db.query(models.VehicleRequest).filter(models.VehicleRequest.status == "pending")
    
    # If the user is a Chef, show pending count only for their service
    if current_user.role and current_user.role.name.lower() == "chef":
        query = query.join(models.User).filter(models.User.service_id == current_user.service_id)
        
    return {"count": query.count()}