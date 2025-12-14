# Vehicle Management System - FastAPI Backend

A robust, modular, and production-ready backend for managing vehicle fleets, user authentication, and operations. Built with FastAPI, PostgreSQL, and Docker.

### Features
- **Authentication:** JWT (Access & Refresh Tokens), Password Hashing (Bcrypt).
- **User Management:** Registration, Account Verification, Password Reset.
- **Role-Based Access Control (RBAC):** Admin, Driver, Logistic, Chef, etc.
- **Database:** PostgreSQL with SQLAlchemy ORM.
- **Email Notifications:** Transactional emails via Brevo (SMTP).
- **Dockerized:** Full container orchestration with Docker Compose.

---

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running.
- [Git](https://git-scm.com/) installed.
- A [Brevo](https://www.brevo.com/) account (for email sending).

---

### 1. Installation

Clone the repository to your local machine:

```bash
git clone git@github.com:elvisquant/fleeting.git
cd fleeting



2. Configuration

Create a .env file in the root directory. You can copy the structure below:

.env


# --- App Settings ---
APP_NAME="Vehicle Management"
DEBUG=True
FRONTEND_HOST=http://localhost:3000

# --- Security ---
SECRET_KEY=change_this_to_a_secure_random_string
JWT_SECRET=change_this_to_another_secure_random_string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_MINUTES=1440

# --- Database (PostgreSQL) ---
POSTGRES_HOST=postgres-service
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secret
POSTGRES_DB=fastapi
POSTGRES_PORT=5432

# --- Email (Brevo SMTP) ---
# Sign up at https://brevo.com to get these credentials
MAIL_SERVER=smtp-relay.brevo.com
MAIL_PORT=587
MAIL_USERNAME=your_brevo_login_email@example.com
MAIL_PASSWORD=your_brevo_smtp_key_xsmtpsib
MAIL_FROM=noreply@yourdomain.com
MAIL_FROM_NAME="Vehicle App Support"
USE_CREDENTIALS=True
MAIL_STARTTLS=True
MAIL_SSL_TLS=False


3. Running the Project

Build and start the services using Docker Compose. This will set up the API, the PostgreSQL database, and the Adminer database tool.


# Build and start in detached mode
docker-compose up -d --build

# To stop the services
docker-compose down



Note: The first build may take a few minutes.
4. Accessing the Application

Once the containers are running, you can access the services at the following URLs:


Service                  URL                                  Description

API Documentation	     http://localhost:8000/docs	          Interactive Swagger UI for testing endpoints.
Database GUI	         http://localhost:8080	              Adminer. Login System: PostgreSQL, Server:  postgres-service, Username/Pass: From .env.

API Status	             http://localhost:8000	              JSON response indicating the API is live.


5. Project Structure

The project follows a modular architecture for scalability:

app/
├── config.py           # Centralized configuration (Pydantic)
├── database.py         # DB connection and session handling
├── email.py            # High-level email business logic
├── email_utils.py      # Low-level SMTP sending utilities
├── main.py             # App entry point
├── models/             # SQLAlchemy Database Models (Users, Vehicles, etc.)
├── routers/            # API Endpoints (Controllers)
├── schemas/            # Pydantic Schemas (Request/Response validation)
├── security.py         # Cryptography (Hashing, Token generation)
├── services/           # Business logic isolation
└── templates/          # HTML Email templates
