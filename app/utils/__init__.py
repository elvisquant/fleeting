# app/utils/__init__.py
import uuid
import secrets
import string

def unique_string(length=None):
    """
    Generates a unique string.
    - If length is provided (e.g., unique_string(100)), generates a random string of that size.
    - If no length is provided, generates a standard UUID.
    """
    if length is None:
        return str(uuid.uuid4())
    
    # Generate a secure random string of the requested length
    # containing letters (uppercase/lowercase) and digits.
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))