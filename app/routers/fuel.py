from typing import List, Optional
from datetime import datetime, date as date_type
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

# --- Project Imports ---
from app import models, schemas, oauth2
from app.database import get_db

router = APIRouter(
    prefix="/api/v1/fuel",
    tags=['Fuel Records API']
)

# =================================================================================
# CREATE (Authenticated) - Default Unverified
# =================================================================================
@router.post("/", response_model=schemas.FuelOut, status_code=status.HTTP_201_CREATED)
def create_new_fuel_record(
    fuel_payload: schemas.FuelCreatePayload,
    db: Session = Depends(get_db),
    # Any authenticated user can potentially log fuel (e.g. Driver), but verify permissions as needed
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    """
    Create a new fuel record. Auto-calculates cost. Default status is Unverified.
    """
    # 1. Verify Vehicle
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == fuel_payload.vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail=f"Vehicle {fuel_payload.vehicle_id} not found.")

    # 2. Verify Fuel Type
    fuel_type = db.query(models.FuelType).filter(models.FuelType.id == fuel_payload.fuel_type_id).first()
    if not fuel_type:
        raise HTTPException(status_code=404, detail=f"Fuel Type {fuel_payload.fuel_type_id} not found.")

    # 3. Validation
    if fuel_payload.quantity <= 0 or fuel_payload.price_little <= 0:
        raise HTTPException(status_code=400, detail="Quantity and Price must be positive.")

    # 4. Calculate Cost
    calculated_cost = round(fuel_payload.quantity * fuel_payload.price_little, 2)

    # 5. Save (Verified = False by default)
    db_fuel_record = models.Fuel(
        vehicle_id=fuel_payload.vehicle_id,
        fuel_type_id=fuel_payload.fuel_type_id,
        quantity=fuel_payload.quantity,
        price_little=fuel_payload.price_little,
        cost=calculated_cost,
        is_verified=False,
        verified_at=None
    )
    
    db.add(db_fuel_record)
    db.commit()
    db.refresh(db_fuel_record)
    return db_fuel_record


# =================================================================================
# READ ONE (Authenticated)
# =================================================================================
@router.get("/{fuel_id}", response_model=schemas.FuelOut)
def read_fuel_record_by_id(
    fuel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    db_fuel_record = db.query(models.Fuel).filter(models.Fuel.id == fuel_id).first()
    if not db_fuel_record:
        raise HTTPException(status_code=404, detail="Fuel record not found")
    return db_fuel_record


# =================================================================================
# READ ALL (Authenticated)
# =================================================================================
@router.get("/", response_model=List[schemas.FuelOut])
def read_all_fuel_records(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1),
    vehicle_id: Optional[int] = None,
    date_after: Optional[date_type] = None,
    date_before: Optional[date_type] = None
):
    query = db.query(models.Fuel)

    if vehicle_id:
        query = query.filter(models.Fuel.vehicle_id == vehicle_id)
    
    if date_after:
        query = query.filter(models.Fuel.created_at >= datetime.combine(date_after, datetime.min.time()))
    if date_before:
        query = query.filter(models.Fuel.created_at <= datetime.combine(date_before, datetime.max.time()))
    
    return query.order_by(desc(models.Fuel.created_at)).offset(skip).limit(limit).all()


# =================================================================================
# UPDATE (Admin / Charoi Only) - LOCKED IF VERIFIED
# =================================================================================
@router.put("/{fuel_id}", response_model=schemas.FuelOut)
def update_existing_fuel_record(
    fuel_id: int,
    fuel_payload: schemas.FuelUpdatePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role) # Use charoi dependency (includes admin)
):
    """
    Update fuel record. Only allowed if NOT verified yet.
    Only Admin/Charoi can verify.
    """
    db_fuel_record = db.query(models.Fuel).filter(models.Fuel.id == fuel_id).first()
    if not db_fuel_record:
        raise HTTPException(status_code=404, detail="Fuel record not found")

    # LOCK CHECK: If already verified, nobody can edit (except maybe superadmin, but standard logic says lock)
    if db_fuel_record.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="This record is verified and cannot be modified."
        )

    update_data = fuel_payload.model_dump(exclude_unset=True)

    # 1. Handle Verification Logic
    if "is_verified" in update_data:
        # Check permissions specifically for verifying (Charoi/Admin)
        if current_user.role.name.lower() not in ["admin", "superadmin", "charoi"]:
             raise HTTPException(status_code=403, detail="Not authorized to verify records.")
        
        if update_data["is_verified"] is True:
            db_fuel_record.verified_at = datetime.utcnow()
        else:
            db_fuel_record.verified_at = None

    # 2. Recalculate Cost if needed
    qty = update_data.get("quantity", db_fuel_record.quantity)
    price = update_data.get("price_little", db_fuel_record.price_little)

    if "quantity" in update_data or "price_little" in update_data:
        if qty <= 0 or price <= 0:
            raise HTTPException(status_code=400, detail="Values must be positive.")
        update_data['cost'] = round(qty * price, 2)

    # 3. Apply updates
    for key, value in update_data.items():
        setattr(db_fuel_record, key, value)

    db.commit()
    db.refresh(db_fuel_record)
    return db_fuel_record


# =================================================================================
# DELETE (Admin / Charoi Only) - LOCKED IF VERIFIED
# =================================================================================
@router.delete("/{fuel_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_fuel_record(
    fuel_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role)
):
    db_fuel_record = db.query(models.Fuel).filter(models.Fuel.id == fuel_id).first()
    if not db_fuel_record:
        raise HTTPException(status_code=404, detail="Fuel record not found")

    # LOCK CHECK
    if db_fuel_record.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="This record is verified and cannot be deleted."
        )

    db.delete(db_fuel_record)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# =================================================================================
# BUSINESS LOGIC (Check Eligibility)
# =================================================================================
@router.get("/check-eligibility/{vehicle_id}", response_model=schemas.EligibilityResponse)
def check_fuel_eligibility(
    vehicle_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.get_current_user_from_header)
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found.")

    if vehicle.status != 'available':
        return schemas.EligibilityResponse(
            eligible=False,
            message=f"Vehicle is not eligible. Status: '{vehicle.status}'."
        )

    last_fuel = db.query(models.Fuel).filter(models.Fuel.vehicle_id == vehicle_id).order_by(desc(models.Fuel.created_at)).first()
    
    if last_fuel:
        # Check for completed REQUEST since last fuel (Trips removed)
        completed_req = db.query(models.VehicleRequest).filter(
            models.VehicleRequest.vehicle_id == vehicle_id,
            models.VehicleRequest.status == 'completed',
            models.VehicleRequest.return_time > last_fuel.created_at # Using return_time (end_time equivalent)
        ).first()
        
        # If no completed request found after last fueling, warn user (but maybe allow override)
        if not completed_req:
            # We return False, frontend can show warning or block
            return schemas.EligibilityResponse(
                eligible=False,
                message="No completed mission recorded since last refueling."
            )

    return schemas.EligibilityResponse(eligible=True, message="Vehicle is eligible.")


# Add this to app/routers/fuel.py

@router.put("/verify-bulk", status_code=status.HTTP_200_OK)
def verify_fuel_records_bulk(
    payload: schemas.FuelBulkVerify,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(oauth2.require_charoi_role) # Admin/Charoi only
):
    """
    Verify multiple fuel records at once.
    """
    # 1. Fetch records that are in the list AND are currently unverified
    records = db.query(models.Fuel).filter(
        models.Fuel.id.in_(payload.ids),
        models.Fuel.is_verified == False
    ).all()

    if not records:
        raise HTTPException(status_code=404, detail="No unverified records found with provided IDs.")

    # 2. Update them
    now = datetime.utcnow()
    count = 0
    for record in records:
        record.is_verified = True
        record.verified_at = now
        count += 1

    db.commit()
    return {"message": f"Successfully verified {count} records."}