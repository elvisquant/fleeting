from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import engine, Base
from fastapi.responses import HTMLResponse, Response, FileResponse

# Import Routers
from app.routers import (
    user, agency, service, role, dashboard, vehicle, fuel, analytics_api,
    category_maintenance, maintenance, category_panne, garage, panne, reparation, 
    vehicle_make, vehicle_model, vehicle_transmission, vehicle_type,
    approval, request as request_router, fuel_type 
    # Make sure fuel_type.py exists in routers folder
)

# Initialize DB
Base.metadata.create_all(bind=engine)

settings = get_settings()

app = FastAPI(title=settings.APP_NAME)

# Templates & Static
templates = Jinja2Templates(directory="app/templates")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =================================================================
# REGISTER API ROUTERS
# =================================================================
app.include_router(user.router)       
app.include_router(dashboard.router) 
app.include_router(analytics_api.router) 
app.include_router(vehicle.router)    
app.include_router(request_router.router)

# --- ORGANIZATION ---
app.include_router(role.router)
app.include_router(agency.router)
app.include_router(service.router)

# --- OPERATIONS (This fixes your 404s) ---
app.include_router(fuel.router)
app.include_router(maintenance.router)   
app.include_router(panne.router)         
app.include_router(reparation.router)    

# --- LOOKUPS & CATEGORIES ---
app.include_router(fuel_type.router)
app.include_router(garage.router)               
app.include_router(category_maintenance.router) 
app.include_router(category_panne.router)       
app.include_router(vehicle_make.router)
app.include_router(vehicle_model.router)
app.include_router(vehicle_type.router)
app.include_router(vehicle_transmission.router)
app.include_router(approval.router)

# Page Routes (SPA)
@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})

@app.get("/signup.html", response_class=HTMLResponse)
async def signup(request: Request):
    return templates.TemplateResponse("signup.html", {"request": request})

@app.get("/forgot-password.html", response_class=HTMLResponse)
def forgot_password(request: Request):
    return templates.TemplateResponse("forgot-password.html", {"request": request})

@app.get("/user/index.html", response_class=HTMLResponse)
async def spa_shell(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Fallback redirects for legacy links
@app.get("/dashboard.html", response_class=HTMLResponse)
@app.get("/admin/dashboard.html", response_class=HTMLResponse)
async def redirect_old(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    # Ensure the path matches where you put the file in Step 1
    return FileResponse("app/static/img/logo.png")