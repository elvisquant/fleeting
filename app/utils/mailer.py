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
    
    # 2. Construct URL -> Points to STATIC file
    activate_url = f"{settings.FRONTEND_HOST}/verify-landing.html?token={token}&email={user.email}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Welcome to {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Account Activation</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{user.full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Thank you for signing up. Please activate your account by clicking the link below:
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 25px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{activate_url}" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Activate Account</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-top: 25px;">
                                    If the button above doesn't work, please copy and paste the following URL into your browser:
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <a href="{activate_url}" style="color: #3b82f6; word-break: break-all;">{activate_url}</a>
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Thank you for choosing us!
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Best Regards,<br><strong>{settings.APP_NAME}</strong>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Activation du Compte</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{user.full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Merci de vous être inscrit(e). Veuillez activer votre compte en cliquant sur le lien ci-dessous :
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 25px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{activate_url}" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Activer le Compte</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-top: 25px;">
                                    Si le bouton ci-dessus ne fonctionne pas, veuillez copier et coller l'URL suivante dans votre navigateur :
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <a href="{activate_url}" style="color: #3b82f6; word-break: break-all;">{activate_url}</a>
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Merci de nous avoir choisis !
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cordialement,<br><strong>{settings.APP_NAME}</strong>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send(user.email, f"Account Verification - {settings.APP_NAME}", html)

async def send_account_activation_confirmation_email(user, background_tasks):
    login_url = f"{settings.FRONTEND_HOST}/login.html"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Welcome to {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Account Activated</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{user.full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Thank you for verifying your email. We are excited to have you on board! Your account is now fully active.
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 25px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{login_url}" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Sign In to Dashboard</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Compte Activé</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{user.full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Merci d'avoir vérifié votre email. Nous sommes ravis de vous compter parmi nous ! Votre compte est désormais actif.
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 25px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{login_url}" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Se Connecter</a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send(user.email, f"Welcome - {settings.APP_NAME}", html)

async def send_password_reset_email(user, background_tasks):
    # 1. Generate Token
    string_context = user.get_context_string(context=FORGOT_PASSWORD)
    token = hash_password(string_context)
    
    # 2. Construct URL -> Points to STATIC file 'reset-password.html'
    reset_url = f"{settings.FRONTEND_HOST}/reset-password.html?token={token}&email={user.email}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Reset Password - {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Reset Your Password</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{user.full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    We have received a request for resetting your account password. Click on the below link to reset your password.
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 25px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{reset_url}" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-top: 25px;">
                                    If the button above doesn't work, please copy and paste the following URL into your browser:
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <a href="{reset_url}" style="color: #3b82f6; word-break: break-all;">{reset_url}</a>
                                </p>
                                <br/>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6; font-style: italic;">
                                    If you did not make this request, then ignore this email, and you do not have to do anything.
                                </p>
                                <br/>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Thank you for choosing us!
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Best Regards,<br><strong>{settings.APP_NAME}</strong>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Réinitialiser votre Mot de Passe</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{user.full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Nous avons reçu une demande de réinitialisation du mot de passe de votre compte. Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe.
                                </p>
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 25px;">
                                    <tr>
                                        <td align="center">
                                            <a href="{reset_url}" target="_blank" style="background-color: #3b82f6; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Réinitialiser le Mot de Passe</a>
                                        </td>
                                    </tr>
                                </table>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-top: 25px;">
                                    Si le bouton ci-dessus ne fonctionne pas, veuillez copier et coller l'URL suivante dans votre navigateur :
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <a href="{reset_url}" style="color: #3b82f6; word-break: break-all;">{reset_url}</a>
                                </p>
                                <br/>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6; font-style: italic;">
                                    Si vous n'avez pas fait cette demande, ignorez cet email et vous n'avez rien à faire.
                                </p>
                                <br/>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Merci de nous avoir choisis !
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cordialement,<br><strong>{settings.APP_NAME}</strong>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send(user.email, f"Reset Password - {settings.APP_NAME}", html)

async def send_password_changed_email(email: str, full_name: str):
    """
    Sends a security notification confirming the password was changed.
    Uses strings (not User object) to avoid DetachedInstanceError.
    """
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Security Alert - {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Security Alert: Password Updated</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    This email is to confirm that the password for your <strong>{settings.APP_NAME}</strong> account has been changed successfully.
                                </p>
                                <div style="background-color: #f0f8ff; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
                                    <p style="margin: 0; color: #475569;">If you did not perform this action, please contact your administrator immediately.</p>
                                </div>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    You can now log in with your new password.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0;">Alerte de Sécurité : Mot de Passe Modifié</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{full_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cet email confirme que le mot de passe de votre compte <strong>{settings.APP_NAME}</strong> a été modifié avec succès.
                                </p>
                                <div style="background-color: #f0f8ff; padding: 15px; border-left: 4px solid #3498db; margin: 20px 0;">
                                    <p style="margin: 0; color: #475569;">Si vous n'avez pas effectué cette action, veuillez contacter votre administrateur immédiatement.</p>
                                </div>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send(email, f"Security Alert - Password Changed", html)

# ==============================================================================
# REQUEST & MISSION EMAILS
# ==============================================================================

async def send_mission_order_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Mission Order Approved - {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0; color: #27ae60;">Mission Order Approved</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{requester_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Your vehicle request has been <strong>fully approved</strong>.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Attached is the official <strong>Mission Order</strong>.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0; color: #27ae60;">Ordre de Mission Approuvé</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{requester_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Votre demande de véhicule a été <strong>entièrement approuvée</strong>.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    L'<strong>Ordre de Mission</strong> officiel est joint à cet email.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send_with_pdf(email_to, f"APPROVED: Mission Order - {filename}", html, pdf_file, filename)

async def send_mission_update_email(email_to: str, requester_name: str, pdf_file: bytes, filename: str):
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Mission Details Updated - {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0; color: #2980b9;">Mission Details Updated</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{requester_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    The resources for your mission have been <strong>updated</strong>.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Please use the attached <strong>Revised Mission Order</strong>.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0; color: #2980b9;">Détails de Mission Mis à Jour</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{requester_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Les ressources pour votre mission ont été <strong>mises à jour</strong>.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Veuillez utiliser l'<strong>Ordre de Mission Révisé</strong> joint.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send_with_pdf(email_to, f"UPDATED: Mission Order - {filename}", html, pdf_file, filename)

async def send_driver_assignment_email(email_to: str, driver_name: str, requester_name: str, destination: str, pdf_file: bytes, filename: str):
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>New Mission Assignment - {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0; color: #2980b9;">New Mission Assignment</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Hello <strong>{driver_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    You have been assigned as the driver for a new mission.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <strong>Destination:</strong> {destination}
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    See attached Mission Order for details.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px;">
                                <h2 style="color: #1e293b; margin-top: 0; color: #2980b9;">Nouvelle Affectation de Mission</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Bonjour <strong>{driver_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Vous avez été affecté(e) comme conducteur(trice) pour une nouvelle mission.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <strong>Destination :</strong> {destination}
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Voir l'Ordre de Mission joint pour plus de détails.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send_with_pdf(email_to, f"ASSIGNMENT: New Mission to {destination}", html, pdf_file, filename)

async def send_rejection_email(email_to: str, requester_name: str, request_id: int, reason: str, approver_name: str):
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Request Denied - {settings.APP_NAME}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
                <td align="center" style="padding: 40px 0;">
                    <table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        <tr>
                            <td align="center" style="background-color: #0f172a; padding: 30px;">
                                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">{settings.APP_NAME}</h1>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 40px 40px 20px 40px; background-color: #fff5f5;">
                                <h2 style="color: #c0392b; margin-top: 0;">Request Denied</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Dear <strong>{requester_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Your request <strong>#{request_id}</strong> was denied.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <strong>Reason:</strong> "{reason}"
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <strong>Reviewer:</strong> {approver_name}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 40px;">
                                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 40px 40px 40px; background-color: #fff5f5;">
                                <h2 style="color: #c0392b; margin-top: 0;">Demande Refusée</h2>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Cher/Chère <strong>{requester_name}</strong>,
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    Votre demande <strong>#{request_id}</strong> a été refusée.
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <strong>Raison :</strong> "{reason}"
                                </p>
                                <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                                    <strong>Examinateur :</strong> {approver_name}
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="background-color: #f8fafc; padding: 20px; color: #94a3b8; font-size: 12px;">
                                <p style="margin: 0;">&copy; {settings.APP_NAME}. All rights reserved / Tous droits réservés.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    await _send(email_to, f"DENIED: Vehicle Request #{request_id}", html)