# app/routers/approval.py

from fastapi import APIRouter, Depends, status, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from app import models, schemas, oauth2
from app.database import get_db

# Optional email import
# from app.email import send_request_status_email

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
    """
    Submits an approval. Updates status based on step.
    Step 1: Chef -> approved_by_chef
    Step 2: Logistic -> approved_by_logistic
    Step 3: Charoi -> fully_approved
    """
    # 1. Find request
    db_request = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == request_id).first()
    if not db_request:
        raise HTTPException(status_code=404, detail="Request not found.")

    # 2. Determine Step
    user_role = current_user.role.name.lower()
    approval_step = 0
    if user_role == "chef":
        approval_step = 1
        # Validate Chef Service matches Request Service
        # (Assuming you want Chef to only approve their own service requests)
        if current_user.service_id != db_request.requester.service_id:
             raise HTTPException(status_code=403, detail="You can only approve requests for your service.")

    elif user_role == "logistic":
        approval_step = 2
    elif user_role in ["charoi", "admin", "superadmin"]:
        approval_step = 3
    
    if approval_step == 0:
         raise HTTPException(status_code=403, detail="Role not authorized for approval.")

    # 3. Validation: Ensure previous step is done
    if approval_step == 2 and db_request.status != "approved_by_chef":
        raise HTTPException(status_code=400, detail="Request must be approved by Chef first.")
    if approval_step == 3 and db_request.status != "approved_by_logistic":
        # Admin can override, but standard flow requires logistic first
        if user_role not in ["admin", "superadmin"]: 
             raise HTTPException(status_code=400, detail="Request must be approved by Logistics first.")

    # 4. Check for duplicate approval
    existing = db.query(models.RequestApproval).filter(
        models.RequestApproval.request_id == request_id,
        models.RequestApproval.approval_step == approval_step
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already processed this step.")

    # 5. Create Approval Record
    new_approval = models.RequestApproval(
        request_id=request_id,
        approver_id=current_user.id,
        approval_step=approval_step,
        status=approval_data.status.lower(),
        comments=approval_data.comments
    )
    db.add(new_approval)

    # 6. Update Main Status
    status_map = {
        1: "approved_by_chef",
        2: "approved_by_logistic",
        3: "fully_approved"
    }

    if approval_data.status.lower() == "denied":
        db_request.status = "denied"
        # Optional: Save reason in comments or rejection_reason
        db_request.rejection_reason = approval_data.comments
        # Send Email (Denied)
        # background_tasks.add_task(send_request_status_email, db_request.requester.email, "Denied", approval_data.comments)
        
    elif approval_data.status.lower() == "approved":
        new_status = status_map.get(approval_step)
        if new_status:
            db_request.status = new_status
            # Send Email (Fully Approved)
            if new_status == "fully_approved":
                 pass
                 # background_tasks.add_task(send_request_status_email, db_request.requester.email, "Approved", "Your vehicle request is confirmed.")

    db.commit()
    db.refresh(db_request)
    
    return db_request