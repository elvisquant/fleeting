# app/models/operations.py (or wherever you keep this model)

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, func
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON # <--- Added for passengers list
from app.database import Base
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
    __tablename__ = 'vehicle_requests'
    id = Column(Integer, primary_key=True, index=True)
    
    purpose = Column(String, nullable=False)
    from_location = Column(String, nullable=False)
    to_location = Column(String, nullable=False)
    roadmap = Column(Text, nullable=True) 
    departure_time = Column(DateTime(timezone=True), nullable=False, index=True)
    return_time = Column(DateTime(timezone=True), nullable=False)
    
    # --- NEW FIELDS ---
    # Stores list of matricules: ["12345", "67890"]
    passengers = Column(JSON, default=[]) 
    # Stores why it was denied
    rejection_reason = Column(Text, nullable=True) 
    # ------------------

    status = Column(Enum(RequestStatus, name='request_status_enum'), nullable=False, default=RequestStatus.PENDING, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Note: Ensure these table names ('user', 'vehicle') match your actual DB table names
    requester_id = Column(Integer, ForeignKey('user.id', ondelete="SET NULL"), nullable=True, index=True)
    vehicle_id = Column(Integer, ForeignKey('vehicle.id', ondelete="SET NULL"), nullable=True, index=True)
    driver_id = Column(Integer, ForeignKey('user.id', ondelete="SET NULL"), nullable=True, index=True)
    
    requester = relationship("User", foreign_keys=[requester_id])
    vehicle = relationship("Vehicle")
    driver = relationship("User", foreign_keys=[driver_id])
    approvals = relationship("RequestApproval", back_populates="request", cascade="all, delete-orphan")

class RequestApproval(Base):
    __tablename__ = 'request_approvals'
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