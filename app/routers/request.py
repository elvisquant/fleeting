from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import or_
from typing import List
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(prefix="/api/v1/requests", tags=['Requests API'])

# =================================================================
# 1. GET ALL REQUESTS (With Visibility Logic)
# =================================================================
@router.get("/", response_model=List[schemas.VehicleRequestOut])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = 100, 
    skip: int = 0
):
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver),
        joinedload(models.VehicleRequest.approvals) # Needed for the View button
    )
    
    user_role = current_user.role.name.lower()

    # Visibility Logic based on your requirements
    if user_role in ["admin", "superadmin", "darh"]:
        pass # Full access
    elif user_role == "chef":
        # Sees own or service requests
        query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                     .filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.User.service_id == current_user.service_id))
    elif user_role == "charoi":
        # Sees own or those approved by chef (needs to assign)
        query = query.filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.VehicleRequest.status == "approved_by_chef"))
    elif user_role == "logistic":
        # Sees own or those assigned by charoi (needs to approve)
        query = query.filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.VehicleRequest.status == "approved_by_charoi"))
    else:
        # Drivers and standard users see only their own
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)

    return query.order_by(models.VehicleRequest.id.desc()).offset(skip).limit(limit).all()

# =================================================================
# 2. CREATE REQUEST (Matricule Logic)
# =================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleRequestOut)
def create_request(
    request_data: schemas.VehicleRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Ensure requester's matricule is in the passenger list
    matricule_list = request_data.passengers if request_data.passengers else []
    if current_user.matricule not in matricule_list:
        matricule_list.append(current_user.matricule)

    new_request = models.VehicleRequest(
        destination=request_data.destination,
        description=request_data.description,
        departure_time=request_data.departure_time,
        return_time=request_data.return_time,
        passengers=matricule_list,
        requester_id=current_user.id,
        status="pending" # Used literal string to avoid AttributeError
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

# =================================================================
# 3. ASSIGN RESOURCES (Charoi/Logistic/Admin)
# =================================================================
@router.put("/{id}/assign", response_model=schemas.VehicleRequestOut)
def assign_vehicle_and_driver(
    id: int,
    assignment_data: schemas.RequestAssignment, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "charoi", "darh", "logistic"]))
):
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Rule: Can only assign if Chef has approved
    if req.status == "pending" and current_user.role.name.lower() not in ["admin", "superadmin"]:
        raise HTTPException(status_code=400, detail="Chef must approve before resource assignment.")

    # Update Passengers if provided
    if hasattr(assignment_data, 'passengers') and assignment_data.passengers is not None:
        req.passengers = assignment_data.passengers
        flag_modified(req, "passengers")

    req.vehicle_id = assignment_data.vehicle_id
    req.driver_id = assignment_data.driver_id
    
    # Crucial: Move status forward so Logistics can see it
    req.status = "approved_by_charoi"
    
    db.commit()
    db.refresh(req)
    return req

# =================================================================
# 4. HELPER: GET DRIVERS (For Dropdown)
# =================================================================
@router.get("/drivers", response_model=List[schemas.UserSimpleOut])
def get_active_drivers(db: Session = Depends(get_db)):
    """
    Returns users who have the role 'driver'
    """
    drivers = db.query(models.User).join(models.Role).filter(
        models.Role.name.ilike("driver"),
        models.User.is_active == True
    ).all()
    return drivers