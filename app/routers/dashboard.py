from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func, desc, or_
from typing import List
from datetime import datetime, timedelta
from calendar import monthrange

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/dashboard-data",
    tags=["Dashboard Data"],
    dependencies=[Depends(oauth2.get_current_user_from_header)]
)

@router.get("/kpis", response_model=schemas.KPIStats)
async def get_dashboard_kpis_data(db: Session = Depends(get_db)):
    # 1. Total Vehicles
    total_vehicles = db.query(func.count(models.Vehicle.id)).scalar() or 0

    # 2. Active Requests (Replacing Planned Trips)
    # Counts requests that are approved or ongoing
    active_requests = db.query(func.count(models.VehicleRequest.id)).filter(
        or_(
            models.VehicleRequest.status == "approved_by_logistic",
            models.VehicleRequest.status == "in_progress" # Updated to match likely Enum value
        )
    ).scalar() or 0

    # 3. Repairs This Month
    today = datetime.utcnow()
    start_month = today.replace(day=1, hour=0, minute=0, second=0)
    if start_month.month == 12:
        next_month = start_month.replace(year=start_month.year+1, month=1)
    else:
        next_month = start_month.replace(month=start_month.month+1)
    
    repairs_count = db.query(func.count(models.Reparation.id)).filter(
        models.Reparation.repair_date >= start_month,
        models.Reparation.repair_date < next_month
    ).scalar() or 0

    # 4. Fuel Cost Week
    start_week = today - timedelta(days=today.weekday())
    start_week = start_week.replace(hour=0, minute=0, second=0)
    
    fuel_cost = db.query(func.sum(models.Fuel.cost)).filter(
        models.Fuel.created_at >= start_week
    ).scalar() or 0.0

    return schemas.KPIStats(
        total_vehicles=total_vehicles,
        planned_trips=active_requests, 
        repairs_this_month=repairs_count,
        fuel_cost_this_week=round(fuel_cost, 2)
    )

@router.get("/performance-insights", response_model=schemas.PerformanceInsightsResponse)
async def get_dashboard_performance_insights(db: Session = Depends(get_db)):
    today_dt = datetime.utcnow()
    start_current = today_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    if today_dt.month == 12:
        end_current = start_current.replace(year=today_dt.year + 1, month=1) - timedelta(microseconds=1)
    else:
        end_current = start_current.replace(month=today_dt.month + 1) - timedelta(microseconds=1)
    
    current_vol = db.query(func.sum(models.Fuel.quantity)).filter(models.Fuel.created_at >= start_current, models.Fuel.created_at <= end_current).scalar() or 0.0

    end_last = start_current - timedelta(microseconds=1)
    start_last = end_last.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    last_vol = db.query(func.sum(models.Fuel.quantity)).filter(models.Fuel.created_at >= start_last, models.Fuel.created_at <= end_last).scalar() or 0.0

    pct_change = None
    trend = "no_comparison"
    
    if last_vol > 0:
        pct_change = ((last_vol - current_vol) / last_vol) * 100
        trend = "up" if pct_change > 5 else "down" if pct_change < -5 else "steady"
    
    maintenance_count = db.query(func.count(models.Maintenance.id)).scalar() or 0
    
    return schemas.PerformanceInsightsResponse(
        fuel_efficiency=schemas.FuelEfficiencyData(current_month_volume=round(current_vol,2), last_month_volume=round(last_vol,2), percentage_change=round(pct_change, 1) if pct_change else None, trend=trend),
        maintenance_compliance=schemas.MaintenanceComplianceData(total_maintenance_records=maintenance_count)
    )

@router.get("/alerts", response_model=schemas.AlertsResponse)
async def get_dashboard_alerts_data(db: Session = Depends(get_db)):
    alert_panne = None
    last_panne = db.query(models.Panne).options(joinedload(models.Panne.vehicle), joinedload(models.Panne.category_panne)).order_by(desc(models.Panne.panne_date)).first()
    if last_panne:
        plate = last_panne.vehicle.plate_number if last_panne.vehicle else "N/A"
        desc_txt = last_panne.description or "Issue reported"
        alert_panne = schemas.AlertItem(plate_number=plate, message=desc_txt, entity_type="panne", status=last_panne.status)

    alert_maint = None
    last_maint = db.query(models.Maintenance).options(joinedload(models.Maintenance.vehicle)).order_by(desc(models.Maintenance.maintenance_date)).first()
    if last_maint:
        plate = last_maint.vehicle.plate_number if last_maint.vehicle else "N/A"
        alert_maint = schemas.AlertItem(plate_number=plate, message="Maintenance Due", entity_type="maintenance", status="Scheduled")

    alert_trip = None
    # Now checking Requests instead of Trips
    # FIXED: start_time -> departure_time
    last_req = db.query(models.VehicleRequest).options(joinedload(models.VehicleRequest.vehicle)).order_by(desc(models.VehicleRequest.departure_time)).first()
    if last_req:
        plate = last_req.vehicle.plate_number if (last_req.vehicle) else "Pending"
        # FIXED: destination -> to_location
        alert_trip = schemas.AlertItem(plate_number=plate, message=f"Mission to {last_req.to_location}", entity_type="trip", status=last_req.status)
    
    total = sum(1 for x in [alert_panne, alert_maint, alert_trip] if x)
    return schemas.AlertsResponse(critical_panne=alert_panne, maintenance_alert=alert_maint, trip_alert=alert_trip, total_alerts=total)

@router.get("/upcoming-trips", response_model=List[schemas.VehicleRequestOut])
async def get_upcoming_missions(db: Session = Depends(get_db)):
    today = datetime.utcnow()
    # Fetch Approved Requests that are upcoming
    requests = db.query(models.VehicleRequest).options(
        joinedload(models.VehicleRequest.vehicle).selectinload(models.Vehicle.make_ref),
        joinedload(models.VehicleRequest.vehicle).selectinload(models.Vehicle.model_ref),
        joinedload(models.VehicleRequest.driver),
        joinedload(models.VehicleRequest.requester)
    ).filter(
        # FIXED: start_time -> departure_time
        models.VehicleRequest.departure_time >= today,
        models.VehicleRequest.status.in_(["approved_by_logistic", "in_progress"]) # Ensure matches Enum
    ).order_by(models.VehicleRequest.departure_time.asc()).limit(5).all()

    return requests

@router.get("/charts/monthly-activity", response_model=schemas.MonthlyActivityChartData)
async def get_monthly_activity(db: Session = Depends(get_db), months_to_display: int = 12):
    labels, req_counts, maint_counts, panne_counts = [], [], [], []
    today = datetime.utcnow().date()

    for i in range(months_to_display - 1, -1, -1):
        year_offset, month_offset = divmod(today.month - 1 - i, 12)
        target_year = today.year + year_offset
        target_month = month_offset + 1
        
        start_date = datetime(target_year, target_month, 1)
        end_date = start_date.replace(month=start_date.month+1) if start_date.month < 12 else start_date.replace(year=start_date.year+1, month=1)
        
        labels.append(start_date.strftime("%b"))

        # Count Requests
        # FIXED: start_time -> departure_time
        c_req = db.query(func.count(models.VehicleRequest.id)).filter(
            models.VehicleRequest.departure_time >= start_date, 
            models.VehicleRequest.departure_time < end_date
        ).scalar() or 0
        req_counts.append(c_req)
        
        c_maint = db.query(func.count(models.Maintenance.id)).filter(models.Maintenance.maintenance_date >= start_date, models.Maintenance.maintenance_date < end_date).scalar() or 0
        maint_counts.append(c_maint)

        c_panne = db.query(func.count(models.Panne.id)).filter(models.Panne.panne_date >= start_date, models.Panne.panne_date < end_date).scalar() or 0
        panne_counts.append(c_panne)

    return schemas.MonthlyActivityChartData(labels=labels, trips=req_counts, maintenances=maint_counts, pannes=panne_counts)

@router.get("/charts/vehicle-status", response_model=schemas.VehicleStatusChartData)
async def get_vehicle_status_chart_data(db: Session = Depends(get_db)):
    data = db.query(models.Vehicle.status, func.count(models.Vehicle.id)).group_by(models.Vehicle.status).all()
    labels = [d[0].replace('_', ' ').title() if d[0] else 'Unknown' for d in data]
    counts = [d[1] for d in data]
    return schemas.VehicleStatusChartData(labels=labels, counts=counts)