# app/routers/request.py

from fastapi import APIRouter, Depends, status, HTTPException, Response, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List
from datetime import datetime
from app.schemas import operations

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/requests",
    tags=['Requests API']
)

# --- CREATE ---
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=schemas.VehicleRequestOut)
def create_request(
    request_data: schemas.VehicleRequestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    # --- LOGIC START: AUTO-ADD REQUESTER ---
    
    # 1. Get the list provided by the user (or empty list if None)
    passenger_list = request_data.passengers if request_data.passengers else []

    # 2. Add the Current User's Matricule if not already in the list
    if current_user.matricule:
        # Avoid duplicates
        if current_user.matricule not in passenger_list:
            passenger_list.append(current_user.matricule)
    else:
        # Optional: If the current user has no matricule, you might want to warn them
        # or just proceed. For now, we proceed.
        pass

    # 3. VALIDATE PASSENGERS (Matricules)
    if passenger_list:
        # Check against 'matricule' in DB
        existing_users = db.query(models.User).filter(
            models.User.matricule.in_(passenger_list)
        ).all()
        
        found_matricules = {u.matricule for u in existing_users}
        
        # Find which ones are missing
        missing = [m for m in passenger_list if m not in found_matricules]
        
        if missing:
            raise HTTPException(
                status_code=400, 
                detail=f"The following passenger matricules do not exist: {', '.join(missing)}"
            )

    # 4. Create the Request
    new_request = models.VehicleRequest(
        destination=request_data.destination,
        description=request_data.description,
        
        # Mapping frontend names to DB names
        departure_time=request_data.departure_time, 
        return_time=request_data.return_time,      
        
        # Use the updated list including the requester
        passengers=passenger_list,
        requester_id=current_user.id,
        status="pending"
    )
    db.add(new_request)
    db.commit()
    db.refresh(new_request)
    return new_request

# --- REJECT ---
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

# --- COUNT ---
@router.get("/count/pending", response_model=schemas.PendingRequestsCount)
def get_pending_requests_count(db: Session = Depends(get_db)):
    count = db.query(models.VehicleRequest).filter(models.VehicleRequest.status == "pending").count()
    return {"count": count}

# --- GET ALL ---
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

    user_role = current_user.role.name.lower() if current_user.role else ""

    if user_role == "chef":
        if current_user.service_id:
            query = query.join(models.User, models.VehicleRequest.requester_id == models.User.id)\
                         .filter(models.User.service_id == current_user.service_id)
        else:
            return []
    elif user_role == "logistic":
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_chef", "approved_by_logistic", "fully_approved", "in_progress", "completed"]))
    elif user_role == "charoi":
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_logistic", "fully_approved", "in_progress", "completed"]))
    elif user_role == "driver":
        query = query.filter(models.VehicleRequest.driver_id == current_user.id)
    # Regular users see their own
    elif user_role == "user":
        query = query.filter(models.VehicleRequest.requester_id == current_user.id)
    
    return query.order_by(models.VehicleRequest.created_at.desc()).limit(limit).offset(skip).all()