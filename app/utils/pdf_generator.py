import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, HRFlowable, Flowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from io import BytesIO
from datetime import datetime

# --- CUSTOM FLOWABLE FOR THE AUTHENTIC OVERLAID STAMP ---
class StampedInk(Flowable):
    """
    Draws a stamp image OVER the text. 
    It has 0 height/width so it doesn't push text down.
    """
    def __init__(self, img_path, width=1.6*inch, height=1.6*inch, x_off=0, y_off=0):
        Flowable.__init__(self)
        self.img_path = img_path
        self.w = width
        self.h = height
        self.x_off = x_off
        self.y_off = y_off

    def draw(self):
        if os.path.exists(self.img_path):
            # 'mask' handles transparency of the PNG
            self.canv.drawImage(self.img_path, self.x_off, self.y_off, 
                                width=self.w, height=self.h, mask='auto')

def generate_mission_order_pdf(request, passenger_details, logistic_officer=None, darh_officer=None):
    # --- DYNAMIC IMAGE PATHS ---
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    IMG_DIR = os.path.join(BASE_DIR, "static", "img")
    
    LOGO_PATH = os.path.join(IMG_DIR, "logo.png")
    SIG_LOGISTIC = os.path.join(IMG_DIR, "stamp_logistic.png")
    SIG_DARH = os.path.join(IMG_DIR, "stamp_darh.png")
    STAMP_ONE = os.path.join(IMG_DIR, "stamp_one.png")

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
    title_style = ParagraphStyle('TitleStyle', fontSize=13, leading=15, alignment=1, fontName='Helvetica-Bold', spaceAfter=20)
    body_style = ParagraphStyle('BodyStyle', fontSize=11, leading=16, alignment=4) 
    sig_style = ParagraphStyle('SigStyle', fontSize=10, leading=12, alignment=1, fontName='Helvetica-Bold')
    footer_style = ParagraphStyle('FooterStyle', fontSize=7.5, leading=10, alignment=1)

    story = []

    # --- 1. INSTITUTIONAL HEADER ---
    try:
        if os.path.exists(LOGO_PATH):
            img = Image(LOGO_PATH, width=0.7*inch, height=0.7*inch)
            img.hAlign = 'LEFT'
            story.append(img)
    except: pass
    
    story.append(Paragraph("BANQUE DE LA REPUBLIQUE DU BURUNDI", header_bold))
    story.append(Spacer(1, 10))
    story.append(Paragraph("DIRECTION DE L'ADMINISTRATION,<br/>ET RESSOURCES HUMAINES", header_bold))
    story.append(Spacer(1, 12))
    story.append(Paragraph("Service Logistique et Patrimoine", header_bold))
    story.append(Paragraph("Section Charroi", header_bold))
    story.append(Spacer(1, 40))

    # --- 2. DOCUMENT TITLE (Underlined) ---
    year = request.departure_time.year if request.departure_time else datetime.now().year
    story.append(Paragraph(f"<u>ORDRE DE MISSION n°{request.id}/{year}</u>", title_style))
    story.append(Spacer(1, 10))

    # --- 3. VEHICLE DATA (Resolving names from refs) ---
    v_make_name = ""
    v_model_name = ""
    if request.vehicle:
        if hasattr(request.vehicle, 'make_ref') and request.vehicle.make_ref:
            v_make_name = getattr(request.vehicle.make_ref, 'vehicle_make', '')
        if hasattr(request.vehicle, 'model_ref') and request.vehicle.model_ref:
            v_model_name = getattr(request.vehicle.model_ref, 'vehicle_model', '')

    vehicle_info = f"{v_make_name} {v_model_name}".strip() or "VÉHICULE DE SERVICE"
    plate = getattr(request.vehicle, 'plate_number', '_______')

    # --- 4. TIME LOGIC ---
    destination = request.destination or "________"
    date_start = request.departure_time.strftime("%d/%m/%Y")
    is_same_day = request.departure_time.date() == request.return_time.date()
    
    if is_same_day:
        time_text = f"une mission aller et retour à <b>{destination}</b> en date du <b>{date_start}</b>."
    else:
        delta = (request.return_time.date() - request.departure_time.date()).days + 1
        time_text = (f"une mission à <b>{destination}</b> du <b>{date_start}</b> au "
                     f"{request.return_time.strftime('%d/%m/%Y')}. La durée est de <b>{delta} jours</b>.")

    # --- 5. BODY PARAGRAPHS ---
    story.append(Paragraph(f"Pour des raisons de service, le véhicule <b>{vehicle_info}</b> immatriculé <b>{plate}</b> est autorisé à effectuer {time_text}", body_style))
    story.append(Spacer(1, 12))
    story.append(Paragraph(f"Pour la personne à bord la mission s'étend du <b>{date_start}</b> au {request.return_time.strftime('%d/%m/%Y') if request.return_time else ''} (pas des frais de mission).", body_style))
    story.append(Spacer(1, 12))
    
    driver = request.driver.full_name if request.driver else "A désigner"
    story.append(Paragraph(f"Ledit véhicule est conduit par le chauffeur <b>{driver}</b>.", body_style))
    story.append(Spacer(1, 12))

    story.append(Paragraph("<u>Personnes à bord :</u>", body_style))
    if passenger_details:
        for i, p in enumerate(passenger_details, 1):
            dept = "SMF"
            if hasattr(p, 'service') and p.service:
                dept = getattr(p.service, 'service_name', 'SMF')
            story.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{i}. Mr/Mme <b>{p.full_name}</b>, du {dept}", body_style))

    story.append(Spacer(1, 20))
    story.append(Paragraph(f"<b><u>Objet de la mission :</u></b> {request.description}", body_style))
    story.append(Spacer(1, 30))

    # --- 6. DATE (High position to avoid stamp overlap) ---
    story.append(Paragraph(f"Fait à Bujumbura, le {datetime.now().strftime('%d/%m/%Y')}", ParagraphStyle('DateRight', alignment=2, fontSize=11, rightIndent=20)))
    story.append(Spacer(1, 60)) 

    # --- 7. SIGNATURE BLOCK (Same horizontal line) ---

    # --- Cell 1: LOGISTIC ---
    log_cell = [
        Paragraph(getattr(logistic_officer, 'full_name', "________________"), sig_style),
        Spacer(1, 2)
    ]
    if os.path.exists(SIG_LOGISTIC):
        log_cell.append(Image(SIG_LOGISTIC, width=1.1*inch, height=0.4*inch))
    log_cell.append(Paragraph("<u>Chef du Service Logistique et Patrimoine</u>", sig_style))

    # --- Cell 2: DARH (Stamp OVER Name and Signature) ---
    darh_cell = []
    
    # We add the StampedInk Flowable.
    # In the screenshot, the stamp was too high. 
    # y_off: Negative values pull it DOWN towards the text.
    # x_off: Positive values move it RIGHT.
    if os.path.exists(STAMP_ONE):
        # Adjusted: -40 pulls it down over the Name, 20 centers it horizontally in the cell
        darh_cell.append(StampedInk(STAMP_ONE, width=1.6*inch, height=1.6*inch, x_off=20, y_off=-55))
    
    darh_cell.append(Paragraph(getattr(darh_officer, 'full_name', "________________"), sig_style))
    darh_cell.append(Spacer(1, 2))
    
    if os.path.exists(SIG_DARH):
        # Blue ink signature
        darh_cell.append(Image(SIG_DARH, width=1.1*inch, height=0.4*inch))
        
    darh_cell.append(Paragraph("<u>Directeur de l'Administration et Ressources Humaines</u>", sig_style))

    # Single row table keeps both cells on the same horizontal line
    sig_table = Table([[log_cell, darh_cell]], colWidths=[2.8*inch, 3.2*inch])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(sig_table)

    # --- 8. FOOTER ---
    story.append(Spacer(1, 1.3 * inch))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.black, spaceBefore=1, spaceAfter=5))
    footer_text = "1, avenue du Gouvernement, BP: 705 Bujumbura, Tél: (257) 22 20 40 00/22 27 44 - Fax: (257) 22 22 31 28 - Courriel : brb@brb.bi"
    story.append(Paragraph(footer_text, footer_style))

    doc.build(story)
    buffer.seek(0)
    return buffer