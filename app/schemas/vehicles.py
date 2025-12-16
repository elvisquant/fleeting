 # Vehicle, Fuel, Types
from typing import Optional,List
from datetime import datetime
from pydantic import BaseModel, Field, computed_field

# --- TYPES ---
class VehicleTypeBase(BaseModel):
    vehicle_type: str
class VehicleTypeCreate(VehicleTypeBase): pass
class VehicleTypeOut(VehicleTypeBase):
    id: int
    class Config: from_attributes = True

class VehicleMakeBase(BaseModel):
    vehicle_make: str
class VehicleMakeCreate(VehicleMakeBase): pass
class VehicleMakeOut(VehicleMakeBase):
    id: int
    class Config: from_attributes = True

class VehicleModelBase(BaseModel):
    vehicle_model: str
class VehicleModelCreate(VehicleModelBase): pass
class VehicleModelOut(VehicleModelBase):
    id: int
    class Config: from_attributes = True

class VehicleTransmissionBase(BaseModel):
    vehicle_transmission: str
class VehicleTransmissionCreate(VehicleTransmissionBase): pass
class VehicleTransmissionOut(VehicleTransmissionBase):
    id: int
    class Config: from_attributes = True

class FuelTypeBase(BaseModel):
    fuel_type: str
class FuelTypeCreate(FuelTypeBase): pass
class FuelTypeOut(FuelTypeBase):
    id: int
    class Config: from_attributes = True

# =================================================================
# VEHICLES
# =================================================================
class VehicleBase(BaseModel):
    plate_number: str
    make: int
    model: int
    year: int
    vin: str
    color: str
    mileage: float
    engine_size: float
    vehicle_type: int
    vehicle_transmission: int
    vehicle_fuel_type: int
    purchase_price: float
    purchase_date: datetime

class VehicleCreate(VehicleBase):
    pass

class VehicleUpdate(BaseModel):
    plate_number: Optional[str] = None
    make: Optional[int] = None
    model: Optional[int] = None
    year: Optional[int] = None
    vin: Optional[str] = None
    color: Optional[str] = None
    mileage: Optional[float] = None
    engine_size: Optional[float] = None
    vehicle_type: Optional[int] = None
    vehicle_transmission: Optional[int] = None
    vehicle_fuel_type: Optional[int] = None
    purchase_price: Optional[float] = None
    purchase_date: Optional[datetime] = None
    status: Optional[str] = None
    # Verification
    is_verified: Optional[bool] = None
    verified_at: Optional[datetime] = None

class VehicleOut(VehicleBase):
    id: int
    status: str
    registration_date: datetime
    is_verified: bool = False
    verified_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class VehicleBulkVerify(BaseModel):
    ids: List[int]


class VehicleNestedInTrip(BaseModel):
    id: int
    plate_number: Optional[str] = None
    @computed_field(return_type=Optional[str])
    @property
    def make(self) -> Optional[str]:
        if hasattr(self, 'make_ref') and self.make_ref: return self.make_ref.vehicle_make
        return None
    @computed_field(return_type=Optional[str])
    @property
    def model(self) -> Optional[str]:
        if hasattr(self, 'model_ref') and self.model_ref: return self.model_ref.vehicle_model
        return None
    class Config: from_attributes = True

# --- FUEL ---
class FuelBase(BaseModel):
    vehicle_id: int
    fuel_type_id: int
    quantity: float
    price_little: float
    cost: float

class FuelCreatePayload(BaseModel):
    vehicle_id: int
    fuel_type_id: int
    quantity: float
    price_little: float


class FuelUpdatePayload(BaseModel):
    vehicle_id: Optional[int] = None
    fuel_type_id: Optional[int] = None
    quantity: Optional[float] = None
    price_little: Optional[float] = None
    # FIX: These must be Optional and default to None so they aren't forced
    is_verified: Optional[bool] = None 
    verified_at: Optional[datetime] = None

class FuelOut(FuelBase):
    id: int
    created_at: datetime
    is_verified:bool
    class Config: from_attributes = True

class FuelBulkVerify(BaseModel):
    ids: List[int]

class CategoryFuelBase(BaseModel):
    fuel_name: str
class CategoryFuelCreate(CategoryFuelBase): pass
class CategoryFuelOut(CategoryFuelBase):
    id: int
    created_at: datetime
    class Config: from_attributes = True


class EligibilityResponse(BaseModel):
    eligible: bool
    message: str


