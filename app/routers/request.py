from fastapi import APIRouter, Depends, status, HTTPException, Response
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, cast, String
from typing import List

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
    # passengers list from schema is saved into JSON column here automatically
    new_request = models.VehicleRequest(
        **request_data.model_dump(), 
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

    # Optional: Check if user has right to reject this specific request
    
    req.status = "rejected"
    req.rejection_reason = rejection_data.rejection_reason
    db.commit()
    db.refresh(req)
    return req

# --- COUNT PENDING ---
@router.get("/count/pending", response_model=schemas.PendingRequestsCount)
def get_pending_requests_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    count = db.query(models.VehicleRequest).filter(
        models.VehicleRequest.status == "pending"
    ).count()
    return {"count": count}

# --- GET ALL ---
@router.get("/", response_model=List[schemas.VehicleRequestOut])
def get_all_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["admin", "superadmin", "logistic", "charoi", "chef"])),
    limit: int = 100, skip: int = 0
):
    query = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester),
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
        # Logistic sees requests approved by chef, or anything past that stage
        query = query.filter(models.VehicleRequest.status.in_(["approved_by_chef", "approved_by_logistic", "on_going", "completed"]))

    elif user_role == "charoi":
        query = query.filter(models.VehicleRequest.status == "approved_by_logistic")
    
    return query.order_by(models.VehicleRequest.created_at.desc()).limit(limit).offset(skip).all()

# --- MY REQUESTS ---
@router.get("/my-requests", response_model=List[schemas.VehicleRequestOut])
def get_my_requests(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    limit: int = 50, skip: int = 0
):
    requests = db.query(models.VehicleRequest)\
        .filter(models.VehicleRequest.requester_id == current_user.id)\
        .options(joinedload(models.VehicleRequest.approvals))\
        .order_by(models.VehicleRequest.created_at.desc())\
        .limit(limit).offset(skip).all()
    return requests

# --- GET ONE ---
@router.get("/{id}", response_model=schemas.VehicleRequestOut)
def get_request_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    req = db.query(models.VehicleRequest)\
        .options(joinedload(models.VehicleRequest.requester), joinedload(models.VehicleRequest.vehicle))\
        .filter(models.VehicleRequest.id == id).first()
    
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Simple authorization check
    is_admin = current_user.role.name.lower() in ["admin", "superadmin", "logistic", "charoi", "chef"]
    is_owner = req.requester_id == current_user.id
    
    if not (is_admin or is_owner):
        raise HTTPException(status_code=403, detail="Not authorized")

    return req