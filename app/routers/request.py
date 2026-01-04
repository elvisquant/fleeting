from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy import or_
from typing import List
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(prefix="/api/v1/requests", tags=['Requests API'])

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
        joinedload(models.VehicleRequest.driver)
    )
    
    user_role = current_user.role.name.lower()

    # Visibility Logic
    if user_role in ["admin", "superadmin", "darh"]:
        pass 
    elif user_role == "chef":
        query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                     .filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.User.service_id == current_user.service_id))
    elif user_role == "charoi":
        query = query.filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.VehicleRequest.status == models.RequestStatus.APPROVED_BY_CHEF))
    elif user_role == "logistic":
        query = query.filter(or_(models.VehicleRequest.requester_id == current_user.id,
                                 models.VehicleRequest.status == models.RequestStatus.APPROVED_BY_CHAROI))
    else:
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)

    # Order by newest first and handle pagination
    return query.order_by(models.VehicleRequest.id.desc()).offset(skip).limit(limit).all()

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleRequestOut)
def create_request(
    request_data: schemas.VehicleRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # Ensure matricules are used. Add requester's matricule if not present.
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
        status=models.RequestStatus.PENDING
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

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

    # Update Matricule list if the assigner modifies it
    if hasattr(assignment_data, 'passengers') and assignment_data.passengers is not None:
        req.passengers = assignment_data.passengers
        flag_modified(req, "passengers")

    req.vehicle_id = assignment_data.vehicle_id
    req.driver_id = assignment_data.driver_id
    
    db.commit()
    db.refresh(req)
    return req