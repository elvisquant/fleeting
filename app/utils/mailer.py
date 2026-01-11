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
# INTERNAL HELPERS
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
# AUTH EMAILS (Registration, Password Reset, Confirmation)
# ==============================================================================

async def send_account_verification_email(user, background_tasks):
    # 1. Generate Token
    string_context = user.get_context_string(context=USER_VERIFY_ACCOUNT)
    token = hash_password(string_context)
    
    # 2. Construct CLEAN URL -> Matches the ui_router in user.py
    activate_url = f"{settings.FRONTEND_HOST}/auth/verify-ui?token={token}&email={user.email}"
    
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #2563eb;">Welcome to {settings.APP_NAME}!</h2>
                <p>Dear <strong>{user.full_name}</strong>,</p>
                <p>Thank you for signing up. To complete your registration and secure your account, please click the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{activate_url}" style="background:#2563eb; color:white; padding:12px 25px; text-decoration:none; border-radius:8px; font-weight: bold; display: inline-block;">Activate My Account</a>
                </div>
                <p style="font-size: 13px; color: #64748b;">If the button above doesn't work, copy and paste this link into your browser:</p>
                <p style="font-size: 12px; word-break: break-all;"><a href="{activate_url}" style="color: #2563eb;">{activate_url}</a></p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="font-size: 12px; color: #94a3b8;">{settings.APP_NAME} Team</p>
            </div>
        </body>
    </html>
    """
    await _send(user.email, f"Account Verification - {settings.APP_NAME}", html)

async def send_account_activation_confirmation_email(user, background_tasks):
    login_url = f"{settings.FRONTEND_HOST}/login.html"
    
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #10b981;">Account Activated!</h2>
                <p>Dear <strong>{user.full_name}</strong>,</p>
                <p>Your account has been successfully verified. You can now access all the features of {settings.APP_NAME}.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{login_url}" style="background:#10b981; color:white; padding:12px 25px; text-decoration:none; border-radius:8px; font-weight: bold; display: inline-block;">Sign In Now</a>
                </div>
                <p>Best regards,<br>{settings.APP_NAME} Team</p>
            </div>
        </body>
    </html>
    """
    await _send(user.email, f"Welcome - {settings.APP_NAME}", html)

async def send_password_reset_email(user, background_tasks):
    # 1. Generate Token
    string_context = user.get_context_string(context=FORGOT_PASSWORD)
    token = hash_password(string_context)
    
    # 2. Construct CLEAN URL
    reset_url = f"{settings.FRONTEND_HOST}/reset-password.html?token={token}&email={user.email}"
    
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #ef4444;">Reset Your Password</h2>
                <p>Dear <strong>{user.full_name}</strong>,</p>
                <p>We received a request to reset the password for your account. Click the button below to set a new password:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{reset_url}" style="background:#ef4444; color:white; padding:12px 25px; text-decoration:none; border-radius:8px; font-weight: bold; display: inline-block;">Reset Password</a>
                </div>
                <p style="font-size: 13px; color: #64748b;">If you did not request this, you can safely ignore this email.</p>
                <p style="font-size: 12px; word-break: break-all; color: #94a3b8;">Link: {reset_url}</p>
            </div>
        </body>
    </html>
    """
    await _send(user.email, f"Reset Password - {settings.APP_NAME}", html)

async def send_password_changed_email(email: str, full_name: str):
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #2c3e50;">Security Alert: Password Updated</h2>
                <p>Dear <strong>{full_name}</strong>,</p>
                <p>This email is to confirm that the password for your <strong>{settings.APP_NAME}</strong> account has been changed successfully.</p>
                <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0;">
                    <p style="margin: 0;">If you did not perform this action, please contact your administrator immediately.</p>
                </div>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">{settings.APP_NAME} Security Team</p>
            </div>
        </body>
    </html>
    """
    await _send(email, f"Security Alert - Password Changed", html)

# ==============================================================================
# REQUEST & MISSION EMAILS
# ==============================================================================

async def send_mission_order_email(email_to: str, recipient_name: str, pdf_bytes: bytes, filename: str):
    """Notification for Requester and Charoi role users upon Full Approval."""
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #2563eb;">Mission Order Authorized</h2>
                <p>Hello <strong>{recipient_name}</strong>,</p>
                <p>A mission order has been fully authorized by the Administration. Please find the official PDF document attached to this email.</p>
                <div style="background: #f0f7ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 14px;"><strong>Note:</strong> Please ensure the document is printed and available during the mission.</p>
                </div>
                <p>Best regards,<br>Fleet Management System</p>
            </div>
        </body>
    </html>
    """
    await _send_with_pdf(email_to, f"APPROVED Mission Order - {filename}", html, pdf_bytes, filename)

async def send_mission_update_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    """Original logic preserved for mission details updates."""
    html = f"""<html><body><p>Dear {requester_name}, details updated for your mission.</p></body></html>"""
    await _send_with_pdf(email_to, f"UPDATED: Mission Order - {filename}", html, pdf_file, filename)

# ==============================================================================
# FEATURE DEPRECATED: DRIVER EMAILS DISABLED
# ==============================================================================
# async def send_driver_assignment_email(email_to: str, driver_name: str, requester_name: str, destination: str, pdf_file: bytes, filename: str):
#     """Standard assignment email for the designated driver (Currently Disabled)."""
#     html = f"""
#     <html>
#         <body style="font-family: Arial, sans-serif; color: #333;">
#             <div style="padding: 20px; border: 1px solid #eee; border-radius: 10px;">
#                 <h3 style="color: #2563eb;">New Driver Assignment</h3>
#                 <p>Hello <strong>{driver_name}</strong>,</p>
#                 <p>You have been assigned as the designated driver for a new mission to <strong>{destination}</strong> requested by {requester_name}.</p>
#                 <p>Please find the mission order attached for your records.</p>
#             </div>
#         </body>
#     </html>
#     """
#     await _send_with_pdf(email_to, f"Driver Assignment: Mission to {destination}", html, pdf_file, filename)

async def send_rejection_email(email_to: str, requester_name: str, request_id: int, reason: str, approver_name: str):
    """Notification sent ONLY to the requester when a request is denied."""
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #ef4444;">Request Denied</h2>
                <p>Hello <strong>{requester_name}</strong>,</p>
                <p>Your vehicle request <strong>#{request_id}</strong> has been reviewed and declined.</p>
                <div style="background: #fff5f5; padding: 15px; border-radius: 8px; border: 1px solid #feb2b2; margin: 20px 0;">
                    <strong>Reason for Denial:</strong><br>{reason}
                </div>
                <p>Reviewed by: {approver_name}</p>
                <p>If you require further information, please contact your department head.</p>
            </div>
        </body>
    </html>
    """
    await _send(email_to, f"Update: Vehicle Request #{request_id} Denied", html)

async def send_accounting_email(email_to: str, accountant_name: str, pdf_bytes: bytes, filename: str, request_id: int):
    """Customized function to notify the Accountant user role."""
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #1e293b;">Accounting Copy: Mission Order Authorized</h2>
                <p>Dear <strong>{accountant_name}</strong>,</p>
                <p>Vehicle request <strong>#{request_id}</strong> has received final administrative approval. An attached copy of the mission order is provided for your processing and accounting records.</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                <p style="font-size: 11px; color: #94a3b8;">Automated Notification - Generated by {settings.APP_NAME}.</p>
            </div>
        </body>
    </html>
    """
    await _send_with_pdf(email_to, f"Accounting Notification: Mission #{request_id}", html, pdf_bytes, filename)