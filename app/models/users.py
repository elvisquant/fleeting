# User, Role, Agency, Service, Tokens

from sqlalchemy import Boolean, Column, DateTime, Integer, String, ForeignKey, func
from sqlalchemy.orm import relationship, mapped_column
from app.database import Base
from datetime import datetime

class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)
    users = relationship("User", back_populates="role")

class Agency(Base):
    __tablename__ = "agency"
    id = Column(Integer, primary_key=True, index=True)
    agency_name = Column(String, nullable=False, index=True)

class Service(Base):
    __tablename__ = "service"
    id = Column(Integer, primary_key=True, index=True)
    service_name = Column(String, nullable=False, index=True)

class User(Base):
    __tablename__ = 'user'
    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    matricule = Column(String(9), unique=True, index=True, nullable=False)
    full_name = Column(String(250), index=True, nullable=False)
    
    # Foreign Keys
    agency_id = Column(Integer, ForeignKey("agency.id", ondelete="CASCADE"), nullable=False, index=True)
    service_id = Column(Integer, ForeignKey("service.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(Integer, ForeignKey('roles.id'), nullable=False, index=True)
    
    telephone = Column(String(16), unique=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False, index=True)
    is_active = Column(Boolean, default=False, index=True)
    failed_login_attempts = Column(Integer, default=0)
    
    # Timestamps
    verified_at = Column(DateTime(timezone=True), nullable=True, default=None, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=func.now(), index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    
    # Relationships
    agency = relationship("Agency")
    service = relationship("Service")
    role = relationship("Role", back_populates="users")
    tokens = relationship("UserToken", back_populates="user")

    def get_context_string(self, context: str):
        timestamp = self.updated_at.strftime('%m%d%Y%H%M%S') if self.updated_at else ""
        return f"{context}{self.password[-6:]}{timestamp}".strip()

class UserToken(Base):
    __tablename__ = "user_tokens"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey('user.id'))
    
    # Context columns
    agency_id = Column(Integer, ForeignKey('agency.id'))
    service_id = Column(Integer, ForeignKey('service.id'))
    role_id = Column(Integer, ForeignKey('roles.id'))
    
    access_key = Column(String(250), nullable=True, index=True, default=None)
    refresh_key = Column(String(250), nullable=True, index=True, default=None)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    
    user = relationship("User", back_populates="tokens")