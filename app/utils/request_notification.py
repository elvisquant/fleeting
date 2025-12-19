# app/utils/email.py

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from app.config import settings

# Configure using variables from .env
conf = ConnectionConfig(
    MAIL_USERNAME=settings.mail_username,
    MAIL_PASSWORD=settings.mail_password,
    MAIL_FROM=settings.mail_from,
    MAIL_PORT=settings.mail_port,
    MAIL_SERVER=settings.mail_server,
    MAIL_STARTTLS=settings.mail_starttls,
    MAIL_SSL_TLS=settings.mail_ssl_tls,
    USE_CREDENTIALS=settings.use_credentials,
    VALIDATE_CERTS=True,
    MAIL_FROM_NAME=settings.mail_from_name if hasattr(settings, 'mail_from_name') else "Fleet Management"
)

async def send_mission_order_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    """
    Sends email with the official Mission Order PDF attached (For Approval).
    """
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #27ae60;">Mission Order Approved</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>Your vehicle request has been <strong>fully approved</strong>.</p>
                <p>Attached to this email is the official <strong>Mission Order</strong>.</p>
                <p>Please print this document or keep a digital copy accessible during your mission.</p>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """

    message = MessageSchema(
        subject=f"APPROVED: Mission Order - {filename.replace('.pdf', '')}",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html,
        attachments=[(filename, pdf_file, "application/pdf")]
    )

    fm = FastMail(conf)
    await fm.send_message(message)

# --- NEW FUNCTION FOR DENIAL ---
async def send_rejection_email(email_to: str, requester_name: str, request_id: int, reason: str, approver_name: str):
    """
    Sends an email notifying the user their request was denied and why.
    """
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fab1a0; border-radius: 8px; background-color: #fff5f5;">
                <h2 style="color: #c0392b;">Request Denied</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>Your vehicle request <strong>#{request_id}</strong> has been <strong style="color: #c0392b;">DENIED</strong>.</p>
                
                <div style="background-color: #ffffff; padding: 15px; border-left: 4px solid #c0392b; margin: 20px 0;">
                    <strong>Reason for Rejection:</strong><br>
                    <i style="color: #555;">"{reason}"</i>
                </div>

                <p><strong>Reviewer:</strong> {approver_name}</p>
                <p>If you have questions, please contact the fleet management department or submit a new request with corrections.</p>
                <hr style="border: 0; border-top: 1px solid #fab1a0;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """

    message = MessageSchema(
        subject=f"DENIED: Vehicle Request #{request_id}",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html
    )

    fm = FastMail(conf)
    await fm.send_message(message)