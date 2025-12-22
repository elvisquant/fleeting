# app/utils/pdf_generator.py

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import code128
from reportlab.graphics.shapes import Drawing, Line
from io import BytesIO
from datetime import datetime
import hashlib
import os

def generate_mission_order_pdf(request, approver_name, passenger_details):
    """
    Generates professional Mission Order PDF matching the exact format of BANQUE DE LA REPUBLIQUE DU BURUNDI.
    Includes logo and exact formatting from the provided example.
    """
    buffer = BytesIO()
    
    # Constants for positioning
    PAGE_WIDTH, PAGE_HEIGHT = A4
    MARGIN_LEFT = 40
    MARGIN_RIGHT = 40
    
    def add_professional_header(canvas, doc):
        """Adds the professional header with logo from the example document"""
        canvas.saveState()
        
        # Draw logo placeholder (you'll replace with actual logo image)
        # The example shows a logo on the left side
        try:
            # Try to load logo if exists
            logo_path = "/static/img/logo.png"
            if os.path.exists(logo_path):
                logo = Image(logo_path)
                logo.drawHeight = 50
                logo.drawWidth = 50
                logo_x = MARGIN_LEFT
                logo_y = PAGE_HEIGHT - 60
                logo.drawOn(canvas, logo_x, logo_y)
            else:
                # Draw placeholder logo box
                canvas.setFillColor(colors.lightgrey)
                canvas.rect(MARGIN_LEFT, PAGE_HEIGHT - 110, 50, 50, fill=1, stroke=0)
                canvas.setFillColor(colors.darkblue)
                canvas.setFont("Helvetica-Bold", 8)
                canvas.drawString(MARGIN_LEFT + 5, PAGE_HEIGHT - 80, "LOGO")
                canvas.drawString(MARGIN_LEFT + 5, PAGE_HEIGHT - 90, "BRB")
        except:
            pass
        
        # Bank name and address - EXACT format from your document
        canvas.setFont("Helvetica-Bold", 14)
        canvas.setFillColor(colors.black)
        
        # Main bank name
        bank_y = PAGE_HEIGHT - 60
        canvas.drawString(MARGIN_LEFT + 60, bank_y, "BANQUE DE LA REPUBLIQUE")
        canvas.drawString(MARGIN_LEFT + 60, bank_y - 15, "DU BURUNDI")
        
        # Separator line
        canvas.setLineWidth(0.5)
        canvas.setStrokeColor(colors.black)
        canvas.line(MARGIN_LEFT, PAGE_HEIGHT - 85, PAGE_WIDTH - MARGIN_RIGHT, PAGE_HEIGHT - 85)
        
        # Department - exactly as in your document
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(MARGIN_LEFT + 60, PAGE_HEIGHT - 105, "DIRECTION DE L'ADMINISTRATION,")
        canvas.drawString(MARGIN_LEFT + 60, PAGE_HEIGHT - 120, "ET RESSOURCES HUMAINES")
        
        # Service - exactly as in your document
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(MARGIN_LEFT + 60, PAGE_HEIGHT - 140, "Service Logistique et Patrimoine.")
        canvas.drawString(MARGIN_LEFT + 60, PAGE_HEIGHT - 155, "Section Charroi")
        
        # Official stamp/approval box (top right)
        stamp_x = PAGE_WIDTH - MARGIN_RIGHT - 80
        stamp_y = PAGE_HEIGHT - 80
        
        # Draw official approval box like in your document
        canvas.setStrokeColor(colors.darkblue)
        canvas.setLineWidth(1.5)
        canvas.rect(stamp_x, stamp_y - 30, 70, 40, stroke=1, fill=0)
        
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(colors.darkblue)
        canvas.drawCentredString(stamp_x + 35, stamp_y - 10, "APPROUVÉ")
        canvas.drawCentredString(stamp_x + 35, stamp_y - 20, datetime.now().strftime("%d/%m/%Y"))
        
        canvas.restoreState()
    
    def draw_official_signatures(canvas):
        """Draws the official signatures exactly as in the example"""
        canvas.saveState()
        
        # Signature positions (from bottom of page)
        sig_y_from_bottom = 120
        
        # Left signature - Chef de Service
        left_sig_x = MARGIN_LEFT + 50
        
        # Signature line
        canvas.setStrokeColor(colors.black)
        canvas.setLineWidth(1)
        canvas.line(left_sig_x, sig_y_from_bottom, left_sig_x + 150, sig_y_from_bottom)
        
        # Name - exactly as in your document
        canvas.setFont("Helvetica-Bold", 11)
        canvas.setFillColor(colors.black)
        canvas.drawString(left_sig_x, sig_y_from_bottom - 20, "Ingrid N. WUTONI")
        
        # Title - exactly as in your document
        canvas.setFont("Helvetica", 9)
        canvas.drawString(left_sig_x, sig_y_from_bottom - 35, "Chef de Service Logistique et Patrimoine")
        
        # Right signature - Directeur
        right_sig_x = PAGE_WIDTH - MARGIN_RIGHT - 200
        
        # Signature line
        canvas.line(right_sig_x, sig_y_from_bottom, right_sig_x + 150, sig_y_from_bottom)
        
        # Name - exactly as in your document
        canvas.setFont("Helvetica-Bold", 11)
        canvas.drawString(right_sig_x, sig_y_from_bottom - 20, "Bienvenu NDAYISENGA")
        
        # Title - exactly as in your document
        canvas.setFont("Helvetica", 9)
        canvas.drawString(right_sig_x, sig_y_from_bottom - 35, "Directeur de l'Administration et Ressources Humaines")
        
        canvas.restoreState()
    
    def add_footer_info(canvas):
        """Adds the footer information exactly as in the example"""
        canvas.saveState()
        
        footer_y = 70
        
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.black)
        
        # Footer text - exactly as in your document
        canvas.drawString(MARGIN_LEFT, footer_y, "1. Le cas de la Générationnelle, BP 706 Bujumbura")
        canvas.drawString(MARGIN_LEFT, footer_y - 12, "Tél.: (257) 22 20 40 00 / 22 27 44 74")
        canvas.drawString(MARGIN_LEFT, footer_y - 24, "Fax: (257) 22 27 31 38")
        canvas.drawString(MARGIN_LEFT, footer_y - 36, "Courriel: info@brb.bi")
        
        # Document reference
        doc_ref = f"Réf: BRB/MO/{datetime.now().strftime('%Y%m')}/{request.id:06d}"
        canvas.drawRightString(PAGE_WIDTH - MARGIN_RIGHT, footer_y, doc_ref)
        
        canvas.restoreState()
    
    # Create PDF document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=MARGIN_RIGHT,
        leftMargin=MARGIN_LEFT,
        topMargin=170,  # More space for header
        bottomMargin=100
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles matching the document
    title_style = ParagraphStyle(
        'MissionTitle',
        parent=styles['Normal'],
        fontSize=16,
        leading=20,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold',
        spaceAfter=30,
        textColor=colors.black
    )
    
    normal_style = ParagraphStyle(
        'NormalText',
        parent=styles['Normal'],
        fontSize=11,
        leading=15,
        fontName='Helvetica',
        spaceAfter=12
    )
    
    bold_style = ParagraphStyle(
        'BoldText',
        parent=styles['Normal'],
        fontSize=11,
        leading=15,
        fontName='Helvetica-Bold',
        spaceAfter=6
    )
    
    small_style = ParagraphStyle(
        'SmallText',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
        fontName='Helvetica',
        spaceAfter=6
    )
    
    # --- DOCUMENT CONTENT ---
    
    # Mission Order Number - centered
    order_number = f"ORDRE DE MISSION n°{datetime.now().year}/{request.id}"
    elements.append(Paragraph(order_number, title_style))
    elements.append(Spacer(1, 30))
    
    # Get data with fallbacks
    vehicle_plate = request.vehicle.plate_number if request.vehicle else "[PLAQUE VÉHICULE]"
    destination = request.destination if request.destination else "[DESTINATION]"
    departure_date = request.departure_time.strftime('%d/%m/%Y') if request.departure_time else "[DATE]"
    return_date = request.return_time.strftime('%d/%m/%Y') if request.return_time else "[DATE]"
    driver_name = request.driver.full_name if request.driver else "[NOM CHAUFFEUR]"
    
    # Mission text - EXACT format from your document
    mission_text = f"""
    <para>
    Pour des raisons de service, le véhicule <b>{vehicle_plate}</b> est autorisé à effectuer une mission aller et retour à <b>{destination}</b> en date du <b>{departure_date}</b>.
    </para>
    
    <para>
    Pour la(les) personne(s) à bord la mission s'étend du <b>{departure_date}</b> au <b>{return_date}</b> (pas des frais de mission).
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
            passenger_line = f"- <b>{passenger.full_name}</b>, {service_name}."
            elements.append(Paragraph(passenger_line, normal_style))
    else:
        # Default passenger (requester)
        requester_name = request.requester.full_name if request.requester else "[NOM]"
        requester_service = request.requester.service.service_name if (request.requester and request.requester.service) else "[SERVICE]"
        elements.append(Paragraph("Personne à bord :", bold_style))
        elements.append(Paragraph(f"- <b>{requester_name}</b>, {requester_service}.", normal_style))
    
    elements.append(Spacer(1, 25))
    
    # Mission purpose - EXACT format
    purpose = request.description if request.description else "Déplacer ce cadre pour une mission de travail."
    elements.append(Paragraph(f"Objet de la mission : {purpose}", bold_style))
    elements.append(Spacer(1, 40))
    
    # Location and date - EXACT format
    location_date = f"Fait à Bujumbura, le {datetime.now().strftime('%d/%m/%Y')}"
    elements.append(Paragraph(location_date, normal_style))
    
    # Add space for signatures (will be drawn by canvas)
    elements.append(Spacer(1, 120))
    
    # Add footer space
    elements.append(Spacer(1, 80))
    
    def build_pdf(canvas, doc):
        """Build callback for all pages"""
        add_professional_header(canvas, doc)
        draw_official_signatures(canvas)
        add_footer_info(canvas)
        
        # Add page number if multi-page (though mission orders are typically 1 page)
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.gray)
        canvas.drawRightString(PAGE_WIDTH - MARGIN_RIGHT, 30, f"Page 1/1")
    
    # Build the PDF
    doc.build(elements, onFirstPage=build_pdf, onLaterPages=build_pdf)
    buffer.seek(0)
    
    return buffer