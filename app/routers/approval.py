from fastapi import APIRouter, Depends, status, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from app import models, schemas, oauth2
from app.database import get_db
from app.utils.pdf_generator import generate_mission_order_pdf
from app.utils.mailer import send_mission_order_email, send_rejection_email, send_driver_assignment_email

router = APIRouter(prefix="/api/v1/approvals", tags=['Approvals API'])

@router.post("/{request_id}", response_model=schemas.VehicleRequestOut)
def submit_approval(
    request_id: int,
    approval_data: schemas.RequestApprovalUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["chef", "logistic", "charoi", "admin", "superadmin"]))
):
    
    # 1. Fetch Request with Relational Data
    db_request = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.vehicle), # Ensure this is here
        joinedload(models.VehicleRequest.driver)
    ).filter(models.VehicleRequest.id == request_id).first()
    
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found.")

    user_role = current_user.role.name.lower()
    approval_step = 0
    if user_role == "chef": approval_step = 1
    elif user_role == "logistic": approval_step = 2
    elif user_role in ["charoi", "admin", "superadmin"]: approval_step = 3
    
    # Sequence Validation
    if approval_step == 2 and db_request.status != "approved_by_chef":
        raise HTTPException(status_code=400, detail="Chef approval required.")
    if approval_step == 3 and db_request.status != "approved_by_logistic":
        if user_role not in ["admin", "superadmin"]:
            raise HTTPException(status_code=400, detail="Logistics approval required.")

    # Logic for DECISION
    decision = approval_data.status.lower()
    
    if decision == "denied":
        db_request.status = "denied"
        db_request.rejection_reason = approval_data.comments
        # Background: Send Rejection Email
        if db_request.requester.email:
            background_tasks.add_task(send_rejection_email, email_to=db_request.requester.email, requester_name=db_request.requester.full_name, request_id=db_request.id, reason=approval_data.comments, approver_name=current_user.full_name)
            
    elif decision == "approved":
        # MANDATORY ASSIGNMENT CHECK FOR FINAL STEP
        if approval_step == 3:
            if not db_request.vehicle_id or not db_request.driver_id:
                raise HTTPException(status_code=400, detail="Vehicle and Driver must be assigned before final approval.")
        
        status_map = { 1: "approved_by_chef", 2: "approved_by_logistic", 3: "fully_approved" }
        db_request.status = status_map[approval_step]

        if db_request.status == "fully_approved":
            # Generate PDF and Send Success Emails
            passenger_details = db.query(models.User).filter(models.User.matricule.in_(db_request.passengers)).all() if db_request.passengers else []
            pdf_buffer = generate_mission_order_pdf(request=db_request, approver_name=current_user.full_name, passenger_details=passenger_details)
            pdf_bytes = pdf_buffer.getvalue()
            filename = f"Mission_Order_{db_request.id}.pdf"

            if db_request.requester.email:
                background_tasks.add_task(send_mission_order_email, email_to=db_request.requester.email, requester_name=db_request.requester.full_name, pdf_file=pdf_bytes, filename=filename)
            if db_request.driver and db_request.driver.email:
                background_tasks.add_task(send_driver_assignment_email, email_to=db_request.driver.email, driver_name=db_request.driver.full_name, requester_name=db_request.requester.full_name, destination=db_request.destination, pdf_file=pdf_bytes, filename=filename)

    # Record the approval
    db.add(models.RequestApproval(request_id=request_id, approver_id=current_user.id, approval_step=approval_step, status=decision, comments=approval_data.comments))
    db.commit()
    db.refresh(db_request)
    return db_request