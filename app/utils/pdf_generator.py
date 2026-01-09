import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime

def generate_mission_order_pdf(request, passenger_details, logistic_officer=None, darh_officer=None):
    """
    Generates a Mission Order PDF.
    logistic_officer: User model instance with 'logistic' role
    darh_officer: User model instance with 'darh' role
    """
    # --- DYNAMIC SIGNATORY SETUP ---
    # We pull the name from the passed objects, or use a placeholder if not found
    name_logistic = logistic_officer.full_name if logistic_officer else "____________________"
    name_darh = darh_officer.full_name if darh_officer else "____________________"
    
    # Titles remain standard for the institution
    TITLE_LOGISTIC = "Chef du Service Logistique<br/>et Patrimoine"
    TITLE_DARH = "Directeur de l'Administration<br/>et Ressources Humaines"
    
    LOGO_PATH = "app/static/img/logo.png"

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
    except:
        pass

    story.append(Spacer(1, 5))
    story.append(Paragraph("BANQUE DE LA REPUBLIQUE<br/><u>DU BURUNDI</u>", header_bold))
    story.append(Spacer(1, 10))
    story.append(Paragraph("DIRECTION DE L'ADMINISTRATION,<br/>ET RESSOURCES HUMAINES.", header_bold))
    story.append(Spacer(1, 12))
    story.append(Paragraph("<u>Service Logistique et Patrimoine,</u>", header_bold))
    story.append(Spacer(1, 5))
    story.append(Paragraph("<u>Section Charroi</u>", header_bold))
    story.append(Spacer(1, 35))

    # --- 2. DOCUMENT TITLE ---
    year = request.departure_time.year
    story.append(Paragraph(f"ORDRE DE MISSION n°{request.id}/{year}", title_style))
    story.append(Spacer(1, 15))

    # --- 3. DATA & MISSION LOGIC ---
    destination = request.destination
    date_start = request.departure_time.strftime("%d/%m/%Y")
    date_end = request.return_time.strftime("%d/%m/%Y")
    
    if request.vehicle:
        vehicle_info = f"{getattr(request.vehicle, 'make', '')} {getattr(request.vehicle, 'model', '')}".strip()
        plate = getattr(request.vehicle, 'plate_number', '_______')
    else:
        vehicle_info = "Véhicule de service"
        plate = "_______"

    # Trip Duration / Aller-Retour Logic
    is_same_day = request.departure_time.date() == request.return_time.date()
    
    if is_same_day:
        time_text = f"une mission aller et retour à <b>{destination}</b> en date du <b>{date_start}</b>."
    else:
        delta = (request.return_time.date() - request.departure_time.date()).days + 1
        time_text = (f"une mission à <b>{destination}</b> du <b>{date_start}</b> au <b>{date_end}</b>. "
                     f"La durée de la mission est de <b>{delta} jours</b>.")

    # --- 4. BODY ---
    p1 = f"Pour des raisons de service, le véhicule <b>{vehicle_info}</b> immatriculé <b>{plate}</b> est autorisé à effectuer {time_text}"
    story.append(Paragraph(p1, body_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph(f"Pour la personne à bord la mission s'étend du <b>{date_start}</b> au <b>{date_end}</b> (pas des frais de mission).", body_style))
    story.append(Spacer(1, 12))

    driver = request.driver.full_name if request.driver else "A désigner"
    story.append(Paragraph(f"Ledit véhicule est conduit par le chauffeur <b>{driver}</b>.", body_style))
    story.append(Spacer(1, 12))

    # --- 5. NUMBERED PASSENGERS ---
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
    today = datetime.now().strftime("%d/%m/%Y")
    story.append(Paragraph(f"Fait à Bujumbura, le {today}", ParagraphStyle('Right', alignment=2, fontSize=11)))
    story.append(Spacer(1, 25))

    # Signatures Table
    sig_cell_1 = [
        Paragraph(name_logistic, sig_style),
        Spacer(1, 10),
        Paragraph(f"<u>{TITLE_LOGISTIC}</u>", sig_style)
    ]
    sig_cell_2 = [
        Paragraph(name_darh, sig_style),
        Spacer(1, 10),
        Paragraph(f"<u>{TITLE_DARH}</u>", sig_style)
    ]

    sig_data = [[sig_cell_1, sig_cell_2]]
    sig_table = Table(sig_data, colWidths=[2.6*inch, 3.4*inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    story.append(sig_table)

    # --- 7. FOOTER ---
    story.append(Spacer(1, 1.2 * inch))
    footer_hr = "__________________________________________________________________________________________________________"
    story.append(Paragraph(footer_hr, footer_style))
    footer_text = "1, avenue du Gouvernement, BP: 705 Bujumbura, Tél: (257) 22 20 40 00/22 27 44 - Fax: (257) 22 22 31 28 - Courriel : brb@brb.bi"
    story.append(Paragraph(footer_text, footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer