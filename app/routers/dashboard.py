# app/routers/dashboard.py

from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func, desc, or_
from typing import List, Optional
from datetime import datetime, timedelta
from calendar import monthrange

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/dashboard-data",
    tags=["Dashboard Data"],
    dependencies=[Depends(oauth2.get_current_user_from_header)]
)

# 1. KPIs - Updated to include Vehicle Purchase Costs
@router.get("/kpis", response_model=schemas.KPIStats)
async def get_dashboard_kpis_data(db: Session = Depends(get_db)):
    # Total Vehicles
    total_vehicles = db.query(func.count(models.Vehicle.id)).scalar() or 0

    # Total Purchase Cost (Sum of all vehicle prices)
    # Assuming your Vehicle model has a 'purchase_price' or 'price' field
    total_purchases = db.query(func.sum(models.Vehicle.purchase_price)).scalar() or 0.0

    # Active Requests (Approved or In Progress)
    active_requests = db.query(func.count(models.VehicleRequest.id)).filter(
        models.VehicleRequest.status.in_(["approved_by_logistic", "fully_approved", "in_progress"])
    ).scalar() or 0

    # Repairs This Month
    today = datetime.utcnow()
    start_month = today.replace(day=1, hour=0, minute=0, second=0)
    repairs_count = db.query(func.count(models.Reparation.id)).filter(
        models.Reparation.repair_date >= start_month
    ).scalar() or 0

    # Fuel Cost Week
    start_week = today - timedelta(days=today.weekday())
    fuel_cost = db.query(func.sum(models.Fuel.cost)).filter(
        models.Fuel.created_at >= start_week
    ).scalar() or 0.0

    return {
        "total_vehicles": total_vehicles,
        "planned_trips": active_requests, 
        "repairs_this_month": repairs_count,
        "fuel_cost_this_week": round(fuel_cost, 2),
        "total_purchase_cost": round(total_purchases, 2) # Added this
    }

# 7. VEHICLE STATUS CHART - Updated for Maintenance/Panne accuracy
@router.get("/charts/vehicle-status", response_model=schemas.VehicleStatusChartData)
async def get_vehicle_status_chart_data(db: Session = Depends(get_db)):
    # 1. Count vehicles in Maintenance or Panne (is_active = False)
    maintenance_count = db.query(func.count(models.Vehicle.id)).filter(models.Vehicle.is_active == False).scalar() or 0
    
    # 2. Count vehicles "In Use" (is_active = True AND has an active trip)
    # Note: Simplification - we check for requests with status 'in_progress'
    in_use_count = db.query(func.count(models.VehicleRequest.vehicle_id.distinct()))\
        .filter(models.VehicleRequest.status == "in_progress").scalar() or 0
    
    # 3. Available (is_active = True AND NOT in use)
    total_active = db.query(func.count(models.Vehicle.id)).filter(models.Vehicle.is_active == True).scalar() or 0
    available_count = max(0, total_active - in_use_count)

    return {
        "labels": ["Available", "In Use", "Maintenance"],
        "counts": [available_count, in_use_count, maintenance_count]
    }

# 4. RECENT ALERTS - Combining Panne and Trips
@router.get("/recent-alerts", response_model=List[schemas.AlertItem])
def get_recent_alerts_list(limit: int = 5, db: Session = Depends(get_db)):
    alerts = []
    
    # Get last 3 pannes
    recent_pannes = db.query(models.Panne).options(joinedload(models.Panne.vehicle))\
        .order_by(desc(models.Panne.panne_date)).limit(3).all()
    
    for p in recent_pannes:
        alerts.append({
            "plate_number": p.vehicle.plate_number if p.vehicle else "N/A",
            "message": f"Breakdown: {p.description[:30]}...",
            "entity_type": "panne",
            "status": p.status
        })

    # Get last 3 missions
    recent_trips = db.query(models.VehicleRequest).options(joinedload(models.VehicleRequest.vehicle))\
        .order_by(desc(models.VehicleRequest.departure_time)).limit(3).all()
    
    for t in recent_trips:
        alerts.append({
            "plate_number": t.vehicle.plate_number if t.vehicle else "Pending",
            "message": f"Mission to {t.destination}",
            "entity_type": "trip",
            "status": t.status
        })
    
    # Sort combined by status or logic, then limit
    return alerts[:limit]