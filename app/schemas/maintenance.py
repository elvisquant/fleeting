 # Garage, Pannes, Repairs
from typing import List, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
from .vehicles import VehicleOut

class GarageBase(BaseModel):
    nom_garage: str
class GarageCreate(GarageBase): pass
class GarageOut(GarageBase):
    id: int
    class Config: from_attributes = True

class GarageOutForReparation(BaseModel):
    id: int
    nom_garage: Optional[str] = None
    class Config: from_attributes = True

class CategoryMaintenanceBase(BaseModel):
    cat_maintenance: str
class CategoryMaintenanceCreate(CategoryMaintenanceBase): pass
class CategoryMaintenanceOut(CategoryMaintenanceBase):
    id: int
    class Config: from_attributes = True

class MaintenanceBase(BaseModel):
    cat_maintenance_id: Optional[int] = None
    vehicle_id: int
    garage_id: Optional[int] = None
    maintenance_cost: float
    receipt: str
    maintenance_date: datetime
    status: str = "active"

class MaintenanceCreate(MaintenanceBase): pass
class MaintenanceUpdate(BaseModel):
    cat_maintenance_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    garage_id: Optional[int] = None
    maintenance_cost: Optional[float] = None
    receipt: Optional[str] = None
    maintenance_date: Optional[datetime] = None
    status: Optional[str] = None
    is_verified: Optional[bool] = None
    verified_at: Optional[datetime] = None

class MaintenanceOut(MaintenanceBase):
    id: int
    created_at: datetime
    is_verified:bool
    class Config: from_attributes = True

class MaintenanceBulkVerify(BaseModel):
    ids: List[int]

class CategoryPanneBase(BaseModel):
    panne_name: str
class CategoryPanneCreate(CategoryPanneBase): pass
class CategoryPanneOut(CategoryPanneBase):
    id: int
    class Config: from_attributes = True

class PanneBase(BaseModel):
    vehicle_id: int
    category_panne_id: int
    description: Optional[str] = None
    panne_date: datetime
    status: str = "active"
   

class PanneCreate(PanneBase): pass
class PanneUpdate(BaseModel):
    vehicle_id: Optional[int] = None
    category_panne_id: Optional[int] = None
    description: Optional[str] = None
    panne_date: Optional[datetime] = None
    status: Optional[str] = None
   
    is_verified: Optional[bool] = None 
    verified_at: Optional[datetime] = None
    

class PanneOut(PanneBase):
    id: int
    created_at: datetime
    is_verified:bool
    vehicle: Optional[VehicleOut] = None
    category_panne: Optional[CategoryPanneOut] = None
    class Config: from_attributes = True

class PanneOutForReparation(BaseModel):
    id: int
    description: Optional[str] = None
    class Config: from_attributes = True

class PaginatedPanneOut(BaseModel):
    total_count: int
    items: List[PanneOut]

class PanneBulkVerify(BaseModel):
    ids: List[int]

class ReparationStatusEnum(str, Enum):
    IN_PROGRESS = "Inprogress"
    COMPLETED = "Completed"

class ReparationBase(BaseModel):
    panne_id: int
    cost: float = 0.0
    receipt: str
    garage_id: int
    repair_date: datetime
    status: ReparationStatusEnum = ReparationStatusEnum.IN_PROGRESS

class ReparationCreate(ReparationBase): pass
class ReparationUpdate(BaseModel):
    panne_id: Optional[int] = None
    cost: Optional[float] = None
    receipt: Optional[str] = None
    garage_id: Optional[int] = None
    repair_date: Optional[datetime] = None
    status: Optional[ReparationStatusEnum] = None
    
    is_verified: Optional[bool] = None
    verified_at: Optional[datetime] = None

class ReparationResponse(ReparationBase):
    id: int
    panne: Optional[PanneOutForReparation] = None
    garage: Optional[GarageOutForReparation] = None
    is_verified:bool
    class Config: from_attributes = True


class ReparationBulkVerify(BaseModel):
    ids: List[int]














