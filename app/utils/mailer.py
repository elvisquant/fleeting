# app/utils/mailer.py

import os
import tempfile
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from app.config import settings
from app.security import hash_password
from app.email_context import USER_VERIFY_ACCOUNT, FORGOT_PASSWORD

# Configure using UPPERCASE attributes from app/config.py
conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=settings.USE_CREDENTIALS,
    VALIDATE_CERTS=True,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME
)

# ==============================================================================
# INTERNAL HELPER
# ==============================================================================
async def _send(email_to, subject, html_body, attachments=None):
    message = MessageSchema(
        subject=subject,
        recipients=[email_to],
        body=html_body,
        subtype=MessageType.html,
        attachments=attachments or []
    )
    fm = FastMail(conf)
    await fm.send_message(message)

async def _send_with_pdf(email_to, subject, html_body, pdf_bytes, filename):
    tmp_dir = tempfile.gettempdir()
    tmp_path = os.path.join(tmp_dir, filename)
    try:
        with open(tmp_path, 'wb') as f:
            f.write(pdf_bytes)
        # Pass the path to the temporary file
        await _send(email_to, subject, html_body, [tmp_path])
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

# ==============================================================================
# AUTH EMAILS (Registration & Password Reset)
# ==============================================================================

async def send_account_verification_email(user, background_tasks):
    # 1. Generate Token
    string_context = user.get_context_string(context=USER_VERIFY_ACCOUNT)
    token = hash_password(string_context)
    
    # 2. Construct URL -> Points to STATIC file
    # Ensure you have 'verify-landing.html' accessible
    activate_url = f"{settings.FRONTEND_HOST}/verify-landing.html?token={token}&email={user.email}"
    
    html = f"""
    <html>
        <body>
            <h3>Welcome to {settings.APP_NAME}!</h3>
            <p>Dear {user.full_name},</p>
            <p>Please activate your account by clicking the link below:</p>
            <a href="{activate_url}" style="background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Activate Account</a>
            <p>Or paste this link: {activate_url}</p>
        </body>
    </html>
    """
    await _send(user.email, f"Account Verification - {settings.APP_NAME}", html)

async def send_account_activation_confirmation_email(user, background_tasks):
    login_url = f"{settings.FRONTEND_HOST}/login.html"
    
    html = f"""
    <html>
        <body>
            <h3>Account Activated!</h3>
            <p>Dear {user.full_name},</p>
            <p>Your account is now active. You can log in here:</p>
            <a href="{login_url}">Go to Login</a>
        </body>
    </html>
    """
    await _send(user.email, f"Welcome - {settings.APP_NAME}", html)

async def send_password_reset_email(user, background_tasks):
    # 1. Generate Token
    string_context = user.get_context_string(context=FORGOT_PASSWORD)
    token = hash_password(string_context)
    
    # 2. Construct URL -> Points to STATIC file 'reset-password.html'
    # FIX: Point to the actual HTML file, not the API
    reset_url = f"{settings.FRONTEND_HOST}/reset-password.html?token={token}&email={user.email}"
    
    html = f"""
    <html>
        <body>
            <h3>Reset Your Password</h3>
            <p>Dear {user.full_name},</p>
            <p>We received a request to reset your password. Click the link below to set a new password:</p>
            <br>
            <a href="{reset_url}" style="background:#3b82f6;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Reset Password</a>
            <br><br>
            <p>Or paste this link: {reset_url}</p>
            <p>If you did not request this, please ignore this email.</p>
        </body>
    </html>
    """
    await _send(user.email, f"Reset Password - {settings.APP_NAME}", html)

# ==============================================================================
# REQUEST & MISSION EMAILS
# ==============================================================================

async def send_mission_order_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #27ae60;">Mission Order Approved</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>Your vehicle request has been <strong>fully approved</strong>.</p>
                <p>Attached is the official <strong>Mission Order</strong>.</p>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """
    await _send_with_pdf(email_to, f"APPROVED: Mission Order - {filename}", html, pdf_file, filename)

async def send_mission_update_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    html = f"""
    <html>
        <body>
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #3498db; border-radius: 8px;">
                <h2 style="color: #2980b9;">Mission Details Updated</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>The resources for your mission have been <strong>updated</strong>.</p>
                <p>Please use the attached <strong>Revised Mission Order</strong>.</p>
            </div>
        </body>
    </html>
    """
    await _send_with_pdf(email_to, f"UPDATED: Mission Order - {filename}", html, pdf_file, filename)

async def send_driver_assignment_email(email_to: str, driver_name: str, requester_name: str, destination: str, pdf_file: bytes, filename: str):
    html = f"""
    <html>
        <body>
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #3498db; border-radius: 8px;">
                <h2 style="color: #2980b9;">New Mission Assignment</h2>
                <p>Hello <strong>{driver_name}</strong>,</p>
                <p>You have been assigned as the driver for a new mission.</p>
                <p><strong>Destination:</strong> {destination}</p>
                <p>See attached Mission Order for details.</p>
            </div>
        </body>
    </html>
    """
    await _send_with_pdf(email_to, f"ASSIGNMENT: New Mission to {destination}", html, pdf_file, filename)

async def send_rejection_email(email_to: str, requester_name: str, request_id: int, reason: str, approver_name: str):
    html = f"""
    <html>
        <body>
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fab1a0; border-radius: 8px; background-color: #fff5f5;">
                <h2 style="color: #c0392b;">Request Denied</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>Your request <strong>#{request_id}</strong> was denied.</p>
                <p><strong>Reason:</strong> "{reason}"</p>
                <p><strong>Reviewer:</strong> {approver_name}</p>
            </div>
        </body>
    </html>
    """
    await _send(email_to, f"DENIED: Vehicle Request #{request_id}", html)