import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime

def generate_mission_order_pdf(request, passenger_details, logistic_officer=None, darh_officer=None):
    # --- IMAGE PATHS ---
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    LOGO_PATH = os.path.join(BASE_DIR, "static", "img", "logo.png")
    SIG_LOGISTIC = os.path.join(BASE_DIR, "static", "img", "stamp_logistic.png")
    SIG_DARH = os.path.join(BASE_DIR, "static", "img", "stamp_darh.png")
    STAMP_ONE = os.path.join(BASE_DIR, "static", "img", "stamp_one.png")

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        rightMargin=50, 
        leftMargin=50, 
        topMargin=30, 
        bottomMargin=30
    )
    
    styles = getSampleStyleSheet()
    header_bold = ParagraphStyle('HeaderBold', fontSize=10, leading=12, fontName='Helvetica-Bold')
    title_style = ParagraphStyle('TitleStyle', fontSize=13, leading=15, alignment=1, spaceAfter=20, fontName='Helvetica-Bold')
    body_style = ParagraphStyle('BodyStyle', fontSize=11, leading=16, alignment=4) 
    sig_style = ParagraphStyle('SigStyle', fontSize=10, leading=12, alignment=1, fontName='Helvetica-Bold')
    footer_style = ParagraphStyle('FooterStyle', fontSize=7, leading=9, alignment=1, color=colors.black)

    story = []

    # --- 1. LOGO AND HEADER ---
    try:
        if os.path.exists(LOGO_PATH):
            logo = Image(LOGO_PATH, width=0.7*inch, height=0.7*inch)
            logo.hAlign = 'LEFT'
            story.append(logo)
    except: pass

    story.append(Paragraph("BANQUE DE LA REPUBLIQUE<br/><u>DU BURUNDI</u>", header_bold))
    story.append(Spacer(1, 10))
    story.append(Paragraph("DIRECTION DE L'ADMINISTRATION,<br/>ET RESSOURCES HUMAINES.", header_bold))
    story.append(Spacer(1, 12))
    story.append(Paragraph("<u>Service Logistique et Patrimoine,</u>", header_bold))
    story.append(Paragraph("<u>Section Charroi</u>", header_bold))
    story.append(Spacer(1, 35))

    # --- 2. DOCUMENT TITLE ---
    year = request.departure_time.year
    story.append(Paragraph(f"ORDRE DE MISSION n°{request.id}/{year}", title_style))
    story.append(Spacer(1, 15))

    # --- 3. VEHICLE DATA (RESOLVING NAMES) ---
    v_make = ""
    v_model = ""
    if request.vehicle:
        if hasattr(request.vehicle, 'vehicle_make') and request.vehicle.vehicle_make:
            v_make = getattr(request.vehicle.vehicle_make, 'vehicle_make', '')
        if hasattr(request.vehicle, 'vehicle_model') and request.vehicle.vehicle_model:
            v_model = getattr(request.vehicle.vehicle_model, 'vehicle_model', '')
            
    vehicle_info = f"{v_make} {v_model}".strip() or "VÉHICULE DE SERVICE"
    plate = getattr(request.vehicle, 'plate_number', '_______') if request.vehicle else "_______"

    destination = request.destination
    date_start = request.departure_time.strftime("%d/%m/%Y")
    is_same_day = request.departure_time.date() == request.return_time.date()
    
    if is_same_day:
        time_text = f"une mission aller et retour à <b>{destination}</b> en date du <b>{date_start}</b>."
    else:
        delta = (request.return_time.date() - request.departure_time.date()).days + 1
        time_text = (f"une mission à <b>{destination}</b> du <b>{date_start}</b> au "
                     f"{request.return_time.strftime('%d/%m/%Y')}. La durée est de <b>{delta} jours</b>.")

    # --- 4. BODY ---
    story.append(Paragraph(f"Pour des raisons de service, le véhicule <b>{vehicle_info}</b> immatriculé <b>{plate}</b> est autorisé à effectuer {time_text}", body_style))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Pour la personne à bord la mission s'étend du <b>{date_start}</b> au {request.return_time.strftime('%d/%m/%Y')} (pas des frais de mission).", body_style))
    story.append(Spacer(1, 12))
    driver = request.driver.full_name if request.driver else "A désigner"
    story.append(Paragraph(f"Ledit véhicule est conduit par le chauffeur <b>{driver}</b>.", body_style))
    story.append(Spacer(1, 12))

    # --- 5. NUMBERED PASSENGERS ---
    story.append(Paragraph("<u>Personnes à bord :</u>", body_style))
    if len(passenger_details) > 0:
        for i, p in enumerate(passenger_details, 1):
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{i}. Mr/Mme <b>{p.full_name}</b>", body_style))
    else:
        story.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;Aucune personne enregistrée.", body_style))

    story.append(Spacer(1, 20))
    story.append(Paragraph(f"<b><u>Objet de la mission :</u></b> {request.description}", body_style))
    story.append(Spacer(1, 40))

    # --- 6. DATE & SIGNATURES (Name -> Signature Under Name -> Right Aligned) ---
    story.append(Paragraph(f"Fait à Bujumbura, le {datetime.now().strftime('%d/%m/%Y')}", ParagraphStyle('Right', alignment=2, fontSize=11)))
    story.append(Spacer(1, 20))

    # --- LOGISTIC CELL ---
    log_cell = []
    log_cell.append(Paragraph(logistic_officer.full_name if logistic_officer else "________________", sig_style))
    if os.path.exists(SIG_LOGISTIC):
        log_cell.append(Image(SIG_LOGISTIC, width=1.1*inch, height=0.4*inch))
    log_cell.append(Paragraph("<u>Chef du Service Logistique</u>", sig_style))

    # --- DARH CELL ---
    darh_cell = []
    if os.path.exists(STAMP_ONE):
        # Round stamp at the top
        img_stamp = Image(STAMP_ONE, width=1.0*inch, height=1.0*inch)
        darh_cell.append(img_stamp)
    
    darh_cell.append(Paragraph(darh_officer.full_name if darh_officer else "________________", sig_style))
    
    if os.path.exists(SIG_DARH):
        # Signature Image UNDER the name
        img_sig = Image(SIG_DARH, width=1.1*inch, height=0.4*inch)
        darh_cell.append(img_sig)

    darh_cell.append(Paragraph("<u>Directeur de l'Administration</u>", sig_style))

    # Column widths: Logistic block is slightly smaller, DARH block (right) is slightly larger
    sig_data = [[log_cell, darh_cell]]
    sig_table = Table(sig_data, colWidths=[2.5*inch, 3.5*inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'), # Centers content within the respective columns
    ]))
    story.append(sig_table)

    # --- 7. FOOTER ---
    story.append(Spacer(1, 1 * inch))
    footer_text = "1, avenue du Gouvernement, BP: 705 Bujumbura, Tél: (257) 22 20 40 00/22 27 44 - Fax: (257) 22 22 31 28 - Courriel : brb@brb.bi"
    story.append(Paragraph(f"<hr color='black'/><br/>{footer_text}", footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer