# app/utils/pdf_generator.py

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from io import BytesIO
from datetime import datetime
import hashlib
import os

def generate_mission_order_pdf(request, approver_name, passenger_details):
    """
    Generates the official Mission Order PDF for BANQUE DE LA REPUBLIQUE DU BURUNDI.
    This is the exact format as shown in the example document.
    """
    buffer = BytesIO()
    
    def add_letterhead(canvas, doc):
        """Adds the official bank letterhead"""
        canvas.saveState()
        
        # Bank header
        canvas.setFont("Helvetica-Bold", 16)
        canvas.setFillColor(colors.black)
        canvas.drawCentredString(A4[0]/2, 810, "BANQUE DE LA REPUBLIQUE")
        canvas.drawCentredString(A4[0]/2, 790, "DU BURUNDI")
        
        # Separator line
        canvas.setLineWidth(1)
        canvas.line(50, 775, A4[0]-50, 775)
        
        # Department
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawCentredString(A4[0]/2, 755, "DIRECTION DE L'ADMINISTRATION,")
        canvas.drawCentredString(A4[0]/2, 740, "ET RESSOURCES HUMAINES")
        
        # Service
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawCentredString(A4[0]/2, 720, "Service Logistique et Patrimoine.")
        canvas.drawCentredString(A4[0]/2, 705, "Section Charroi")
        
        canvas.restoreState()
    
    def draw_official_stamp(canvas, x, y):
        """Draws the official circular stamp"""
        canvas.saveState()
        
        # Outer circle
        canvas.setStrokeColor(colors.darkblue)
        canvas.setFillColor(colors.white)
        canvas.setLineWidth(2)
        canvas.circle(x, y, 40, stroke=1, fill=0)
        
        # Inner circle
        canvas.setLineWidth(1)
        canvas.circle(x, y, 35, stroke=1, fill=0)
        
        # Stamp text
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(colors.darkblue)
        canvas.drawCentredString(x, y + 12, "OFFICIEL")
        canvas.drawCentredString(x, y + 4, "BANQUE DE LA")
        canvas.drawCentredString(x, y - 4, "RÉPUBLIQUE")
        canvas.drawCentredString(x, y - 12, "DU BURUNDI")
        
        # Year in center
        current_year = datetime.now().strftime("%Y")
        canvas.setFont("Helvetica-Bold", 10)
        canvas.setFillColor(colors.red)
        canvas.drawCentredString(x, y - 22, current_year)
        
        canvas.restoreState()
    
    def draw_signature_block(canvas, x, y, name, title):
        """Draws a signature block with line"""
        canvas.saveState()
        
        # Horizontal line for signature
        canvas.setStrokeColor(colors.black)
        canvas.setLineWidth(1)
        canvas.line(x, y, x + 200, y)
        
        # Name
        canvas.setFont("Helvetica-Bold", 10)
        canvas.setFillColor(colors.black)
        canvas.drawString(x, y - 15, name)
        
        # Title
        canvas.setFont("Helvetica-Oblique", 9)
        canvas.drawString(x, y - 30, title)
        
        canvas.restoreState()
    
    # Create PDF document
    doc = SimpleDocTemplate(
        buffer, 
        pagesize=A4, 
        rightMargin=40, 
        leftMargin=40, 
        topMargin=50, 
        bottomMargin=40
    )
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    normal_style = ParagraphStyle(
        'NormalFR',
        parent=styles['Normal'],
        fontSize=11,
        leading=14,
        fontName='Helvetica'
    )
    
    bold_style = ParagraphStyle(
        'BoldFR',
        parent=styles['Normal'],
        fontSize=11,
        leading=14,
        fontName='Helvetica-Bold'
    )
    
    title_style = ParagraphStyle(
        'TitleFR',
        parent=styles['Normal'],
        fontSize=16,
        leading=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
        spaceAfter=30
    )
    
    small_style = ParagraphStyle(
        'SmallFR',
        parent=styles['Normal'],
        fontSize=9,
        leading=11,
        fontName='Helvetica'
    )
    
    # --- DOCUMENT CONTENT ---
    
    # Mission Order Number (centered)
    order_number = f"ORDRE DE MISSION n°{datetime.now().year}/{request.id}"
    elements.append(Paragraph(order_number, title_style))
    elements.append(Spacer(1, 40))
    
    # Mission details paragraph (exact format from example)
    vehicle_info = request.vehicle.plate_number if request.vehicle else "[PLAQUE]"
    destination = request.destination if request.destination else "[DESTINATION]"
    departure_date = request.departure_time.strftime('%d/%m/%Y') if request.departure_time else "[DATE]"
    return_date = request.return_time.strftime('%d/%m/%Y') if request.return_time else "[DATE]"
    driver_name = request.driver.full_name if request.driver else "[NOM CHAUFFEUR]"
    
    mission_text = f"""
    <para>
    Pour des raisons de service, le véhicule <b>{vehicle_info}</b> est autorisé à effectuer 
    une mission aller et retour à <b>{destination}</b> en date du <b>{departure_date}</b>.
    </para>
    
    <para>
    Pour la(les) personne(s) à bord la mission s'étend du <b>{departure_date}</b> au <b>{return_date}</b>.
    </para>
    
    <para>
    Ledit véhicule est conduit par le chauffeur <b>{driver_name}</b>.
    </para>
    """
    elements.append(Paragraph(mission_text, normal_style))
    elements.append(Spacer(1, 20))
    
    # Passengers section
    if passenger_details and len(passenger_details) > 0:
        elements.append(Paragraph("Personnes à bord :", bold_style))
        for passenger in passenger_details:
            service_name = passenger.service.service_name if passenger.service else ""
            passenger_line = f"    - <b>{passenger.full_name}</b>, de {service_name}."
            elements.append(Paragraph(passenger_line, normal_style))
    else:
        # Default: show requester as passenger
        requester_name = request.requester.full_name if request.requester else "[NOM]"
        requester_service = request.requester.service.service_name if (request.requester and request.requester.service) else "[SERVICE]"
        elements.append(Paragraph("Personne à bord :", bold_style))
        elements.append(Paragraph(f"    - <b>{requester_name}</b>, de {requester_service}.", normal_style))
    
    elements.append(Spacer(1, 20))
    
    # Mission purpose
    purpose = request.description if request.description else "Mission de service."
    elements.append(Paragraph(f"Objet de la mission : {purpose}", normal_style))
    elements.append(Spacer(1, 60))
    
    # Signature location and date
    current_date = datetime.now().strftime('%d/%m/%Y')
    elements.append(Paragraph(f"Fait à Bujumbura, le {current_date}", normal_style))
    elements.append(Spacer(1, 80))
    
    # Footer with contact info (smaller font)
    footer_text = """
    <para alignment="center">
    1. Le cas de la Générationnelle, BP 706 Bujumbura<br/>
    Tél.: (257) 22 20 40 00 / 22 27 44 74<br/>
    Fax: (257) 22 27 31 38<br/>
    Courriel: info@brb.bi
    </para>
    """
    elements.append(Paragraph(footer_text, small_style))
    
    # Document tracking ID (very small, at bottom)
    doc_hash = hashlib.sha256(f"BRB_MISSION_{request.id}_{datetime.now().timestamp()}".encode()).hexdigest()[:12].upper()
    tracking_text = f'<para alignment="center" fontSize="6" color="gray">Réf: {doc_hash} | Système FleetDash</para>'
    elements.append(Paragraph(tracking_text, small_style))
    
    def on_page(canvas, doc):
        """Page rendering callback - adds stamp and signatures"""
        # Add letterhead
        add_letterhead(canvas, doc)
        
        # Draw official stamp at top-right
        stamp_x = A4[0] - 100  # 100 points from right edge
        stamp_y = 620          # Below the header
        draw_official_stamp(canvas, stamp_x, stamp_y)
        
        # Draw signatures at bottom
        # Left signature: Chef de Service
        draw_signature_block(
            canvas,
            100,            # x position (from left)
            200,            # y position from bottom
            "Ingrid WUTONI",
            "Chef de Service Logistique et Patrimoine"
        )
        
        # Right signature: Directeur
        draw_signature_block(
            canvas,
            A4[0] - 300,    # x position (from right)
            200,            # y position from bottom
            "Bienvenu NDAYISENGA",
            "Directeur de l'Administration et Ressources Humaines"
        )
        
        # Page number (very subtle)
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.gray)
        canvas.drawRightString(A4[0]-40, 30, f"1/1")
    
    # Build the PDF
    doc.build(elements, onFirstPage=on_page)
    buffer.seek(0)
    
    return buffer