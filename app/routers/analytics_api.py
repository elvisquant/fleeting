from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract
from typing import List
from datetime import datetime, date as DateType
from calendar import month_abbr

# --- Project Imports ---
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/analytics-data",  # Matched standard prefix
    tags=["Analytics Data"],
    dependencies=[Depends(oauth2.get_current_user_from_header)]
)

# Helper function
def get_month_year_str(year: int, month: int) -> str:
    return f"{month_abbr[month]} '{str(year)[-2:]}"

@router.get("/expense-summary", response_model=schemas.AnalyticsExpenseSummaryResponse)
async def get_expense_summary_data(
    start_date: DateType, 
    end_date: DateType,   
    db: Session = Depends(get_db)
):
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    # --- 1. Calculate Total Costs ---
    total_fuel_cost = db.query(func.sum(models.Fuel.cost)).filter(
        models.Fuel.created_at >= start_datetime,
        models.Fuel.created_at <= end_datetime
    ).scalar() or 0.0

    total_reparation_cost = db.query(func.sum(models.Reparation.cost)).filter(
        models.Reparation.repair_date >= start_datetime,
        models.Reparation.repair_date <= end_datetime
    ).scalar() or 0.0

    total_maintenance_cost = db.query(func.sum(models.Maintenance.maintenance_cost)).filter(
        models.Maintenance.maintenance_date >= start_datetime,
        models.Maintenance.maintenance_date <= end_datetime
    ).scalar() or 0.0

    total_vehicle_purchase_cost = db.query(func.sum(models.Vehicle.purchase_price)).filter(
        models.Vehicle.purchase_date >= start_datetime,
        models.Vehicle.purchase_date <= end_datetime,
        models.Vehicle.purchase_price.isnot(None) 
    ).scalar() or 0.0

    # --- 2. Calculate Monthly Breakdown ---
    monthly_data_temp = {}

    # Fuel by month
    year_col_fuel = extract('year', models.Fuel.created_at)
    month_col_fuel = extract('month', models.Fuel.created_at)
    fuel_monthly_q = db.query(
        year_col_fuel.label('year'),
        month_col_fuel.label('month'),
        func.sum(models.Fuel.cost).label('total_cost')
    ).filter(
        models.Fuel.created_at >= start_datetime,
        models.Fuel.created_at <= end_datetime
    ).group_by(year_col_fuel, month_col_fuel).all()
    
    for row in fuel_monthly_q:
        key = f"{int(row.year)}-{int(row.month):02d}"
        if key not in monthly_data_temp: monthly_data_temp[key] = {}
        monthly_data_temp[key]['fuel_cost'] = monthly_data_temp[key].get('fuel_cost', 0) + (row.total_cost or 0)

    # Reparations by month
    year_col_rep = extract('year', models.Reparation.repair_date)
    month_col_rep = extract('month', models.Reparation.repair_date)
    reparations_monthly_q = db.query(
        year_col_rep.label('year'),
        month_col_rep.label('month'),
        func.sum(models.Reparation.cost).label('total_cost')
    ).filter(
        models.Reparation.repair_date >= start_datetime, 
        models.Reparation.repair_date <= end_datetime    
    ).group_by(year_col_rep, month_col_rep).all()
    
    for row in reparations_monthly_q:
        key = f"{int(row.year)}-{int(row.month):02d}"
        if key not in monthly_data_temp: monthly_data_temp[key] = {}
        monthly_data_temp[key]['reparation_cost'] = monthly_data_temp[key].get('reparation_cost', 0) + (row.total_cost or 0)

    # Maintenance by month
    year_col_maint = extract('year', models.Maintenance.maintenance_date)
    month_col_maint = extract('month', models.Maintenance.maintenance_date)
    maintenance_monthly_q = db.query(
        year_col_maint.label('year'),
        month_col_maint.label('month'),
        func.sum(models.Maintenance.maintenance_cost).label('total_cost') 
    ).filter(
        models.Maintenance.maintenance_date >= start_datetime, 
        models.Maintenance.maintenance_date <= end_datetime    
    ).group_by(year_col_maint, month_col_maint).all()
    
    for row in maintenance_monthly_q:
        key = f"{int(row.year)}-{int(row.month):02d}"
        if key not in monthly_data_temp: monthly_data_temp[key] = {}
        monthly_data_temp[key]['maintenance_cost'] = monthly_data_temp[key].get('maintenance_cost', 0) + (row.total_cost or 0)
    
    # Vehicle Purchases by month
    year_col_vehicle_purchase = extract('year', models.Vehicle.purchase_date)
    month_col_vehicle_purchase = extract('month', models.Vehicle.purchase_date)
    purchases_monthly_q = db.query(
        year_col_vehicle_purchase.label('year'),
        month_col_vehicle_purchase.label('month'),
        func.sum(models.Vehicle.purchase_price).label('total_cost')
    ).filter(
        models.Vehicle.purchase_date >= start_datetime, 
        models.Vehicle.purchase_date <= end_datetime,   
        models.Vehicle.purchase_price > 0 
    ).group_by(
        year_col_vehicle_purchase,
        month_col_vehicle_purchase
    ).all()
    
    for row in purchases_monthly_q:
        key = f"{int(row.year)}-{int(row.month):02d}"
        if key not in monthly_data_temp: monthly_data_temp[key] = {}
        monthly_data_temp[key]['purchase_cost'] = monthly_data_temp[key].get('purchase_cost', 0) + (row.total_cost or 0)

    # --- 3. Format monthly_breakdown ---
    final_monthly_breakdown = []
    
    # Iterate through months
    current = DateType(start_date.year, start_date.month, 1)
    # Just a simple loop helper
    def next_month(d):
        if d.month == 12: return DateType(d.year + 1, 1, 1)
        return DateType(d.year, d.month + 1, 1)

    while current <= DateType(end_date.year, end_date.month, 1):
        key = f"{current.year}-{current.month:02d}"
        data = monthly_data_temp.get(key, {})
        
        final_monthly_breakdown.append({
            "month_year": get_month_year_str(current.year, current.month),
            "fuel_cost": data.get('fuel_cost', 0.0),
            "reparation_cost": data.get('reparation_cost', 0.0),
            "maintenance_cost": data.get('maintenance_cost', 0.0),
            "purchase_cost": data.get('purchase_cost', 0.0)
        })
        current = next_month(current)
            
    return {
        "total_fuel_cost": total_fuel_cost,
        "total_reparation_cost": total_reparation_cost,
        "total_maintenance_cost": total_maintenance_cost,
        "total_vehicle_purchase_cost": total_vehicle_purchase_cost,
        "monthly_breakdown": final_monthly_breakdown
    }

@router.get("/detailed-expense-records", response_model=schemas.DetailedReportDataResponse)
async def get_detailed_expense_records(
    start_date: DateType, 
    end_date: DateType,   
    categories: List[str] = Query(None),
    db: Session = Depends(get_db)
):
    response_data = schemas.DetailedReportDataResponse()
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    if not categories:
        categories = ["fuel", "reparation", "maintenance", "purchases"]

    if "fuel" in categories:
        fuel_q = db.query(models.Fuel).options(
            joinedload(models.Fuel.vehicle)
        ).filter(
            models.Fuel.created_at >= start_datetime,
            models.Fuel.created_at <= end_datetime
        ).order_by(models.Fuel.created_at.asc()).all()
        
        # Manual mapping for safety with relationships
        response_data.fuel_records = [
            {
                "id": f.id,
                "vehicle_plate": f.vehicle.plate_number if f.vehicle else "N/A",
                "date": f.created_at,
                "quantity": f.quantity,
                "cost": f.cost,
                "notes": "" # Add notes field to Fuel model later if needed
            } for f in fuel_q
        ]

    if "reparation" in categories:
        reparation_q = db.query(models.Reparation).options(
            joinedload(models.Reparation.panne).joinedload(models.Panne.vehicle), 
            joinedload(models.Reparation.garage) 
        ).filter(
            models.Reparation.repair_date >= start_datetime,
            models.Reparation.repair_date <= end_datetime
        ).order_by(models.Reparation.repair_date.asc()).all()
        
        response_data.reparation_records = [
            {
                "id": r.id,
                "vehicle_plate": r.panne.vehicle.plate_number if (r.panne and r.panne.vehicle) else "N/A",
                "repair_date": r.repair_date,
                "description": r.panne.description if r.panne else "No Description",
                "cost": r.cost,
                "provider": r.garage.nom_garage if r.garage else "Unknown Garage"
            } for r in reparation_q
        ]

    if "maintenance" in categories:
        maintenance_q = db.query(models.Maintenance).options(
            joinedload(models.Maintenance.vehicle),
            joinedload(models.Maintenance.category_maintenance),
            joinedload(models.Maintenance.garage)
        ).filter(
            models.Maintenance.maintenance_date >= start_datetime,
            models.Maintenance.maintenance_date <= end_datetime
        ).order_by(models.Maintenance.maintenance_date.asc()).all()

        response_data.maintenance_records = [
            {
                "id": m.id,
                "vehicle_plate": m.vehicle.plate_number if m.vehicle else "N/A",
                "maintenance_date": m.maintenance_date,
                "description": m.category_maintenance.cat_maintenance if m.category_maintenance else "General",
                "maintenance_cost": m.maintenance_cost,
                "provider": m.garage.nom_garage if m.garage else "Unknown Garage"
            } for m in maintenance_q
        ]

    if "purchases" in categories:
        purchase_q = db.query(models.Vehicle).options(
            joinedload(models.Vehicle.make_ref), 
            joinedload(models.Vehicle.model_ref) 
        ).filter(
            models.Vehicle.purchase_date >= start_datetime,
            models.Vehicle.purchase_date <= end_datetime,
            models.Vehicle.purchase_price > 0 
        ).order_by(models.Vehicle.purchase_date.asc()).all()

        response_data.purchase_records = [
            {
                "id": v.id,
                "plate_number": v.plate_number,
                "make": v.make_ref.vehicle_make if v.make_ref else "N/A",
                "model": v.model_ref.vehicle_model if v.model_ref else "N/A",
                "purchase_date": v.purchase_date,
                "purchase_price": v.purchase_price
            } for v in purchase_q
        ]
        
    return response_data