import logging
import base64
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from passlib.context import CryptContext
from app.config import get_settings

settings = get_settings()

# Setup Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SPECIAL_CHARACTERS = ['@', '#', '$', '%', '=', ':', '?', '.', '/', '|', '~', '>']

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def is_password_strong_enough(password: str) -> bool:
    if len(password) < 8: return False
    if not any(char.isupper() for char in password): return False
    if not any(char.islower() for char in password): return False
    if not any(char.isdigit() for char in password): return False
    if not any(char in SPECIAL_CHARACTERS for char in password): return False
    return True

# --- Encoding Helpers ---

def str_encode(string: str) -> str:
    return base64.b85encode(string.encode('ascii')).decode('ascii')

def str_decode(string: str) -> str:
    return base64.b85decode(string.encode('ascii')).decode('ascii')

# --- JWT Low-Level Logic ---

def generate_token(payload: dict, secret: str, algo: str, expiry: timedelta) -> str:
    """Generic function to encode a JWT."""
    expire = datetime.utcnow() + expiry
    to_encode = payload.copy()
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, secret, algorithm=algo)

def get_token_payload(token: str, secret: str, algo: str) -> Optional[Dict[str, Any]]:
    """Generic function to decode a JWT."""
    try:
        payload = jwt.decode(token, secret, algorithms=[algo])
        return payload
    except jwt.ExpiredSignatureError:
        logging.warning("Token expired")
        return None
    except jwt.InvalidTokenError as e:
        logging.warning(f"Invalid Token: {e}")
        return None
    except Exception as e:
        logging.error(f"JWT Decode Error: {e}")
        return None