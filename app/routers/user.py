# app/routers/user.py

from datetime import datetime, timedelta
from typing import List, Optional
import logging

from fastapi import (
    APIRouter, Depends, status, HTTPException, 
    Response, BackgroundTasks, Header, Request
)
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

# --- Project Imports ---
from app import models, schemas, oauth2
from app.database import get_db
from app.config import get_settings
from app.utils import unique_string
from app.email_context import FORGOT_PASSWORD, USER_VERIFY_ACCOUNT

# Security & Auth Logic
from app.security import (
    hash_password,
    verify_password,
    is_password_strong_enough,
    generate_token,
    get_token_payload,
    str_decode,
    str_encode
)
from app.oauth2 import (
    get_current_user, 
    oauth2_scheme, 
    require_admin_role_for_api, 
    get_current_user_from_header
)

# Email Services
from app.utils.mailer import (
    send_account_verification_email,
    send_account_activation_confirmation_email,
    send_password_reset_email,
    send_password_changed_email # <--- Ensure this is imported
)


# Load settings
settings = get_settings()

# Initialize Templates (Points to app/templates)
templates = Jinja2Templates(directory="app/templates")

router = APIRouter(
    prefix="/api/v1",
    tags=['Users & Auth']
)

ui_router = APIRouter(
    tags=['Users & Auth UI']
)
# =================================================================================
# HELPER FUNCTIONS (Internal)
# =================================================================================

def _generate_tokens_helper(user: models.User, db: Session):
    """
    Internal helper to generate Access and Refresh tokens and save to DB.
    """
    refresh_key = unique_string(100)
    access_key = unique_string(50)
    rt_expires = timedelta(minutes=settings.REFRESH_TOKEN_EXPIRE_MINUTES)

    # Create UserToken entry
    user_token = models.UserToken(
        user_id=user.id,
        refresh_key=refresh_key,
        access_key=access_key,
        expires_at=datetime.utcnow() + rt_expires,
        agency_id=user.agency_id,
        service_id=user.service_id,
        role_id=user.role_id
    )
    
    db.add(user_token)
    db.commit()
    db.refresh(user_token)

    # Create Access Token
    at_payload = {
        "sub": str_encode(str(user.id)),
        'a': access_key,
        'r': str_encode(str(user_token.id)),
        'n': str_encode(f"{user.full_name}")
    }
    at_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = generate_token(at_payload, settings.JWT_SECRET, settings.JWT_ALGORITHM, at_expires)

    # Create Refresh Token
    rt_payload = {"sub": str_encode(str(user.id)), "t": refresh_key, 'a': access_key}
    refresh_token = generate_token(rt_payload, settings.SECRET_KEY, settings.JWT_ALGORITHM, rt_expires)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": at_expires.seconds,
        "user_id": user.id,
        "username": user.full_name,
        "status": "active" if user.is_active else "inactive",
        "role": user.role.name if user.role else "user",
        "service_id": user.service_id,
        "agency_id": user.agency_id
    }

# =================================================================================
# AUTH ENDPOINTS (Login, Register, Reset)
# =================================================================================

@router.post("/auth/register", status_code=status.HTTP_201_CREATED, response_model=schemas.UserResponse)
async def register_user(
    user_data: schemas.RegisterUserRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Register a new user account.
    Forces the 'user' role by default for security.
    """
    # 1. Check if Email already exists
    if db.query(models.User).filter(models.User.email == user_data.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already exists.")
    
    # 2. Check if Matricule already exists
    if db.query(models.User).filter(models.User.matricule == user_data.matricule).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Matricule already exists.")
    
    # 3. Validate Password Strength
    if not is_password_strong_enough(user_data.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please provide a strong password.")
    
    # 4. SECURITY UPDATE: Find the 'user' role dynamically
    # This prevents users from signing up as Admins by changing the role_id on the frontend.
    default_role = db.query(models.Role).filter(func.lower(models.Role.name) == "user").first()
    
    if not default_role:
        # If 'user' role is missing from DB, we fallback to whatever was sent, 
        # but log a warning or raise an error for better security.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="System configuration error: Default user role not found."
        )

    # 5. Create the User object
    new_user = models.User(
        full_name=user_data.full_name,
        matricule=user_data.matricule,
        email=user_data.email,
        telephone=user_data.telephone,
        password=hash_password(user_data.password),
        is_active=False, # Account must be verified via email first
        agency_id=user_data.agency_id,
        service_id=user_data.service_id,
        role_id=default_role.id, # <--- Forced 'user' role ID
        updated_at=datetime.utcnow()
    )
    
    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        # 6. Send Verification Email
        await send_account_verification_email(new_user, background_tasks=background_tasks)
        
        return new_user
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Could not create user: {str(e)}")


@router.post("/auth/login", status_code=status.HTTP_200_OK, response_model=schemas.LoginResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Authenticate a user and return tokens.
    """
    user = db.query(models.User).options(
        joinedload(models.User.role),
        joinedload(models.User.agency),
        joinedload(models.User.service)
    ).filter(models.User.matricule == form_data.username).first()
    
    if not user:
        user = db.query(models.User).options(
            joinedload(models.User.role),
            joinedload(models.User.agency),
            joinedload(models.User.service)
        ).filter(models.User.email == form_data.username).first()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email/matricule or password.")

    if not verify_password(form_data.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email/matricule or password.")

    if not user.verified_at:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account not verified. Please check your email.")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated. Contact support.")

    return _generate_tokens_helper(user, db)


@router.post("/auth/refresh", status_code=status.HTTP_200_OK, response_model=schemas.LoginResponse)
def refresh_token(
    refresh_token: str = Header(..., alias="refresh_token"),
    db: Session = Depends(get_db)
):
    """
    Refresh access token using a valid refresh token.
    """
    token_payload = get_token_payload(refresh_token, settings.SECRET_KEY, settings.JWT_ALGORITHM)
    if not token_payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token.")

    refresh_key = token_payload.get('t')
    access_key = token_payload.get('a')
    user_id = str_decode(token_payload.get('sub'))

    user_token = db.query(models.UserToken).options(
        joinedload(models.UserToken.user).joinedload(models.User.role),
        joinedload(models.UserToken.user).joinedload(models.User.agency),
        joinedload(models.UserToken.user).joinedload(models.User.service)
    ).filter(
        models.UserToken.refresh_key == refresh_key,
        models.UserToken.access_key == access_key,
        models.UserToken.user_id == user_id,
        models.UserToken.expires_at > datetime.utcnow()
    ).first()

    if not user_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token.")

    user_token.expires_at = datetime.utcnow()
    db.add(user_token)
    db.commit()

    return _generate_tokens_helper(user_token.user, db)


@router.post("/auth/verify", status_code=status.HTTP_200_OK)
async def verify_account(
    data: schemas.VerifyUserRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Verify user account using email token.
    """
    user = db.query(models.User).filter(models.User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid link.")

    context_str = user.get_context_string(context=USER_VERIFY_ACCOUNT)
    if not verify_password(context_str, data.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link expired or invalid.")

    user.is_active = True
    user.updated_at = datetime.utcnow()
    user.verified_at = datetime.utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)

    await send_account_activation_confirmation_email(user, background_tasks)
    return JSONResponse({"message": "Account activated successfully."})


@router.post("/auth/forgot-password", status_code=status.HTTP_200_OK)
async def forgot_password(
    data: schemas.ForgotPasswordRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Initiate password reset process using Email OR Matricule.
    """
    user = db.query(models.User).filter(
        or_(
            models.User.email == data.identifier,
            models.User.matricule == data.identifier
        )
    ).first()
    
    if user and user.email and user.is_active:
        await send_password_reset_email(user, background_tasks)
    
    return JSONResponse({"message": "If an account exists, a reset link has been sent."})


@router.put("/auth/reset-password", status_code=status.HTTP_200_OK)
def reset_password(
    data: schemas.ResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Complete password reset with token.
    """
    if data.password != data.confirm_password:
         raise HTTPException(status_code=400, detail="Passwords do not match.")

    # 1. Find User by Email
    user = db.query(models.User).filter(models.User.email == data.email).first()
    
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid request.")

    # 2. Verify Token
    context_str = user.get_context_string(context=FORGOT_PASSWORD)
    if not verify_password(context_str, data.token):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Link is invalid or has expired.")

    # 3. Update Password
    user.password = hash_password(data.password)
    user.updated_at = datetime.utcnow()
    db.add(user)
    db.commit()
    
    # 4. Send Confirmation Email (Background Task)
    # FIX: Pass strings (email, name) instead of user object to avoid DetachedInstanceError
    background_tasks.add_task(send_password_changed_email, user.email, user.full_name)

    return JSONResponse({"message": "Password updated successfully."})


# =================================================================================
# USER MANAGEMENT ENDPOINTS
# =================================================================================

@router.get("/users/me", response_model=schemas.UserResponse)
def get_current_user_profile(
    current_user: models.User = Depends(get_current_user)
):
    return current_user

@router.get("/users", response_model=List[schemas.UserResponse])
def get_all_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin_role_for_api),
    limit: int = 100, skip: int = 0
):
    return db.query(models.User).options(
        joinedload(models.User.role),
        joinedload(models.User.agency),
        joinedload(models.User.service)
    ).limit(limit).offset(skip).all()

@router.get("/users/{id}", response_model=schemas.UserResponse)
def get_user_by_id(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin_role_for_api)
):
    user = db.query(models.User).options(
        joinedload(models.User.role),
        joinedload(models.User.agency),
        joinedload(models.User.service)
    ).filter(models.User.id == id).first()
    
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user

@router.put("/users/{id}", response_model=schemas.UserResponse)
def update_user(
    id: int,
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin_role_for_api)
):
    # 1. Fetch user with joinedload to ensure relationships are available
    query = db.query(models.User).options(
        joinedload(models.User.role),
        joinedload(models.User.agency),
        joinedload(models.User.service)
    ).filter(models.User.id == id)
    
    user = query.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(user, key, value)

    try:
        db.commit()
        # 2. Refresh ensures the DB state is synced, 
        # but we re-query to ensure relationships are fully populated for the response
        db.refresh(user)
        
        # Final fetch to ensure the Pydantic model gets the NEW related objects
        return db.query(models.User).options(
            joinedload(models.User.role),
            joinedload(models.User.agency),
            joinedload(models.User.service)
        ).filter(models.User.id == id).first()

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Database error: {str(e)}")

@router.delete("/users/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_admin_role_for_api)
):
    user = db.query(models.User).filter(models.User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    db.delete(user)
    db.commit()
    return None

# =================================================================================
# UI PAGE SERVING ROUTES (HTML)
# =================================================================================
""" 
@router.get("/auth/verify-ui", response_class=HTMLResponse)
async def serve_verification_page(request: Request):
    return templates.TemplateResponse("pages/verify-landing.html", {"request": request})

@router.get("/auth/reset-ui", response_class=HTMLResponse)
async def serve_reset_page(request: Request):
    return templates.TemplateResponse("pages/reset-landing.html", {"request": request})  """



@ui_router.get("/auth/verify-ui", response_class=HTMLResponse)
async def serve_verification_page(request: Request):
    return templates.TemplateResponse("pages/verify-landing.html", {"request": request})

@ui_router.get("/auth/reset-ui", response_class=HTMLResponse)
async def serve_reset_page(request: Request):
    return templates.TemplateResponse("pages/reset-landing.html", {"request": request})







