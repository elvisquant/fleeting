# app/utils/pdf_generator.py

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime

def generate_mission_order_pdf(request, approver_name, passenger_details):
    """
    Generates a Mission Order PDF that complies exactly with the BRB official form.
    """
    buffer = BytesIO()
    # Margins adjusted for official look
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        rightMargin=60, 
        leftMargin=60, 
        topMargin=50, 
        bottomMargin=50
    )
    
    styles = getSampleStyleSheet()
    
    # --- CUSTOM STYLES ---
    header_style = ParagraphStyle('HeaderStyle', fontSize=10, leading=12, alignment=0, fontName='Helvetica-Bold')
    header_sub_style = ParagraphStyle('HeaderSubStyle', fontSize=10, leading=12, alignment=0, fontName='Helvetica')
    title_style = ParagraphStyle('TitleStyle', fontSize=12, leading=14, alignment=1, spaceAfter=25, fontName='Helvetica-Bold')
    body_style = ParagraphStyle('BodyStyle', fontSize=11, leading=16, alignment=4) # Justified
    sig_style = ParagraphStyle('SigStyle', fontSize=10, leading=12, alignment=1, fontName='Helvetica-Bold')
    footer_style = ParagraphStyle('FooterStyle', fontSize=7, leading=9, alignment=1, color=colors.black)

    story = []

    # --- 1. HEADER (Top Left - Matching Image) ---
    story.append(Paragraph("BANQUE DE LA REPUBLIQUE<br/><u>DU BURUNDI</u>", header_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph("DIRECTION DE L'ADMINISTRATION,<br/>ET RESSOURCES HUMAINES.", header_style))
    story.append(Spacer(1, 15))
    story.append(Paragraph("<u>Service Logistique et Patrimoine,</u>", header_sub_style))
    story.append(Spacer(1, 5))
    story.append(Paragraph("<u>Section Charroi</u>", header_sub_style))
    story.append(Spacer(1, 40))

    # --- 2. DOCUMENT TITLE ---
    # Extract year from departure time
    year = request.departure_time.year if request.departure_time else datetime.now().year
    story.append(Paragraph(f"ORDRE DE MISSION n°{request.id}/{year}", title_style))
    story.append(Spacer(1, 20))

    # --- 3. DATA PREPARATION ---
    # Vehicle Make/Model
    make = request.vehicle.vehicle_make.make_name if (request.vehicle and request.vehicle.vehicle_make) else ""
    model = request.vehicle.vehicle_model.model_name if (request.vehicle and request.vehicle.vehicle_model) else ""
    vehicle_full = f"{make} {model}".strip() or "VÉHICULE DE SERVICE"
    
    plate = request.vehicle.plate_number if request.vehicle else "__________"
    destination = request.destination or "__________"
    
    # Date formatting
    date_start = request.departure_time.strftime("%d/%m/%Y") if request.departure_time else "__/__/____"
    date_end = request.return_time.strftime("%d/%m/%Y") if request.return_time else "__/__/____"
    
    driver_name = request.driver.full_name if request.driver else "Self-Driven"

    # --- 4. BODY PARAGRAPHS (Matching Phrasing from Image) ---
    
    # P1: Authorization and Destination
    p1_text = (
        f"Pour des raisons de service, le véhicule <b>{vehicle_full}</b> immatriculé <b>{plate}</b> est "
        f"autorisé à effectuer une mission aller et retour à <b>{destination}</b> en date du <b>{date_start}</b>."
    )
    story.append(Paragraph(p1_text, body_style))
    story.append(Spacer(1, 12))

    # P2: Mission Duration
    p2_text = (
        f"Pour la personne à bord la mission s'étend du <b>{date_start}</b> au <b>{date_end}</b> "
        f"(pas des frais de mission)."
    )
    story.append(Paragraph(p2_text, body_style))
    story.append(Spacer(1, 12))

    # P3: Driver
    p3_text = f"Ledit véhicule est conduit par le chauffeur <b>{driver_name}</b>."
    story.append(Paragraph(p3_text, body_style))
    story.append(Spacer(1, 12))

    # P4: Passengers (Looping through passenger details)
    passenger_string_list = []
    if passenger_details:
        for p in passenger_details:
            dept = p.service.service_name if (p.service and p.service.service_name) else "SMF"
            passenger_string_list.append(f"-Mr/Mme <b>{p.full_name}</b>, du {dept}")
    
    passengers_joined = ". ".join(passenger_string_list)
    p4_text = f"<u>Personnes à bord :</u> {passengers_joined}."
    story.append(Paragraph(p4_text, body_style))
    story.append(Spacer(1, 30))

    # P5: Object of Mission (Bold + Underline)
    p5_text = f"<b><u>Objet de la mission :</u></b> {request.description or 'Mission de travail'}"
    story.append(Paragraph(p5_text, body_style))
    story.append(Spacer(1, 50))

    # --- 5. LOCATION AND DATE ---
    today_formatted = datetime.now().strftime("%d/%m/%Y")
    story.append(Paragraph(f"Fait à Bujumbura, le {today_formatted}", ParagraphStyle('RightAlign', alignment=1, fontSize=11)))
    story.append(Spacer(1, 30))

    # --- 6. SIGNATURE BLOCKS (Using Table for Side-by-Side) ---
    # Left: Logistics Chief, Right: Admin Director (As seen in image)
    sig_data = [
        [
            Paragraph("Ingrid Nelly MUTONI<br/><br/><u>Chef du Service Logistique<br/>et Patrimoine</u>", sig_style),
            Paragraph("Elie NDAYISENGA<br/><br/><u>Directeur de l'Administration<br/>et Ressources Humaines</u>", sig_style)
        ]
    ]
    
    sig_table = Table(sig_data, colWidths=[2.5 * inch, 3.5 * inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))
    story.append(sig_table)

    # --- 7. FOOTER (Small text at the bottom) ---
    story.append(Spacer(1, 1.5 * inch))
    footer_line = "<u>1, avenue du Gouvernement, BP: 705 Bujumbura, Tél: (257) 22 20 40 00/22 27 44 - Fax: (257) 22 22 31 28 - Courriel : brb@brb.bi</u>"
    story.append(Paragraph(footer_line, footer_style))

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    return buffer