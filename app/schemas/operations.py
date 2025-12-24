from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict

# Helper for driver info
class DriverNestedInRequest(BaseModel):
    id: int
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

# Approval Output
class RequestApprovalOut(BaseModel):
    id: int
    approval_step: int
    status: str
    comments: Optional[str] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

# Base Request
class VehicleRequestBase(BaseModel):
    destination: str
    description: Optional[str] = None
    departure_time: datetime 
    return_time: datetime
    passengers: List[str] = [] 

class VehicleRequestCreate(VehicleRequestBase):
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None

class RequestAssignment(BaseModel):
    vehicle_id: int
    driver_id: int

class RequestApprovalUpdate(BaseModel):
    status: str 
    comments: Optional[str] = None

# Main Output Schema
class VehicleRequestOut(VehicleRequestBase):
    id: int
    status: str
    requester_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    created_at: datetime
    rejection_reason: Optional[str] = None
    
    # Relationships (Must be Optional to prevent 500 errors)
    requester: Optional[dict] = None # Using dict temporarily for safety
    vehicle: Optional[dict] = None
    driver: Optional[DriverNestedInRequest] = None
    approvals: List[RequestApprovalOut] = []
    
    model_config = ConfigDict(from_attributes=True)