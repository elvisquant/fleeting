from typing import List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field

# Ensure these imports match your actual file structure
from .users import UserResponse, UserSimpleOut, UserOut
from .vehicles import VehicleOut  # Assuming VehicleNestedInTrip might not exist, VehicleOut is safer

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
    departure_time: datetime 
    return_time: datetime
    passengers: List[str] = [] 

class VehicleRequestCreate(VehicleRequestBase):
    # Optional fields used only during creation if passed
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None

# --- THIS IS THE KEY SCHEMA YOU ASKED ABOUT ---
# It is required for the Assign Endpoint
class RequestAssignment(BaseModel):
    vehicle_id: int
    driver_id: int

class VehicleRequestUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    status: Optional[str] = None
    class Config: 
        from_attributes = True

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
    
    # Relationships
    requester: Optional[UserOut] = None
    vehicle: Optional[VehicleOut] = None # Changed to VehicleOut to be safe
    driver: Optional[DriverNestedInRequest] = None
    approvals: List[RequestApprovalOut] = []
    
    class Config: 
        from_attributes = True

class PendingRequestsCount(BaseModel):
    count: int