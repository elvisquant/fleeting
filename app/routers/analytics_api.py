from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract
from typing import List, Optional
from datetime import datetime, date as DateType
from calendar import month_abbr

from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/analytics-data",
    tags=["Analytics Data"],
    dependencies=[Depends(oauth2.get_current_user_from_header)]
)

def get_month_year_str(year: int, month: int) -> str:
    return f"{month_abbr[month]} '{str(year)[-2:]}"

@router.get("/expense-summary", response_model=schemas.AnalyticsExpenseSummaryResponse)
async def get_expense_summary_data(
    start_date: DateType, 
    end_date: DateType,   
    db: Session = Depends(get_db)
):
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    # --- 1. Totals for KPI and Distribution Chart ---
    total_fuel_cost  = db.query(func.sum(models.Fuel.cost)).filter(models.Fuel.created_at >= start_dt, models.Fuel.created_at <= end_dt).scalar() or 0.0
    total_reparation = db.query(func.sum(models.Reparation.cost)).filter(models.Reparation.repair_date >= start_dt, models.Reparation.repair_date <= end_dt).scalar() or 0.0
    total_maintenance = db.query(func.sum(models.Maintenance.maintenance_cost)).filter(models.Maintenance.maintenance_date >= start_dt, models.Maintenance.maintenance_date <= end_dt).scalar() or 0.0
    total_purchase = db.query(func.sum(models.Vehicle.purchase_price)).filter(models.Vehicle.purchase_date >= start_dt, models.Vehicle.purchase_date <= end_dt).scalar() or 0.0

    # --- 2. Monthly Trends Grouping ---
    monthly_data = {}

    # Fuel Trend
    fuel_q = db.query(extract('year', models.Fuel.created_at).label('y'), extract('month', models.Fuel.created_at).label('m'), func.sum(models.Fuel.cost)).filter(models.Fuel.created_at.between(start_dt, end_dt)).group_by('y', 'm').all()
    for y, m, val in fuel_q:
        key = f"{int(y)}-{int(m):02d}"
        if key not in monthly_data: monthly_data[key] = {"f":0,"r":0,"m":0,"p":0}
        monthly_data[key]["f"] = val or 0

    # Reparation Trend
    rep_q = db.query(extract('year', models.Reparation.repair_date).label('y'), extract('month', models.Reparation.repair_date).label('m'), func.sum(models.Reparation.cost)).filter(models.Reparation.repair_date.between(start_dt, end_dt)).group_by('y', 'm').all()
    for y, m, val in rep_q:
        key = f"{int(y)}-{int(m):02d}"
        if key not in monthly_data: monthly_data[key] = {"f":0,"r":0,"m":0,"p":0}
        monthly_data[key]["r"] = val or 0

    # Maintenance Trend
    maint_q = db.query(extract('year', models.Maintenance.maintenance_date).label('y'), extract('month', models.Maintenance.maintenance_date).label('m'), func.sum(models.Maintenance.maintenance_cost)).filter(models.Maintenance.maintenance_date.between(start_dt, end_dt)).group_by('y', 'm').all()
    for y, m, val in maint_q:
        key = f"{int(y)}-{int(m):02d}"
        if key not in monthly_data: monthly_data[key] = {"f":0,"r":0,"m":0,"p":0}
        monthly_data[key]["m"] = val or 0

    # Purchase Trend
    purch_q = db.query(extract('year', models.Vehicle.purchase_date).label('y'), extract('month', models.Vehicle.purchase_date).label('m'), func.sum(models.Vehicle.purchase_price)).filter(models.Vehicle.purchase_date.between(start_dt, end_dt)).group_by('y', 'm').all()
    for y, m, val in purch_q:
        key = f"{int(y)}-{int(m):02d}"
        if key not in monthly_data: monthly_data[key] = {"f":0,"r":0,"m":0,"p":0}
        monthly_data[key]["p"] = val or 0

    # Format Breakdown
    final_breakdown = []
    for k in sorted(monthly_data.keys()):
        y_int, m_int = map(int, k.split('-'))
        final_breakdown.append({
            "month_year": get_month_year_str(y_int, m_int),
            "fuel_cost": monthly_data[k]["f"],
            "reparation_cost": monthly_data[k]["r"],
            "maintenance_cost": monthly_data[k]["m"],
            "purchase_cost": monthly_data[k]["p"]
        })

    return {
        "total_fuel_cost": total_fuel_cost,
        "total_reparation_cost": total_reparation,
        "total_maintenance_cost": total_maintenance,
        "total_vehicle_purchase_cost": total_purchase,
        "monthly_breakdown": final_breakdown
    }

@router.get("/detailed-expense-records", response_model=schemas.DetailedReportDataResponse)
async def get_detailed_expense_records(
    start_date: DateType, 
    end_date: DateType,   
    categories: List[str] = Query(None),
    db: Session = Depends(get_db)
):
    response_data = schemas.DetailedReportDataResponse()
    start_dt, end_dt = datetime.combine(start_date, datetime.min.time()), datetime.combine(end_date, datetime.max.time())
    if not categories: categories = ["fuel", "reparation", "maintenance", "purchases"]

    if "fuel" in categories:
        fuel_q = db.query(models.Fuel).options(joinedload(models.Fuel.vehicle)).filter(models.Fuel.created_at.between(start_dt, end_dt)).all()
        response_data.fuel_records = [{"id": f.id, "vehicle_plate": f.vehicle.plate_number if f.vehicle else "N/A", "date": f.created_at, "quantity": f.quantity, "cost": f.cost, "notes": ""} for f in fuel_q]

    if "reparation" in categories:
        rep_q = db.query(models.Reparation).options(joinedload(models.Reparation.panne).joinedload(models.Panne.vehicle), joinedload(models.Reparation.garage)).filter(models.Reparation.repair_date.between(start_dt, end_dt)).all()
        response_data.reparation_records = [{"id": r.id, "vehicle_plate": r.panne.vehicle.plate_number if (r.panne and r.panne.vehicle) else "N/A", "repair_date": r.repair_date, "description": r.panne.description if r.panne else "Repair", "cost": r.cost, "provider": r.garage.nom_garage if r.garage else "N/A"} for r in rep_q]

    if "maintenance" in categories:
        maint_q = db.query(models.Maintenance).options(joinedload(models.Maintenance.vehicle), joinedload(models.Maintenance.category_maintenance), joinedload(models.Maintenance.garage)).filter(models.Maintenance.maintenance_date.between(start_dt, end_dt)).all()
        response_data.maintenance_records = [{"id": m.id, "vehicle_plate": m.vehicle.plate_number if m.vehicle else "N/A", "maintenance_date": m.maintenance_date, "description": m.category_maintenance.cat_maintenance if m.category_maintenance else "Maint.", "maintenance_cost": m.maintenance_cost, "provider": m.garage.nom_garage if m.garage else "N/A"} for m in maint_q]

    if "purchases" in categories:
        purch_q = db.query(models.Vehicle).options(joinedload(models.Vehicle.make_ref), joinedload(models.Vehicle.model_ref)).filter(models.Vehicle.purchase_date.between(start_dt, end_dt)).all()
        response_data.purchase_records = [{"id": v.id, "plate_number": v.plate_number, "make": v.make_ref.vehicle_make if v.make_ref else "N/A", "model": v.model_ref.vehicle_model if v.model_ref else "N/A", "purchase_date": v.purchase_date, "purchase_price": v.purchase_price} for v in purch_q]
        
    return response_data