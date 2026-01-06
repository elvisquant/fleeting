from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import or_
from typing import List
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(prefix="/api/v1/requests", tags=['Requests API'])

# =================================================================
# 1. GET ALL REQUESTS (Professional Visibility & Pagination)
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
        joinedload(models.VehicleRequest.approvals).joinedload(models.RequestApproval.approver) 
    )
    
    user_role = current_user.role.name.lower()

    # --- ROLE-BASED VISIBILITY LOGIC ---
    if user_role in ["admin", "superadmin", "darh"]:
        pass # Administrative oversight: See everything
        
    elif user_role == "chef":
        # See own requests OR requests from staff in their specific service
        query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                     .filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.User.service_id == current_user.service_id))
                                 
    elif user_role == "charoi":
        # See own requests OR requests ready for asset allocation (Approved by Chef)
        query = query.filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.VehicleRequest.status == "approved_by_chef"))
                                 
    elif user_role == "logistic":
        # UPGRADED: Logistic can see items waiting for Charoi (to help assign) 
        # AND items waiting for Logistic approval
        query = query.filter(or_(
            models.VehicleRequest.requester_id == current_user.id,
            models.VehicleRequest.status.in_(["approved_by_chef", "approved_by_charoi"])
        ))
        
    else:
        # Standard Users and Drivers: See only requests they are involved in
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)

    return query.order_by(models.VehicleRequest.id.desc()).offset(skip).limit(limit).all()


# =================================================================
# 2. CREATE REQUEST (Matricule & Passenger Integrity)
# =================================================================
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleRequestOut)
def create_request(
    request_data: schemas.VehicleRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Logic: Ensure the requester's matricule is always present in the manifest
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
        status="pending"
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request


# =================================================================
# 3. ASSIGN / MODIFY RESOURCES (Professional Edit Logic)
# =================================================================
@router.put("/{id}/assign", response_model=schemas.VehicleRequestOut)
def assign_vehicle_and_driver(
    id: int,
    assignment_data: schemas.RequestAssignment, 
    db: Session = Depends(get_db),
    # Logistic, DARH, and Admins are now permitted to Modify/Assign
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "charoi", "darh", "logistic"]))
):
    req = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Rule: Cannot modify if already Denied or Fully Completed (unless Superadmin)
    if req.status in ["denied", "completed"] and current_user.role.name.lower() not in ["admin", "superadmin"]:
         raise HTTPException(status_code=400, detail="Cannot modify a closed or denied request.")

    # 1. Update Assets
    req.vehicle_id = assignment_data.vehicle_id
    req.driver_id = assignment_data.driver_id

    # 2. Update Passenger List (Matricules) if provided
    if hasattr(assignment_data, 'passengers') and assignment_data.passengers is not None:
        req.passengers = assignment_data.passengers
        flag_modified(req, "passengers") # Forces SQLAlchemy to track changes in JSON type

    # 3. SMART STATUS TRANSITION
    # If the request was waiting for Charoi (approved_by_chef), 
    # move it to the next stage (approved_by_charoi) now that assets are assigned.
    if req.status == "approved_by_chef":
        req.status = "approved_by_charoi"
    
    # Note: if it's already 'approved_by_charoi' or higher, we just updated the 
    # assets (Editing) without regressing the status.

    db.commit()
    db.refresh(req)
    return req


# =================================================================
# 4. HELPER: GET DRIVERS (For UI Select Inputs)
# =================================================================
@router.get("/drivers", response_model=List[schemas.UserSimpleOut])
def get_active_drivers(db: Session = Depends(get_db)):
    """
    Returns a list of all active users with the 'Driver' role.
    Used by Logistic/Charoi/Admin during the Assignment phase.
    """
    return db.query(models.User).join(models.Role).filter(
        models.Role.name.ilike("driver"),
        models.User.is_active == True
    ).all()