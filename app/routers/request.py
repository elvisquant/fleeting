# app/routers/request.py

from fastapi import APIRouter, Depends, status, HTTPException, Response, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
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
    
    Logic:
    1. Accepts a list of passenger matricules.
    2. Automatically adds the Requester's own matricule to the list if not present.
    3. Validates that ALL matricules exist in the User database.
    4. Saves the request with status 'pending'.
    """
    
    # 1. Prepare Passenger List
    # Start with the list provided by user (or empty list if None)
    passenger_list = request_data.passengers if request_data.passengers else []

    # 2. Auto-add Requester
    # Ensure the current user is in the list (if they have a matricule set)
    if current_user.matricule and current_user.matricule not in passenger_list:
        passenger_list.append(current_user.matricule)

    # 3. Validate Passengers
    # We query the DB to ensure every matricule in the list corresponds to a real user.
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
        # Map Pydantic 'departure_time' -> DB 'departure_time' (mapped to start_time col)
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
    
    Permissions:
    - Only Charoi, Admin, or Superadmin can perform this action.
    
    Logic:
    - Verifies request exists.
    - Verifies vehicle exists.
    - Verifies driver (User) exists.
    - Updates the request record.
    """
    # 1. Fetch Request
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    # 2. Verify Vehicle Existence
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == assignment_data.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    # 3. Verify Driver Existence
    driver = db.query(models.User).filter(models.User.id == assignment_data.driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

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
    """
    Denies a request and records the reason.
    Accessible by any role involved in the approval chain.
    """
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
    """
    Helper endpoint to get the total number of pending requests.
    Used for dashboard badges.
    """
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
    """
    Fetches requests with STRICT visibility rules based on User Role:
    
    1. Admin / Superadmin:
       - Sees ALL requests.
       
    2. Charoi:
       - Sees requests that have passed Logistic approval.
       
    3. Logistic:
       - Sees requests that have passed Chef approval.
       
    4. Chef:
       - Sees requests made by users in THEIR Service (Department).
       
    5. Everyone Else (Driver, Operateur, Technicien, User):
       - Sees ONLY requests where they are the REQUESTER.
    """
    
    # 1. Base Query with eager loading for relationships
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.approvals),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver)
    )

    user_role = current_user.role.name.lower() if current_user.role else "user"

    # --- ROLE BASED FILTERING ---

    # CASE A: ADMINS (See All)
    if user_role in ["admin", "superadmin"]:
        pass # No filter applied

    # CASE B: CHAROI (See downstream approvals)
    elif user_role == "charoi":
        query = query.filter(models.VehicleRequest.status.in_([
            "approved_by_logistic", 
            "fully_approved", 
            "in_progress", 
            "completed"
        ]))

    # CASE C: LOGISTIC (See downstream approvals)
    elif user_role == "logistic":
        query = query.filter(models.VehicleRequest.status.in_([
            "approved_by_chef", 
            "approved_by_logistic", 
            "fully_approved", 
            "in_progress", 
            "completed"
        ]))

    # CASE D: CHEF (See Service-based requests)
    elif user_role == "chef":
        if current_user.service_id:
            # Join with User table to filter by Service ID
            query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                         .filter(models.User.service_id == current_user.service_id)
        else:
            # Fallback: If Chef has no service, only see own requests
            query = query.filter(models.VehicleRequest.requester_id == current_user.id)

    # CASE E: EVERYONE ELSE (Driver, User, Operateur, Technicien)
    # They only see what they requested themselves.
    else:
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)
    
    # 3. Order and Paginate
    return query.order_by(models.VehicleRequest.created_at.desc()).limit(limit).offset(skip).all()