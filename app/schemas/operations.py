# app/schemas/operations.py (or wherever you keep this schema)

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
# Assuming these imports exist in your project structure
from .users import UserResponse, UserSimpleOut 
from .vehicles import VehicleOut

class RequestApprovalUpdate(BaseModel):
    status: str
    comments: Optional[str] = None
    class Config: from_attributes = True

class RequestApprovalOut(BaseModel):
    id: int
    approval_step: int
    status: str
    comments: Optional[str] = None
    approver: Optional[UserSimpleOut] = None
    updated_at: Optional[datetime] = None
    class Config: from_attributes = True

class RequestBase(BaseModel):
    purpose: str
    from_location: str
    to_location: str
    departure_time: datetime
    return_time: datetime
    
    # --- NEW FIELD ---
    # List of people (matricules or names)
    passengers: List[str] = [] 

class VehicleRequestCreate(RequestBase):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    class Config: from_attributes = True

class RequestCreate(VehicleRequestCreate): 
    pass

class VehicleRequestUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    class Config: from_attributes = True



class VehicleRequestReject(BaseModel):
    rejection_reason: str

class VehicleRequestAssignmentUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None

# --- NEW SCHEMA FOR REJECTION ---
class VehicleRequestReject(BaseModel):
    rejection_reason: str

class VehicleRequestOut(RequestBase):
    id: int
    roadmap: Optional[str] = None
    status: str
    created_at: datetime
    
    # --- NEW FIELD ---
    rejection_reason: Optional[str] = None

    requester: Optional[UserResponse] = None
    vehicle: Optional[VehicleOut] = None
    driver: Optional[UserResponse] = None
    approvals: List[RequestApprovalOut] = []
    
    class Config: from_attributes = True

class RequestOut(VehicleRequestOut):
    user: Optional[UserResponse] = Field(None, alias="requester")

class PendingRequestsCount(BaseModel):
    count: int