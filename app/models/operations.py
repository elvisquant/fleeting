# app/models/operations.py

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON 
from app.database import Base
from datetime import datetime
import enum

class RequestStatus(str, enum.Enum):
    PENDING = 'pending'
    APPROVED_BY_CHEF = 'approved_by_chef'
    APPROVED_BY_LOGISTIC = 'approved_by_logistic'
    FULLY_APPROVED = 'fully_approved'
    DENIED = 'denied'
    IN_PROGRESS = 'in_progress'
    COMPLETED = 'completed'

class ApprovalStatus(str, enum.Enum):
    PENDING = 'pending'
    APPROVED = 'approved'
    DENIED = 'denied'

class VehicleRequest(Base):
    __tablename__ = "vehicle_requests"

    id = Column(Integer, primary_key=True, index=True)
    
    requester_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicle.id", ondelete="SET NULL"), nullable=True, index=True)
    driver_id = Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True)
    
    destination = Column(String)
    description = Column(Text, nullable=True)
    
    # --- FIX: Rename attributes to match Schema/Dashboard, but map to DB columns ---
    departure_time = Column("start_time", DateTime) 
    return_time = Column("end_time", DateTime)
    # -------------------------------------------------------------------------------
    
    status = Column(Enum(RequestStatus, name='request_status_enum'), nullable=False, default=RequestStatus.PENDING, index=True)
    passengers = Column(JSON, default=[]) 
    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    requester = relationship("User", foreign_keys=[requester_id], back_populates="requests")
    vehicle = relationship("Vehicle", back_populates="requests")
    driver = relationship("User", foreign_keys=[driver_id], back_populates="driver_requests")
    approvals = relationship("RequestApproval", back_populates="request", cascade="all, delete-orphan")

class RequestApproval(Base):
    __tablename__ = "request_approvals"
    id = Column(Integer, primary_key=True, index=True)
    approval_step = Column(Integer, nullable=False)
    status = Column(Enum(ApprovalStatus, name='approval_status_enum'), nullable=False, default=ApprovalStatus.PENDING, index=True)
    comments = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    request_id = Column(Integer, ForeignKey('vehicle_requests.id', ondelete="CASCADE"), nullable=False, index=True)
    approver_id = Column(Integer, ForeignKey('user.id', ondelete="SET NULL"), nullable=True, index=True)
    service_id = Column(Integer, ForeignKey('service.id'), nullable=True, index=True)
    
    service = relationship("Service")
    request = relationship("VehicleRequest", back_populates="approvals")
    approver = relationship("User")