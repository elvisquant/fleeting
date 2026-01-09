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
    # Paths adjusted to reach app/static/img/
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

    # --- 1. HEADER & LOGO ---
    try:
        if os.path.exists(LOGO_PATH):
            logo = Image(LOGO_PATH, width=0.7*inch, height=0.7*inch)
            logo.hAlign = 'LEFT'
            story.append(logo)
    except: pass

    story.append(Spacer(1, 5))
    story.append(Paragraph("BANQUE DE LA REPUBLIQUE<br/><u>DU BURUNDI</u>", header_bold))
    story.append(Spacer(1, 10))
    story.append(Paragraph("DIRECTION DE L'ADMINISTRATION,<br/>ET RESSOURCES HUMAINES.", header_bold))
    story.append(Spacer(1, 12))
    story.append(Paragraph("<u>Service Logistique et Patrimoine,</u>", header_bold))
    story.append(Spacer(1, 5))
    story.append(Paragraph("<u>Section Charroi</u>", header_bold))
    story.append(Spacer(1, 35))

    # --- 2. TITLE ---
    year = request.departure_time.year
    story.append(Paragraph(f"ORDRE DE MISSION n°{request.id}/{year}", title_style))
    story.append(Spacer(1, 15))

    # --- 3. VEHICLE DATA (FIXED FOR NAMES INSTEAD OF IDS) ---
    if request.vehicle:
        # Assuming relationships are named 'vehicle_make' and 'vehicle_model' in your model
        # Update these attribute names if they differ in your models.py
        v_make = getattr(request.vehicle.vehicle_make, 'name', '') if hasattr(request.vehicle, 'vehicle_make') else ""
        v_model = getattr(request.vehicle.vehicle_model, 'name', '') if hasattr(request.vehicle, 'vehicle_model') else ""
        
        # Fallback to direct attribute if strings, otherwise keep empty
        if not v_make: v_make = getattr(request.vehicle, 'make', '')
        if not v_model: v_model = getattr(request.vehicle, 'model', '')
            
        vehicle_info = f"{v_make} {v_model}".strip()
        plate = getattr(request.vehicle, 'plate_number', '_______')
    else:
        vehicle_info = "Véhicule de service"
        plate = "_______"

    destination = request.destination
    date_start = request.departure_time.strftime("%d/%m/%Y")
    date_end = request.return_time.strftime("%d/%m/%Y")

    is_same_day = request.departure_time.date() == request.return_time.date()
    if is_same_day:
        time_text = f"une mission aller et retour à <b>{destination}</b> en date du <b>{date_start}</b>."
    else:
        delta = (request.return_time.date() - request.departure_time.date()).days + 1
        time_text = (f"une mission à <b>{destination}</b> du <b>{date_start}</b> au <b>{date_end}</b>. "
                     f"La durée de la mission est de <b>{delta} jours</b>.")

    # --- 4. BODY ---
    story.append(Paragraph(f"Pour des raisons de service, le véhicule <b>{vehicle_info}</b> immatriculé <b>{plate}</b> est autorisé à effectuer {time_text}", body_style))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Pour la personne à bord la mission s'étend du <b>{date_start}</b> au <b>{date_end}</b> (pas des frais de mission).", body_style))
    story.append(Spacer(1, 12))
    driver = request.driver.full_name if request.driver else "A désigner"
    story.append(Paragraph(f"Ledit véhicule est conduit par le chauffeur <b>{driver}</b>.", body_style))
    story.append(Spacer(1, 12))

    # --- 5. PASSENGERS (NUMBERED) ---
    if len(passenger_details) > 1:
        story.append(Paragraph("<u>Personnes à bord :</u>", body_style))
        for i, p in enumerate(passenger_details, 1):
            dept = getattr(p.service, 'service_name', 'SMF')
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{i}. Mr/Mme <b>{p.full_name}</b>, du {dept}", body_style))
    else:
        p = passenger_details[0] if passenger_details else None
        name = p.full_name if p else "Aucun"
        dept = getattr(p.service, 'service_name', 'SMF') if p else ""
        story.append(Paragraph(f"<u>Personnes à bord :</u> Mr/Mme <b>{name}</b>, du {dept}.", body_style))

    story.append(Spacer(1, 20))
    story.append(Paragraph(f"<b><u>Objet de la mission :</u></b> {request.description}", body_style))
    story.append(Spacer(1, 40))

    # --- 6. DATE & SIGNATURES ---
    story.append(Paragraph(f"Fait à Bujumbura, le {datetime.now().strftime('%d/%m/%Y')}", ParagraphStyle('Right', alignment=2, fontSize=11)))
    story.append(Spacer(1, 10))

    # --- SIGNATURE BLOCK PREPARATION ---
    # LOGISTIC CELL
    logistic_elements = []
    if os.path.exists(SIG_LOGISTIC):
        img = Image(SIG_LOGISTIC, width=1.4*inch, height=0.6*inch)
        img.hAlign = 'CENTER'
        logistic_elements.append(img)
    logistic_elements.append(Paragraph(logistic_officer.full_name if logistic_officer else "________________", sig_style))
    logistic_elements.append(Paragraph("<u>Chef du Service Logistique<br/>et Patrimoine</u>", sig_style))

    # DARH CELL (Signature + Stamp)
    darh_elements = []
    # Overlay signature and stamp using a small nested table if they overlap, 
    # but here we stack them for clarity.
    if os.path.exists(SIG_DARH):
        img_sig = Image(SIG_DARH, width=1.4*inch, height=0.6*inch)
        darh_elements.append(img_sig)
    
    if os.path.exists(STAMP_ONE):
        img_stamp = Image(STAMP_ONE, width=1.1*inch, height=1.1*inch)
        darh_elements.append(img_stamp)

    darh_elements.append(Paragraph(darh_officer.full_name if darh_officer else "________________", sig_style))
    darh_elements.append(Paragraph("<u>Directeur de l'Administration<br/>et Ressources Humaines</u>", sig_style))

    sig_data = [[logistic_elements, darh_elements]]
    sig_table = Table(sig_data, colWidths=[2.6*inch, 3.4*inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    story.append(sig_table)

    # --- 7. FOOTER ---
    story.append(Spacer(1, 1.2 * inch))
    story.append(Paragraph("_"*100, footer_style))
    
    footer_text = "1, avenue du Gouvernement, BP: 705 Bujumbura, Tél: (257) 22 20 40 00/22 27 44 - Fax: (257) 22 22 31 28 - Courriel : brb@brb.bi"
    story.append(Paragraph(footer_text, footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer
