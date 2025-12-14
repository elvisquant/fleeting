 # Garage, Maintenance, Panne, Reparation

from sqlalchemy import Boolean, Column, DateTime, Float,Integer, String, ForeignKey, func
from sqlalchemy.orm import relationship
from app.database import Base

class Garage(Base):
    __tablename__ = "garage"
    id = Column(Integer, primary_key=True, index=True)
    nom_garage = Column(String, nullable=False)

class CategoryMaintenance(Base):
    __tablename__ = "category_maintenance"
    id = Column(Integer, primary_key=True, index=True)
    cat_maintenance = Column(String, nullable=False)

class Maintenance(Base):
    __tablename__ = "maintenance"
    id = Column(Integer, primary_key=True, index=True)
    
    cat_maintenance_id = Column(Integer, ForeignKey("category_maintenance.id", ondelete="SET NULL"), nullable=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicle.id", ondelete="CASCADE"), nullable=False, index=True)
    garage_id = Column(Integer, ForeignKey("garage.id", ondelete="SET NULL"), nullable=True, index=True)
    
    maintenance_cost = Column(Float, default=0.0, nullable=False)
    receipt = Column(String, nullable=False)
    maintenance_date = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    status = Column(String(50), default="active", nullable=False, index=True)

    is_verified = Column(Boolean, default=False, index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True, default=None, index=True)
    
    vehicle = relationship("Vehicle") 
    category_maintenance = relationship("CategoryMaintenance")
    garage = relationship("Garage")

class CategoryPanne(Base):
    __tablename__ = "category_panne"
    id = Column(Integer, primary_key=True, index=True)
    panne_name = Column(String, nullable=False)

class Panne(Base):
    __tablename__ = "panne"
    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicle.id"), nullable=False, index=True)
    category_panne_id = Column(Integer, ForeignKey("category_panne.id"), nullable=False, index=True)
    
    description = Column(String(500), nullable=True)
    status = Column(String(50), default="active", nullable=False, index=True)
    panne_date = Column(DateTime(timezone=True), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    is_verified = Column(Boolean, default=False, index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True, default=None, index=True)
    
    vehicle = relationship("Vehicle")
    category_panne = relationship("CategoryPanne")

class Reparation(Base):
    __tablename__ = "reparation"
    id = Column(Integer, primary_key=True, index=True)
    panne_id = Column(Integer, ForeignKey("panne.id"), index=True)
    garage_id = Column(Integer, ForeignKey("garage.id"), index=True)
    
    cost = Column(Float, default=0.0)
    receipt = Column(String, nullable=False)
    repair_date = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String, default="Inprogress", index=True)

    is_verified = Column(Boolean, default=False, index=True)
    verified_at = Column(DateTime(timezone=True), nullable=True, default=None, index=True)
    
    panne = relationship("Panne")
    garage = relationship("Garage")
