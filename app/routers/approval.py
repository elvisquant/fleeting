from fastapi import APIRouter, Depends, status, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified
from app import models, schemas, oauth2
from app.database import get_db
from fastapi.responses import StreamingResponse
from app.utils.pdf_generator import generate_mission_order_pdf
from app.utils.mailer import (
    send_mission_order_email, send_rejection_email, 
    send_driver_assignment_email, send_accounting_email
)

router = APIRouter(prefix="/api/v1/approvals", tags=['Approvals API'])

@router.post("/{request_id}", response_model=schemas.VehicleRequestOut)
def submit_approval(
    request_id: int,
    approval_data: schemas.RequestApprovalUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role(["chef", "charoi", "logistic", "darh", "admin", "superadmin"]))
):
    # 1. Fetch Request with ALL relationships to get Make/Model names instead of IDs
    db_request = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester),
        joinedload(models.VehicleRequest.driver),
        joinedload(models.VehicleRequest.vehicle).joinedload(models.Vehicle.vehicle_make),
        joinedload(models.VehicleRequest.vehicle).joinedload(models.Vehicle.vehicle_model)
    ).filter(models.VehicleRequest.id == request_id).first()
    
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found.")

    user_role = current_user.role.name.lower()
    decision = approval_data.status.lower()

    # Optional update of passengers during approval
    if hasattr(approval_data, 'passengers') and approval_data.passengers is not None:
        if user_role != "chef":
            db_request.passengers = approval_data.passengers
            flag_modified(db_request, "passengers")

    if decision == "denied":
        db_request.status = models.RequestStatus.DENIED
        db_request.rejection_reason = approval_data.comments
        db.commit()
        return db_request

    # Workflow Step Logic
    step_num = 0
    if user_role == "chef":
        if str(db_request.status).lower() != "pending":
            raise HTTPException(status_code=400, detail="Must be PENDING.")
        db_request.status = models.RequestStatus.APPROVED_BY_CHEF
        step_num = 1
        
    elif user_role == "charoi":
        if str(db_request.status).lower() != "approved_by_chef":
            raise HTTPException(status_code=400, detail="Chef must approve first.")
        if not db_request.vehicle_id or not db_request.driver_id:
            raise HTTPException(status_code=400, detail="Vehicle and Driver must be assigned first.")
        db_request.status = models.RequestStatus.APPROVED_BY_CHAROI
        step_num = 2
        
    elif user_role == "logistic":
        if str(db_request.status).lower() != "approved_by_charoi":
            raise HTTPException(status_code=400, detail="Charoi must approve first.")
        db_request.status = models.RequestStatus.APPROVED_BY_LOGISTIC
        step_num = 3
        
    elif user_role in ["darh", "admin", "superadmin"]:
        # Allow DARH/Admin to finalize if at Logistic step
        if str(db_request.status).lower() != "approved_by_logistic":
            raise HTTPException(status_code=400, detail="Logistic must approve first.")
        
        db_request.status = models.RequestStatus.FULLY_APPROVED
        step_num = 4
        
        # --- FINALIZATION (Generate PDF for Emails) ---
        # Fetch actual user objects for signatories to get real names from DB
        log_off = db.query(models.User).join(models.Role).filter(models.Role.name.ilike("logistic")).first()
        darh_off = db.query(models.User).join(models.Role).filter(models.Role.name.ilike("darh")).first()
        passenger_users = db.query(models.User).filter(models.User.matricule.in_(db_request.passengers)).all()
        
        pdf_buffer = generate_mission_order_pdf(
            request=db_request, 
            passenger_details=passenger_users,
            logistic_officer=log_off,
            darh_officer=darh_off
        )
        pdf_bytes = pdf_buffer.getvalue()
        filename = f"Mission_{db_request.id}.pdf"

        # Background Emails
        if db_request.requester.email:
            background_tasks.add_task(send_mission_order_email, email_to=db_request.requester.email, requester_name=db_request.requester.full_name, pdf_file=pdf_bytes, filename=filename)
        background_tasks.add_task(send_driver_assignment_email, email_to="charoi-office@company.com", driver_name=db_request.driver.full_name, requester_name=db_request.requester.full_name, destination=db_request.destination, pdf_file=pdf_bytes, filename=filename)
        background_tasks.add_task(send_accounting_email, pdf_file=pdf_bytes, filename=filename, request_id=db_request.id)

    # Record the approval history
    db.add(models.RequestApproval(
        request_id=request_id, approver_id=current_user.id, 
        approval_step=step_num, status=models.ApprovalStatus.APPROVED, 
        comments=approval_data.comments
    ))
    db.commit()
    db.refresh(db_request)
    return db_request

@router.get("/{request_id}/pdf")
def get_pdf(request_id: int, db: Session = Depends(get_db)):
    # Fetch with full relationships to resolve Make/Model IDs into Names
    request = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.vehicle).joinedload(models.Vehicle.vehicle_make),
        joinedload(models.VehicleRequest.vehicle).joinedload(models.Vehicle.vehicle_model),
        joinedload(models.VehicleRequest.driver)
    ).filter(models.VehicleRequest.id == request_id).first()
    
    if not request:
        raise HTTPException(status_code=404, detail="Request not found.")
    
    # Case-insensitive check for fully approved status
    if str(request.status).lower() != "fully_approved":
        raise HTTPException(status_code=400, detail="Mission order is not fully approved yet.")
    
    # Fetch Signatories
    log_off = db.query(models.User).join(models.Role).filter(models.Role.name.ilike("logistic")).first()
    darh_off = db.query(models.User).join(models.Role).filter(models.Role.name.ilike("darh")).first()
    passenger_users = db.query(models.User).filter(models.User.matricule.in_(request.passengers)).all()

    pdf_buffer = generate_mission_order_pdf(
        request=request, 
        passenger_details=passenger_users,
        logistic_officer=log_off,
        darh_officer=darh_off
    )
    
    return StreamingResponse(pdf_buffer, media_type="application/pdf")