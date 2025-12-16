from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field

from .users import UserResponse, UserSimpleOut, UserOut
from .vehicles import VehicleOut, VehicleNestedInTrip

# --- HELPER SCHEMAS ---

class DriverNestedInRequest(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    class Config: 
        from_attributes = True

# --- VEHICLE REQUESTS ---

class VehicleRequestBase(BaseModel):
    destination: str
    description: Optional[str] = None
    
    # Matching the new Model fields
    departure_time: datetime 
    return_time: datetime
    
    passengers: List[str] = [] 

class VehicleRequestCreate(VehicleRequestBase):
    # Optional fields for assignment during creation if needed
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None

class VehicleRequestUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    status: Optional[str] = None
    class Config: 
        from_attributes = True

class VehicleRequestAssignmentUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    status: Optional[str] = None

class VehicleRequestReject(BaseModel):
    rejection_reason: str

# --- APPROVALS ---

class RequestApprovalUpdate(BaseModel):
    status: str # "approved" or "denied"
    comments: Optional[str] = None

class RequestApprovalOut(BaseModel):
    id: int
    approval_step: int
    status: str
    comments: Optional[str] = None
    approver: Optional[UserSimpleOut] = None
    updated_at: Optional[datetime] = None
    class Config: 
        from_attributes = True

# --- OUTPUT SCHEMAS ---

class VehicleRequestOut(VehicleRequestBase):
    id: int
    status: str
    requester_id: int
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    created_at: datetime
    rejection_reason: Optional[str] = None
    roadmap: Optional[str] = None
    
    # Relationships
    requester: Optional[UserOut] = None
    vehicle: Optional[VehicleNestedInTrip] = None
    driver: Optional[DriverNestedInRequest] = None
    approvals: List[RequestApprovalOut] = []
    
    class Config: 
        from_attributes = True

class RequestOut(VehicleRequestOut):
    # Alias for specific use cases if needed
    user: Optional[UserResponse] = Field(None, alias="requester")

class PendingRequestsCount(BaseModel):
    count: int