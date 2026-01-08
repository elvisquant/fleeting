import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime

def generate_mission_order_pdf(request, approver_name, passenger_details):
    # --- CONFIGURATION: MODIFY SIGNATURES HERE ---
    SIGNATORY_1 = {
        "name": "Ingrid Nelly MUTONI",
        "title": "Chef du Service Logistique<br/>et Patrimoine",
        "stamp_path": "app/static/img/stamp_logistic.png" # Optional: add scanned stamp path
    }
    SIGNATORY_2 = {
        "name": "Elie NDAYISENGA",
        "title": "Directeur de l'Administration<br/>et Ressources Humaines",
        "stamp_path": "app/static/img/stamp_darh.png"    # Optional: add scanned stamp path
    }
    LOGO_PATH = "app/static/img/logo.png"
    # --------------------------------------------

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        rightMargin=50, 
        leftMargin=50, 
        topMargin=40, 
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Styles
    header_bold = ParagraphStyle('HeaderBold', fontSize=10, leading=12, fontName='Helvetica-Bold')
    title_style = ParagraphStyle('TitleStyle', fontSize=13, leading=15, alignment=1, spaceAfter=20, fontName='Helvetica-Bold')
    body_style = ParagraphStyle('BodyStyle', fontSize=11, leading=16, alignment=4) # Alignment 4 = Justified
    footer_style = ParagraphStyle('FooterStyle', fontSize=8, leading=10, alignment=1, color=colors.black)

    story = []

    # --- 1. LOGO AND TOP HEADER ---
    try:
        logo = Image(LOGO_PATH, width=0.8*inch, height=0.8*inch)
        logo.hAlign = 'LEFT'
        story.append(logo)
    except:
        story.append(Paragraph("[LOGO MISSING]", header_bold))

    story.append(Spacer(1, 5))
    story.append(Paragraph("BANQUE DE LA REPUBLIQUE<br/><u>DU BURUNDI</u>", header_bold))
    story.append(Spacer(1, 10))
    story.append(Paragraph("DIRECTION DE L'ADMINISTRATION,<br/>ET RESSOURCES HUMAINES.", header_bold))
    story.append(Spacer(1, 12))
    story.append(Paragraph("<u>Service Logistique et Patrimoine,</u>", header_bold))
    story.append(Spacer(1, 5))
    story.append(Paragraph("<u>Section Charroi</u>", header_bold))
    story.append(Spacer(1, 30))

    # --- 2. DOCUMENT TITLE ---
    year = request.departure_time.year
    story.append(Paragraph(f"ORDRE DE MISSION n°{request.id}/{year}", title_style))
    story.append(Spacer(1, 10))

    # --- 3. DATA & LOGIC ---
    destination = request.destination
    date_start = request.departure_time.strftime("%d/%m/%Y")
    date_end = request.return_time.strftime("%d/%m/%Y")
    
    if request.vehicle:
        vehicle_info = f"{getattr(request.vehicle, 'make', '')} {getattr(request.vehicle, 'model', '')}".strip()
        plate = getattr(request.vehicle, 'plate_number', '_______')
    else:
        vehicle_info = "Véhicule de service"
        plate = "_______"

    # Mission Duration Logic
    is_same_day = request.departure_time.date() == request.return_time.date()
    
    if is_same_day:
        mission_time_text = f"une mission aller et retour à <b>{destination}</b> en date du <b>{date_start}</b>."
    else:
        duration = (request.return_time - request.departure_time).days
        if duration == 0: duration = 1 # Show at least 1 day if dates differ but < 24h
        mission_time_text = (f"une mission à <b>{destination}</b> du <b>{date_start}</b> au <b>{date_end}</b>. "
                            f"La durée de la mission est de <b>{duration} jours</b>.")

    # --- 4. BODY PARAGRAPHS ---
    
    # Paragraph 1
    p1 = f"Pour des raisons de service, le véhicule <b>{vehicle_info}</b> immatriculé <b>{plate}</b> est autorisé à effectuer {mission_time_text}"
    story.append(Paragraph(p1, body_style))
    story.append(Spacer(1, 12))

    # Paragraph 2
    p2 = f"Pour la personne à bord la mission s'étend du <b>{date_start}</b> au <b>{date_end}</b> (pas des frais de mission)."
    story.append(Paragraph(p2, body_style))
    story.append(Spacer(1, 12))

    # Driver
    driver = request.driver.full_name if request.driver else "A désigner"
    story.append(Paragraph(f"Ledit véhicule est conduit par le chauffeur <b>{driver}</b>.", body_style))
    story.append(Spacer(1, 12))

    # --- 5. PASSENGER LIST (NUMBERED) ---
    if len(passenger_details) > 1:
        p_intro = "<u>Personnes à bord :</u>"
        story.append(Paragraph(p_intro, body_style))
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

    # --- 6. LOCATION AND DATE ---
    today = datetime.now().strftime("%d/%m/%Y")
    story.append(Paragraph(f"Fait à Bujumbura, le {today}", ParagraphStyle('Right', alignment=2, fontSize=11)))
    story.append(Spacer(1, 20))

    # --- 7. SIGNATURE TABLE (Swappable Names) ---
    # To include digital signature images, replace the Spacer with an Image()
    sig_cell_1 = [
        Paragraph(SIGNATORY_1["name"], header_bold),
        Spacer(1, 10),
        Paragraph(f"<u>{SIGNATORY_1['title']}</u>", header_bold)
    ]
    
    sig_cell_2 = [
        Paragraph(SIGNATORY_2["name"], header_bold),
        Spacer(1, 10),
        Paragraph(f"<u>{SIGNATORY_2['title']}</u>", header_bold)
    ]

    sig_data = [[sig_cell_1, sig_cell_2]]
    sig_table = Table(sig_data, colWidths=[2.5*inch, 3.5*inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (0,0), 'LEFT'),
        ('ALIGN', (1,1), (1,1), 'CENTER'),
    ]))
    story.append(sig_table)

    # --- 8. FOOTER ---
    story.append(Spacer(1, 1*inch))
    footer_text = "1, avenue du Gouvernement, BP: 705 Bujumbura, Tél: (257) 22 20 40 00/22 27 44 - Fax: (257) 22 22 31 28 - Courriel : brb@brb.bi"
    story.append(Paragraph(f"<hr/>{footer_text}", footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer