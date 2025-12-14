import secrets
import string

def unique_string(byte_length: int = 32) -> str:
    """
    Generates a URL-safe unique string.
    """
    return secrets.token_urlsafe(byte_length)

def generate_random_code(length: int = 6) -> str:
    """
    Generates a random alphanumeric code (e.g., for OTPs).
    """
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))