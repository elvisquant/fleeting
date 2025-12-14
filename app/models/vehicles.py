# Vehicle, Types, Fuel

from sqlalchemy import Column, Boolean, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func, text
from app.database import Base

class VehicleType(Base):
    __tablename__ = "vehicle_type"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_type = Column(String, nullable=False)

class VehicleMake(Base):
    __tablename__ = "vehicle_make"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_make = Column(String, nullable=False)

class VehicleModel(Base):
    __tablename__ = "vehicle_model"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_model = Column(String, nullable=False)

class VehicleTransmission(Base):
    __tablename__ = "vehicle_transmission"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_transmission = Column(String, nullable=False)

class FuelType(Base):
    __tablename__ = "fuel_type"
    id = Column(Integer, primary_key=True, index=True)
    fuel_type = Column(String, unique=True, index=True, nullable=False)

class Vehicle(Base):
    __tablename__ = "vehicle"
    id = Column(Integer, primary_key=True, index=True)
    
    # Specs FKs
    make = Column(Integer, ForeignKey("vehicle_make.id"), index=True)
    model = Column(Integer, ForeignKey("vehicle_model.id"), index=True)
    vehicle_type = Column(Integer, ForeignKey("vehicle_type.id"), index=True)
    vehicle_transmission = Column(Integer, ForeignKey("vehicle_transmission.id"), index=True)
    vehicle_fuel_type = Column(Integer, ForeignKey("fuel_type.id"), index=True)
    
    # Specs Data
    year = Column(Integer)
    plate_number = Column(String, unique=True, nullable=False, index=True)
    mileage = Column(Float, default=0.0)
    engine_size = Column(Float, default=0.0)
    vin = Column(String, nullable=False, unique=True)
    color = Column(String, nullable=False)
    purchase_price = Column(Float, default=0.0)
    status = Column(String, default="available", index=True)
    
    # Metadata
    purchase_date = Column(DateTime(timezone=True), nullable=True, index=True)
    registration_date = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    
    # Relationships
    make_ref = relationship("VehicleMake")
    model_ref = relationship("VehicleModel")

class Fuel(Base):
    __tablename__ = "fuel"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicle.id", ondelete="CASCADE"), nullable=False, index=True)
    fuel_type_id = Column(Integer, ForeignKey("fuel_type.id", ondelete="CASCADE"), nullable=False, index=True)
    
    quantity = Column(Float, nullable=False)
    price_little = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    is_verified = Column(Boolean, default=False, index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True, default=None, index=True)
    
    vehicle = relationship("Vehicle")