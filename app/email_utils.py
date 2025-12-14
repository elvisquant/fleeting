import os
from pathlib import Path
from fastapi_mail import FastMail, MessageSchema, MessageType, ConnectionConfig
from fastapi.background import BackgroundTasks
from app.config import get_settings

settings = get_settings()

TEMPLATE_FOLDER = Path(__file__).resolve().parent / "templates"

conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=settings.USE_CREDENTIALS,
    VALIDATE_CERTS=False, # Disable certificate validation for Docker
    TEMPLATE_FOLDER=TEMPLATE_FOLDER
)

fm = FastMail(conf)

async def send_email(
    recipients: list, 
    subject: str, 
    context: dict, 
    template_name: str,
    background_tasks: BackgroundTasks
):
    message = MessageSchema(
        subject=subject,
        recipients=recipients,
        template_body=context,
        subtype=MessageType.html
    )
    
    # WRAPPER FUNCTION TO CATCH AND PRINT ERRORS
    async def send_message_wrapper():
        try:
            print(f"📧 Attempting to send email to {recipients}...")
            await fm.send_message(message, template_name=template_name)
            print(f"✅ Email sent successfully to {recipients}")
        except Exception as e:
            print(f"❌ Email FAILED to send. Error: {str(e)}")

    # Add the wrapper to background tasks
    background_tasks.add_task(send_message_wrapper)