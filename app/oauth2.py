from typing import List, Optional
from datetime import datetime

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload

from app.database import get_session
from app.config import get_settings
from app import models
from app.security import get_token_payload, str_decode

settings = get_settings()

# This defines where FastAPI looks for the token by default (Authorization: Bearer <token>)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# --- CORE USER RETRIEVAL LOGIC ---

async def get_token_user(token: str, db: Session) -> Optional[models.User]:
    """
    Decodes the token and verifies it against the database UserToken table.
    """
    if not token:
        return None

    # Decode Token
    payload = get_token_payload(token, settings.JWT_SECRET, settings.JWT_ALGORITHM)
    if not payload:
        return None

    try:
        # Extract custom claims
        user_token_id = str_decode(payload.get('r'))
        user_id = str_decode(payload.get('sub'))
        access_key = payload.get('a')

        # DB Lookup: Check if this specific token exists and is valid
        # FIX: Added eager loading for Role, Agency, and Service
        user_token = db.query(models.UserToken).options(
            joinedload(models.UserToken.user).joinedload(models.User.role),
            joinedload(models.UserToken.user).joinedload(models.User.agency),
            joinedload(models.UserToken.user).joinedload(models.User.service)
        ).filter(
            models.UserToken.access_key == access_key,
            models.UserToken.id == user_token_id,
            models.UserToken.user_id == user_id,
            models.UserToken.expires_at > datetime.utcnow()
        ).first()

        if user_token and user_token.user:
            return user_token.user
            
    except Exception as e:
        print(f"Auth Error: {e}") # Helpful for debugging
        return None

    return None


# --- DEPENDENCIES ---

async def get_current_user(
    token: str = Depends(oauth2_scheme), 
    db: Session = Depends(get_session)
) -> models.User:
    """
    Dependency for API Routes expecting a Header Token.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials", 
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    user = await get_token_user(token, db)
    
    if not user:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="User is inactive")
        
    return user

# Alias for compatibility
get_current_user_from_header = get_current_user


async def get_current_active_user_flexible(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_session)
) -> models.User:
    """
    Flexible Dependency: Looks for token in Header first, then Cookie.
    """
    auth_token = token
    
    # If no header token, check cookie
    if not auth_token:
        cookie_token = request.cookies.get("access_token")
        if cookie_token:
            auth_token = cookie_token.split(" ")[1] if cookie_token.startswith("Bearer ") else cookie_token

    if not auth_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = await get_token_user(auth_token, db)

    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid session or user inactive")
        
    return user


# --- ROLE CHECKERS ---

def require_role(allowed_roles: List[str]):
    """
    Factory for role-based permission checks.
    """
    async def role_checker(user: models.User = Depends(get_current_user)):
        # Ensure role is loaded
        if not user.role:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail="User has no role assigned."
            )

        user_role = user.role.name.lower()
        
        # Check if user's role is in the allowed list
        if user_role not in [r.lower() for r in allowed_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, 
                detail=f"Action requires one of the following roles: {', '.join(allowed_roles)}"
            )
        return user
    return role_checker

# --- PRE-DEFINED DEPENDENCIES ---

require_admin_role_for_api = require_role(["admin", "superadmin"])
require_driver_role = require_role(["driver"])
require_logistic_role = require_role(["logistic"])
require_charoi_role = require_role(["admin", "superadmin", "charoi"])
require_user_role = require_role(["user"])
require_chef_role = require_role(["chef"])
require_operateur_role = require_role(["operateur"])
require_technicien_role = require_role(["technicien"])

