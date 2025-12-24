from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, desc, or_
from datetime import datetime, timedelta
from typing import List

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/dashboard-data",
    tags=["Dashboard Data"],
    dependencies=[Depends(oauth2.get_current_user_from_header)]
)

# 1. KPI DATA
@router.get("/kpis", response_model=schemas.KPIStats)
async def get_dashboard_kpis_data(db: Session = Depends(get_db)):
    # Total Vehicles
    total_vehicles = db.query(func.count(models.Vehicle.id)).scalar() or 0

    # Total Purchase Cost (sum of all vehicles)
    total_purchases = db.query(func.sum(models.Vehicle.purchase_price)).scalar() or 0.0

    # Active Alerts: ONLY count Pannes with status 'active' as requested
    active_pannes = db.query(func.count(models.Panne.id)).filter(models.Panne.status == "active").scalar() or 0

    # Weekly Fuel Cost
    today = datetime.utcnow()
    start_week = today - timedelta(days=today.weekday())
    fuel_cost = db.query(func.sum(models.Fuel.cost)).filter(models.Fuel.created_at >= start_week).scalar() or 0.0

    return {
        "total_vehicles": total_vehicles,
        "planned_trips": 0, # Placeholder if needed
        "repairs_this_month": 0, # Placeholder
        "fuel_cost_this_week": round(fuel_cost, 2),
        "total_purchase_cost": round(total_purchases, 2),
        "active_alerts_count": active_pannes 
    }

# 2. ALERTS SUMMARY (KPI and Preview)
@router.get("/alerts", response_model=schemas.AlertsResponse)
async def get_dashboard_alerts_summary(db: Session = Depends(get_db)):
    # KPI Count: Active Pannes only
    count = db.query(func.count(models.Panne.id)).filter(models.Panne.status == "active").scalar() or 0
    
    # Preview Item (The most recent panne)
    last_panne = db.query(models.Panne).options(joinedload(models.Panne.vehicle)).order_by(desc(models.Panne.panne_date)).first()
    alert_item = None
    if last_panne:
        alert_item = schemas.AlertItem(
            plate_number=last_panne.vehicle.plate_number if last_panne.vehicle else "N/A",
            message=f"Breakdown: {last_panne.description[:30]}",
            entity_type="panne",
            status=last_panne.status
        )

    return schemas.AlertsResponse(
        critical_panne=alert_item,
        maintenance_alert=None,
        trip_alert=None,
        total_alerts=count
    )

# 3. VEHICLE STATUS CHART (Expanded Categories)
@router.get("/charts/vehicle-status", response_model=schemas.VehicleStatusChartData)
async def get_vehicle_status_chart_data(db: Session = Depends(get_db)):
    # We query the status column directly from the Vehicle table
    # This assumes your maintenance/panne/reparation logic updates the vehicle's status field.
    
    # Mapping for your logic: Available/Active, Maintenance, Panne, Reparation
    available = db.query(func.count(models.Vehicle.id)).filter(
        or_(models.Vehicle.status == "available", models.Vehicle.status == "active")
    ).scalar() or 0
    
    maintenance = db.query(func.count(models.Vehicle.id)).filter(models.Vehicle.status == "maintenance").scalar() or 0
    panne = db.query(func.count(models.Vehicle.id)).filter(models.Vehicle.status == "panne").scalar() or 0
    reparation = db.query(func.count(models.Vehicle.id)).filter(models.Vehicle.status == "reparation").scalar() or 0

    return {
        "labels": ["Available", "Maintenance", "Panne", "Reparation"],
        "counts": [available, maintenance, panne, reparation]
    }

# 4. RECENT ALERTS LIST
@router.get("/recent-alerts", response_model=List[schemas.AlertItem])
def get_recent_alerts_list(limit: int = 5, db: Session = Depends(get_db)):
    pannes = db.query(models.Panne).options(joinedload(models.Panne.vehicle))\
        .order_by(desc(models.Panne.panne_date)).limit(limit).all()
    
    return [
        schemas.AlertItem(
            plate_number=p.vehicle.plate_number if p.vehicle else "N/A",
            message=p.description or "No description",
            entity_type="panne",
            status=p.status
        ) for p in pannes
    ]