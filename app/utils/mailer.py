# app/utils/mailer.py

from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from app.config import settings

# Configure using UPPERCASE attributes to match app/config.py
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

async def send_mission_order_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    """
    Sends email with the official Mission Order PDF attached.
    """
    
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
                <h2 style="color: #2c3e50;">Mission Order Approved</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>Your vehicle request has been <strong>fully approved</strong>.</p>
                <p>Attached to this email is the official <strong>Mission Order</strong>.</p>
                <p>Please print this document or keep a digital copy accessible during your mission.</p>
                <br>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """

    # --- FIX IS HERE: Use a Dictionary for attachments, not a Tuple ---
    message = MessageSchema(
        subject=f"OFFICIAL: Mission Order - {filename.replace('.pdf', '')}",
        recipients=[email_to],
        body=html,
        subtype=MessageType.html,
        attachments=[
            {
                "file": pdf_file,           # The bytes
                "filename": filename,       # The name string
                "mime_type": "application/pdf",
                "headers": {}
            }
        ]
    )

    fm = FastMail(conf)
    await fm.send_message(message)

async def send_rejection_email(email_to: str, requester_name: str, request_id: int, reason: str, approver_name: str):
    """
    Sends an email notifying the user their request was denied.
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