# app/routers/approval.py

from fastapi import APIRouter, Depends, status, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db
from app.utils.pdf_generator import generate_mission_order_pdf
# --- IMPORT BOTH EMAIL FUNCTIONS ---
from app.utils.request_notification import send_mission_order_email, send_rejection_email

router = APIRouter(
    prefix="/api/v1/approvals",
    tags=['Approvals API']
)

@router.post("/{request_id}", response_model=schemas.VehicleRequestOut)
def submit_approval(
    request_id: int,
    approval_data: schemas.RequestApprovalUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role([
        "chef", "logistic", "charoi", "admin", "superadmin"
    ]))
):
    # 1. Fetch Request with Relational Data
    db_request = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.vehicle),
        joinedload(models.VehicleRequest.driver)
    ).filter(models.VehicleRequest.id == request_id).first()
    
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found.")

    # 2. Logic to determine step
    user_role = current_user.role.name.lower()
    approval_step = 0
    
    if user_role == "chef":
        approval_step = 1
        if current_user.service_id != db_request.requester.service_id:
             raise HTTPException(status_code=403, detail="You can only approve requests for your service.")
    elif user_role == "logistic":
        approval_step = 2
    elif user_role in ["charoi", "admin", "superadmin"]:
        approval_step = 3
    
    if approval_step == 0:
         raise HTTPException(status_code=403, detail="Role not authorized.")

    # Check Sequence
    if approval_step == 2 and db_request.status != "approved_by_chef":
        raise HTTPException(status_code=400, detail="Request must be approved by Chef first.")
    if approval_step == 3 and db_request.status != "approved_by_logistic":
        if user_role not in ["admin", "superadmin"]: 
             raise HTTPException(status_code=400, detail="Request must be approved by Logistics first.")

    # Check Duplicates
    existing = db.query(models.RequestApproval).filter(
        models.RequestApproval.request_id == request_id,
        models.RequestApproval.approval_step == approval_step
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already processed this step.")

    # Create Approval Record
    new_approval = models.RequestApproval(
        request_id=request_id,
        approver_id=current_user.id,
        approval_step=approval_step,
        status=approval_data.status.lower(),
        comments=approval_data.comments
    )
    db.add(new_approval)

    # Status Mapping
    status_map = { 1: "approved_by_chef", 2: "approved_by_logistic", 3: "fully_approved" }

    # --- CASE 1: DENIED ---
    if approval_data.status.lower() == "denied":
        db_request.status = "denied"
        db_request.rejection_reason = approval_data.comments
        
        # Send Rejection Email
        recipient = db_request.requester.email
        if recipient:
            background_tasks.add_task(
                send_rejection_email,
                email_to=recipient,
                requester_name=db_request.requester.full_name,
                request_id=db_request.id,
                reason=approval_data.comments or "No specific reason provided.",
                approver_name=current_user.full_name
            )

    # --- CASE 2: APPROVED ---
    elif approval_data.status.lower() == "approved":
        new_status = status_map.get(approval_step)
        if new_status:
            db_request.status = new_status
            
            # Send Approval Email (Only if Fully Approved)
            if new_status == "fully_approved":
                
                # Fetch Passengers
                passenger_matricules = db_request.passengers if db_request.passengers else []
                passenger_details = []
                if passenger_matricules:
                    passenger_details = db.query(models.User).options(
                        joinedload(models.User.agency),
                        joinedload(models.User.service),
                        joinedload(models.User.role)
                    ).filter(models.User.matricule.in_(passenger_matricules)).all()

                # Generate PDF
                pdf_buffer = generate_mission_order_pdf(
                    request=db_request, 
                    approver_name=current_user.full_name,
                    passenger_details=passenger_details
                )
                
                # Send Email
                recipient = db_request.requester.email
                if recipient:
                    background_tasks.add_task(
                        send_mission_order_email,
                        email_to=recipient,
                        requester_name=db_request.requester.full_name,
                        pdf_file=pdf_buffer.getvalue(),
                        filename=f"Mission_Order_{db_request.id}.pdf"
                    )

    db.commit()
    db.refresh(db_request)
    
    return db_request