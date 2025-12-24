from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from .users import UserOut, UserSimpleOut
from .vehicles import VehicleOut

class DriverNestedInRequest(BaseModel):
    id: int
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class RequestApprovalOut(BaseModel):
    id: int
    approval_step: int
    status: str
    comments: Optional[str] = None
    updated_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

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

class VehicleRequestOut(VehicleRequestBase):
    id: int
    status: str
    requester_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    created_at: datetime
    rejection_reason: Optional[str] = None
    requester: Optional[UserOut] = None
    vehicle: Optional[VehicleOut] = None
    driver: Optional[DriverNestedInRequest] = None
    approvals: List[RequestApprovalOut] = []
    
    model_config = ConfigDict(from_attributes=True)