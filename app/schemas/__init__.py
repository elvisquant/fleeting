from .users import (
    Token, TokenData, LoginRequest, UserLogin,
    VerifyUserRequest, EmailRequest, ResetRequest,
    ForgotPasswordRequest, ResetPasswordRequest, PasswordChange,
    AgencyBase, AgencyCreate, AgencyUpdate, AgencyOut,
    ServiceBase, ServiceCreate, ServiceUpdate, ServiceOut,
    RoleBase, RoleCreate, RoleOut,
    UserBase, UserCreate, UserUpdate, UserSimpleOut, UserOut,
    RegisterUserRequest, UserResponse, LoginResponse, RequesterOut
)
from .vehicles import (
    VehicleTypeBase, VehicleTypeCreate, VehicleTypeOut,
    VehicleMakeBase, VehicleMakeCreate, VehicleMakeOut,
    VehicleModelBase, VehicleModelCreate, VehicleModelOut,
    VehicleTransmissionBase, VehicleTransmissionCreate, VehicleTransmissionOut,
    FuelTypeBase, FuelTypeCreate, FuelTypeOut,
    VehicleBase, VehicleCreate, VehicleStatusUpdate, VehicleOut, VehicleSimpleOut, VehicleNestedInTrip,
    FuelBase, FuelCreatePayload, FuelUpdatePayload, FuelOut,
    CategoryFuelBase, CategoryFuelCreate, CategoryFuelOut,
    EligibilityResponse,FuelBulkVerify  
)
from .operations import (
    RequestApprovalUpdate, RequestApprovalOut,
    RequestBase, VehicleRequestCreate, RequestCreate, VehicleRequestUpdate,
    VehicleRequestAssignmentUpdate, VehicleRequestOut, RequestOut, PendingRequestsCount,VehicleRequestReject
)
from .maintenance import (
    GarageBase, GarageCreate, GarageOut, GarageOutForReparation,
    CategoryMaintenanceBase, CategoryMaintenanceCreate, CategoryMaintenanceOut,
    MaintenanceBase, MaintenanceCreate, MaintenanceUpdate, MaintenanceOut,
    CategoryPanneBase, CategoryPanneCreate, CategoryPanneOut,
    PanneBase, PanneCreate, PanneUpdate, PanneOut, PanneOutForReparation, PaginatedPanneOut,
    ReparationStatusEnum, ReparationBase, ReparationCreate, ReparationUpdate, ReparationResponse,PanneBulkVerify,ReparationBulkVerify,MaintenanceBulkVerify
)
from .dashboard import (
    KPIStats, FuelEfficiencyData, MaintenanceComplianceData, PerformanceInsightsResponse,
    AlertItem, AlertsResponse, MonthlyActivityChartData, VehicleStatusChartData,
    TopDriver, DriverNestedInTrip, MonthlyExpenseItem, AnalyticsExpenseSummaryResponse,
    FuelRecordDetail, ReparationRecordDetail, MaintenanceRecordDetail, PurchaseRecordDetail, DetailedReportDataResponse,
    TripCreate, TripUpdate, TripResponse
)
