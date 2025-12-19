# app/utils/__init__.py
import uuid

def unique_string():
    """
    Generates a unique string (UUID).
    Used for verification tokens and file naming.
    """
    return str(uuid.uuid4())