# In app/routers/approval.py

from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas, oauth2
from ..database import get_db

router = APIRouter(
    prefix="/api/v1/approvals",
    tags=['Approvals API']
)

@router.post("/{request_id}", response_model=schemas.VehicleRequestOut)
def submit_approval(
    request_id: int,
    approval_data: schemas.RequestApprovalUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_role([
        "chef", "logistic", "charoi", "admin", "superadmin"
    ]))
):
    """
    Submits an approval decision and updates the request's status to reflect
    the real-time progress of the approval chain.
    """
    # 1. Find the request.
    db_request = db.query(models.VehicleRequest).filter(models.VehicleRequest.id == request_id).first()
    if not db_request:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Request with ID {request_id} not found.")

    # 2. Determine the approval step.
    user_role = current_user.role.name.lower()
    approval_step = 0
    if user_role == "chef":
        approval_step = 1
    elif user_role == "logistic":
        approval_step = 2
    elif user_role in ["charoi", "admin", "superadmin"]:
        approval_step = 3
    
    if approval_step == 0:
         raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Your role is not configured for approvals.")

    # 3. Check for existing approval for this step.
    existing_approval = db.query(models.RequestApproval).filter(
        models.RequestApproval.request_id == request_id,
        models.RequestApproval.approval_step == approval_step
    ).first()

    if existing_approval:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Approval step {approval_step} has already been processed.")

    # 4. Create the new approval record.
    new_approval = models.RequestApproval(
        request_id=request_id,
        approver_id=current_user.id,
        approval_step=approval_step,
        status=approval_data.status.lower(),
        comments=approval_data.comments
    )
    db.add(new_approval)

    # 5. Update the main request's status using the now-valid ENUM values.
    if approval_data.status.lower() == "denied":
        db_request.status = "denied"
    elif approval_data.status.lower() == "approved":
        if approval_step == 1:
            db_request.status = "approved_by_chef"
        elif approval_step == 2:
            db_request.status = "approved_by_logistic"
        elif approval_step == 3:
            db_request.status = "fully_approved"

    db.commit()
    
    # Reload the full request object to return to the frontend.
    final_request = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.requester).joinedload(models.User.service),
        joinedload(models.VehicleRequest.approvals).joinedload(models.RequestApproval.approver)
    ).filter(models.VehicleRequest.id == request_id).first()

    return final_request