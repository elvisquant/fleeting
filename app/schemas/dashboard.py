# Analytics, KPI

from typing import List, Optional
from datetime import datetime, date
from pydantic import BaseModel
from .users import UserOut
from .vehicles import VehicleNestedInTrip

# --- KPI ---
class KPIStats(BaseModel):
    total_vehicles: int
    planned_trips: int
    repairs_this_month: int
    fuel_cost_this_week: float
    total_purchase_cost: float  # Ensure this is here

# --- INSIGHTS ---
class FuelEfficiencyData(BaseModel):
    current_month_volume: float
    last_month_volume: float
    percentage_change: Optional[float] = None
    trend: Optional[str] = None 

class MaintenanceComplianceData(BaseModel):
    total_maintenance_records: int

class PerformanceInsightsResponse(BaseModel):
    fuel_efficiency: FuelEfficiencyData
    maintenance_compliance: MaintenanceComplianceData

# --- ALERTS ---
""" class AlertItem(BaseModel):
    plate_number: Optional[str] = "N/A"
    message: Optional[str] = "N/A"
    entity_type: str 
    status: Optional[str] = "N/A"
     """
class AlertItem(BaseModel):
    plate_number: str
    message: str
    entity_type: str  # 'panne', 'trip', 'maintenance'
    status: str

class AlertsResponse(BaseModel):
    critical_panne: Optional[AlertItem] = None
    maintenance_alert: Optional[AlertItem] = None
    trip_alert: Optional[AlertItem] = None
    total_alerts: int = 0

# --- CHARTS ---
class MonthlyActivityChartData(BaseModel):
    labels: List[str]
    trips: List[int]
    maintenances: List[int]
    pannes: List[int]

class VehicleStatusChartData(BaseModel):
    labels: List[str]
    counts: List[int]

# --- DRIVERS ---
class TopDriver(BaseModel):
    driver_id: int
    first_name: str
    last_name: str
    performance_metric: str 
    class Config: from_attributes = True

class DriverNestedInTrip(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    class Config: from_attributes = True

# --- EXPENSES ---
class MonthlyExpenseItem(BaseModel):
    month_year: str
    fuel_cost: float = 0.0
    reparation_cost: float = 0.0
    maintenance_cost: float = 0.0
    purchase_cost: float = 0.0

class AnalyticsExpenseSummaryResponse(BaseModel):
    total_fuel_cost: float
    total_reparation_cost: float
    total_maintenance_cost: float
    total_vehicle_purchase_cost: float
    monthly_breakdown: List[MonthlyExpenseItem]

# --- TRIP ---
class TripBase(BaseModel):
    vehicle_id: int
    driver_id: int
    start_location: str
    end_location: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str = "planned"
    # --- NEW OPTIONAL FIELDS ---
    purpose: Optional[str] = None
    notes: Optional[str] = None
    # --- END NEW OPTIONAL FIELDS ---

class TripCreate(TripBase):
    pass # Inherits all from TripBase, including new fields

class TripUpdate(TripBase): # For PUT, allow partial updates
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None
    start_location: Optional[str] = None
    end_location: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = None
    # --- NEW OPTIONAL FIELDS ---
    purpose: Optional[str] = None
    notes: Optional[str] = None
    # --- END NEW OPTIONAL FIELDS ---
class TripResponse(BaseModel):
    id: int
    vehicle_id: int
    driver_id: int
    start_location: Optional[str] = None
    end_location: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: str
    purpose: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    vehicle: Optional[VehicleNestedInTrip] = None
    driver: Optional[DriverNestedInTrip] = None
    class Config: from_attributes = True

# --- REPORTS ---
class FuelRecordDetail(BaseModel):
    id: int
    vehicle_plate: Optional[str] = "N/A"
    date: datetime 
    quantity: float
    cost: float
    notes: Optional[str] = None
    class Config: from_attributes = True

class ReparationRecordDetail(BaseModel):
    id: int
    vehicle_plate: Optional[str] = "N/A"
    repair_date: date
    description: str
    cost: float
    provider: Optional[str] = None
    class Config: from_attributes = True

class MaintenanceRecordDetail(BaseModel):
    id: int
    vehicle_plate: Optional[str] = "N/A"
    maintenance_date: date
    description: str
    maintenance_cost: float
    provider: Optional[str] = None
    class Config: from_attributes = True

class PurchaseRecordDetail(BaseModel):
    id: int
    plate_number: str
    make: Optional[str] = "N/A"
    model: Optional[str] = "N/A"
    purchase_date: Optional[date] = None
    purchase_price: Optional[float] = 0.0
    class Config: from_attributes = True

class DetailedReportDataResponse(BaseModel):
    fuel_records: List[FuelRecordDetail] = []
    reparation_records: List[ReparationRecordDetail] = []
    maintenance_records: List[MaintenanceRecordDetail] = []
    purchase_records: List[PurchaseRecordDetail] = []