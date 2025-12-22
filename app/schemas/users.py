# app/schemas/users.py

# Auth, User, Role, Agency

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

# --- AUTH ---
class Token(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"
    user_id: int
    username: str
    status: str
    role: str
    service_id: int
    agency_id: int

class TokenData(BaseModel):
    sub: Optional[str] = None
    user_id: Optional[int] = None
    status: Optional[str] = None
    role: Optional[str] = None

class LoginRequest(BaseModel):
    username: str 
    password: str

class UserLogin(BaseModel):
    identifier: str = Field(..., description="Matricule or email")
    password: str = Field(..., min_length=8)

class VerifyUserRequest(BaseModel):
    token: str
    email: EmailStr

class EmailRequest(BaseModel):
    email: EmailStr

# --- UPDATED: Matches the Reset Password Logic ---
class ResetRequest(BaseModel):
    token: str
    email: EmailStr
    password: str
    confirm_password: str 

# --- UPDATED: Handles Email OR Matricule ---
class ForgotPasswordRequest(BaseModel):
    identifier: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)

# --- ORGANIZATION ---
class AgencyBase(BaseModel):
    agency_name: str = Field(..., min_length=3, max_length=100)
class AgencyCreate(AgencyBase): pass
class AgencyUpdate(BaseModel):
    agency_name: Optional[str] = Field(None, min_length=3, max_length=100)
class AgencyOut(AgencyBase):
    id: int
    class Config: from_attributes = True

class ServiceBase(BaseModel):
    service_name: str = Field(..., min_length=3, max_length=100)
class ServiceCreate(ServiceBase): pass
class ServiceUpdate(BaseModel):
    service_name: Optional[str] = Field(None, min_length=3, max_length=100)
class ServiceOut(ServiceBase):
    id: int
    class Config: from_attributes = True

class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None
class RoleCreate(RoleBase): pass
class RoleOut(RoleBase):
    id: int
    class Config: from_attributes = True

# --- USER ---
class UserBase(BaseModel):
    matricule: str = Field(..., max_length=20)
    full_name: str = Field(..., max_length=250)
    agency_id: int
    service_id: int
    telephone: str = Field(..., max_length=20)
    email: EmailStr
    is_active: bool = False

class RegisterUserRequest(UserBase):
    password: str = Field(..., min_length=8)
    role_id: int

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    role_id: int

class UserUpdate(BaseModel):
    matricule: Optional[str] = None
    full_name: Optional[str] = None
    agency_id: Optional[int] = None
    service_id: Optional[int] = None
    telephone: Optional[str] = None
    is_active: Optional[bool] = None
    role_id: Optional[int] = None

class UserSimpleOut(BaseModel):
    id: int
    full_name: str
    matricule: str
    class Config: from_attributes = True

class UserOut(UserBase):
    id: int
    created_at: datetime
    role: RoleOut
    agency: Optional[AgencyOut] = None
    service: Optional[ServiceOut] = None
    verified_at: Optional[datetime] = None
    class Config: from_attributes = True

# Aliases for Router Compatibility
class UserResponse(UserOut): pass

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str = "Bearer"
    user_id: int
    username: str
    status: str
    role: str
    service_id: int
    agency_id: int

class RequesterOut(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    matricule: str
    user: UserOut
    class Config: from_attributes = True