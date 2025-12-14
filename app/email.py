from fastapi import BackgroundTasks

from app.config import get_settings
from app.models import User
from app.email_utils import send_email
from app.email_context import USER_VERIFY_ACCOUNT, FORGOT_PASSWORD
from app.security import hash_password

settings = get_settings()

async def send_account_verification_email(user: User, background_tasks: BackgroundTasks):
    """
    Generates a verification token and sends the account verification email.
    """
    # 1. Generate the security context string from the User model
    string_context = user.get_context_string(context=USER_VERIFY_ACCOUNT)
    
    # 2. Hash it to create the token
    token = hash_password(string_context)
    
    # 3. Construct the URL (Pointing to the new UI Route)
    # This matches the @router.get("/auth/verify-ui") in users.py
    activate_url = f"{settings.FRONTEND_HOST}/api/v1/auth/verify-ui?token={token}&email={user.email}"
    
    # 4. Prepare Template Data
    data = {
        'app_name': settings.APP_NAME,
        "name": user.full_name, 
        'activate_url': activate_url
    }
    
    subject = f"Account Verification - {settings.APP_NAME}"
    
    # 5. Send via the utility
    await send_email(
        recipients=[user.email],
        subject=subject,
        template_name="emails/account-verification.html", # Updated path to templates/emails/
        context=data,
        background_tasks=background_tasks
    )


async def send_account_activation_confirmation_email(user: User, background_tasks: BackgroundTasks):
    """
    Sends a welcome email confirming the account is active.
    """
    data = {
        'app_name': settings.APP_NAME,
        "name": user.full_name,
        'login_url': f'{settings.FRONTEND_HOST}/auth/login' # Or wherever your main login page is
    }
    
    subject = f"Welcome - {settings.APP_NAME}"
    
    await send_email(
        recipients=[user.email],
        subject=subject,
        template_name="emails/account-verification-confirmation.html", # Updated path to templates/emails/
        context=data,
        background_tasks=background_tasks
    )


async def send_password_reset_email(user: User, background_tasks: BackgroundTasks):
    """
    Generates a password reset token and sends the reset link email.
    """
    # 1. Generate context and token
    string_context = user.get_context_string(context=FORGOT_PASSWORD)
    token = hash_password(string_context)
    
    # 2. Construct URL (Pointing to the new UI Route)
    # This matches the @router.get("/auth/reset-ui") in users.py
    reset_url = f"{settings.FRONTEND_HOST}/api/v1/auth/reset-ui?token={token}&email={user.email}"
    
    data = {
        'app_name': settings.APP_NAME,
        "name": user.full_name,
        'activate_url': reset_url, 
    }
    
    subject = f"Reset Password - {settings.APP_NAME}"
    
    await send_email(
        recipients=[user.email],
        subject=subject,
        template_name="emails/password-reset.html", # Updated path to templates/emails/
        context=data,
        background_tasks=background_tasks
    )