# app/utils/mailer.py

import os
import tempfile
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from app.config import settings

# Configure using UPPERCASE attributes
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


async def send_mission_update_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    """
    Sends an email notifying the requester that details (Vehicle/Driver) have changed.
    """
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #3498db; border-radius: 8px;">
                <h2 style="color: #2980b9;">Mission Details Updated</h2>
                <p>Dear <strong>{requester_name}</strong>,</p>
                <p>The resources (Vehicle or Driver) for your approved mission have been <strong>updated</strong>.</p>
                <p>Please find attached the <strong>Revised Mission Order</strong>.</p>
                <p style="background-color: #f0f8ff; padding: 10px; border-left: 4px solid #3498db;">
                    <strong>Note:</strong> Please discard previous versions of this document.
                </p>
                <br>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """
    await _send_email_with_pdf(email_to, f"UPDATED: Mission Order - {filename}", html, pdf_file, filename)



async def send_mission_order_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    """
    Sends email to the REQUESTER with the official Mission Order PDF attached.
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
                <br>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """
    await _send_email_with_pdf(email_to, f"APPROVED: Mission Order - {filename}", html, pdf_file, filename)

async def send_driver_assignment_email(email_to: str, driver_name: str, requester_name: str, destination: str, pdf_file: bytes, filename: str):
    """
    Sends email to the DRIVER notifying them of the assignment.
    """
    html = f"""
    <html>
        <body style="font-family: Arial, sans-serif; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #3498db; border-radius: 8px;">
                <h2 style="color: #2980b9;">New Mission Assignment</h2>
                <p>Hello <strong>{driver_name}</strong>,</p>
                <p>You have been assigned as the driver for a new mission.</p>
                
                <div style="background-color: #f0f8ff; padding: 15px; margin: 15px 0; border-left: 4px solid #3498db;">
                    <p style="margin: 5px 0;"><strong>Requester:</strong> {requester_name}</p>
                    <p style="margin: 5px 0;"><strong>Destination:</strong> {destination}</p>
                </div>

                <p>The official <strong>Mission Order</strong> is attached. Please review the details regarding departure time and passengers.</p>
                <br>
                <hr style="border: 0; border-top: 1px solid #eee;">
                <p style="font-size: 12px; color: #888;">FleetDash Automated System</p>
            </div>
        </body>
    </html>
    """
    await _send_email_with_pdf(email_to, f"ASSIGNMENT: New Mission to {destination}", html, pdf_file, filename)

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

# --- INTERNAL HELPER TO AVOID CODE DUPLICATION ---
async def _send_email_with_pdf(email_to, subject, html_body, pdf_bytes, filename):
    tmp_dir = tempfile.gettempdir()
    tmp_path = os.path.join(tmp_dir, filename)

    try:
        with open(tmp_path, 'wb') as f:
            f.write(pdf_bytes)

        message = MessageSchema(
            subject=subject,
            recipients=[email_to],
            body=html_body,
            subtype=MessageType.html,
            attachments=[tmp_path]
        )

        fm = FastMail(conf)
        await fm.send_message(message)

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


 