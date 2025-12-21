# app/routers/request.py

from fastapi import APIRouter, Depends, status, HTTPException, Response, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from typing import List
from datetime import datetime

# Import Schemas and Models
from app.schemas import operations as schemas
from app import models, oauth2
from app.database import get_db

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
    Used to populate the assignment dropdown.
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
    """
    Creates a new Vehicle Request.
    """
    # 1. Prepare Passenger List
    passenger_list = request_data.passengers if request_data.passengers else []

    # 2. Auto-add Requester
    if current_user.matricule and current_user.matricule not in passenger_list:
        passenger_list.append(current_user.matricule)

    # 3. Validate Passengers
    if passenger_list:
        existing_users = db.query(models.User).filter(
            models.User.matricule.in_(passenger_list)
        ).all()
        
        found_matricules = {u.matricule for u in existing_users}
        missing = [m for m in passenger_list if m not in found_matricules]
        
        if missing:
            raise HTTPException(
                status_code=400, 
                detail=f"The following passenger matricules do not exist: {', '.join(missing)}"
            )

    # 4. Create Database Object
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
# 2. ASSIGN VEHICLE & DRIVER (Charoi/Admin Only)
# =================================================================================
@router.put("/{id}/assign", response_model=schemas.VehicleRequestOut)
def assign_vehicle_and_driver(
    id: int,
    assignment_data: schemas.RequestAssignment, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "charoi"]))
):
    """
    Assigns a Vehicle and a Driver to a request.
    Validates that the driver is active and has the correct role.
    """
    # 1. Fetch Request
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # 2. Verify Vehicle
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == assignment_data.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # 3. Verify Driver (Must be a User with role 'driver')
    driver = db.query(models.User).options(joinedload(models.User.role)).filter(models.User.id == assignment_data.driver_id).first()
    
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    if not driver.is_active:
        raise HTTPException(status_code=400, detail="Selected driver is currently inactive.")
        
    if not driver.role or driver.role.name.lower() != "driver":
        raise HTTPException(status_code=400, detail=f"Selected user '{driver.full_name}' does not have the 'driver' role.")

    # 4. Apply Assignment
    req.vehicle_id = assignment_data.vehicle_id
    req.driver_id = assignment_data.driver_id
    
    db.commit()
    db.refresh(req)
    return req

# =================================================================================
# 3. REJECT REQUEST
# =================================================================================
@router.put("/{id}/reject", response_model=schemas.VehicleRequestOut)
def reject_request(
    id: int,
    rejection_data: schemas.VehicleRequestReject,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "logistic", "charoi", "chef"]))
):
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    req.status = "denied"
    req.rejection_reason = rejection_data.rejection_reason
    db.commit()
    db.refresh(req)
    return req

# =================================================================================
# 4. GET PENDING COUNT
# =================================================================================
@router.get("/count/pending", response_model=schemas.PendingRequestsCount)
def get_pending_requests_count(db: Session = Depends(get_db)):
    count = db.query(models.VehicleRequest).filter(models.VehicleRequest.status == "pending").count()
    return {"count": count}

# =================================================================================
# 5. GET ALL REQUESTS (With Strict Role-Based Visibility)
# =================================================================================
@router.get("/", response_model=List[schemas.VehicleRequestOut])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = 100, skip: int = 0
):
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.approvals),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver)
    )

    user_role = current_user.role.name.lower() if current_user.role else "user"

    # --- ADMIN / SUPERADMIN ---
    if user_role in ["admin", "superadmin"]:
        pass 

    # --- CHAROI ---
    elif user_role == "charoi":
        query = query.filter(models.VehicleRequest.status.in_([
            "approved_by_logistic", "fully_approved", "in_progress", "completed"
        ]))

    # --- LOGISTIC ---
    elif user_role == "logistic":
        query = query.filter(models.VehicleRequest.status.in_([
            "approved_by_chef", "approved_by_logistic", "fully_approved", "in_progress", "completed"
        ]))

    # --- CHEF ---
    elif user_role == "chef":
        if current_user.service_id:
            query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                         .filter(models.User.service_id == current_user.service_id)
        else:
            query = query.filter(models.VehicleRequest.requester_id == current_user.id)

    # --- DRIVER ---
    elif user_role == "driver":
        # Driver sees assigned tasks OR their own requests
        query = query.filter(
            or_(
                models.VehicleRequest.driver_id == current_user.id,
                models.VehicleRequest.requester_id == current_user.id
            )
        )

    # --- EVERYONE ELSE (User, Operateur, Technicien) ---
    else:
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)
    
    return query.order_by(models.VehicleRequest.created_at.desc()).limit(limit).offset(skip).all()