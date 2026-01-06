# 🚛 FleetDash - Enterprise Fleet Management System

![Status](https://img.shields.io/badge/Status-Production-success?style=for-the-badge)
![CI/CD](https://img.shields.io/github/actions/workflow/status/elvisquant/fleeting/deploy.yml?style=for-the-badge&label=GCP%20Deploy)
![Python](https://img.shields.io/badge/Python-3.11-blue?style=for-the-badge&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688?style=for-the-badge&logo=fastapi)
![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=for-the-badge&logo=docker)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=for-the-badge&logo=postgresql)

> **A robust, full-stack fleet management solution engineered for operational efficiency, auditability, and role-based security.**

---

## 📖 Overview

**FleetDash** is a comprehensive SPA (Single Page Application) designed to digitize vehicle logistics for mid-to-large enterprises. It replaces paper trails with a centralized digital dashboard handling everything from vehicle procurement to daily mission requests.

The system is built on a **Micro-service ready architecture** using FastAPI, enforcing strict **Role-Based Access Control (RBAC)**, and features a complex **3-Tier Approval Workflow** for vehicle dispatching.

#### 🚀 Live Demo
* **Live App:** [https://app.elvisquant.com](https://app.elvisquant.com) 
* **API Docs:** [https://app.elvisquant.com/docs](https://app.elvisquant.com/docs)

---

## ✨ Key Features

### 🔐 Security & Access Control
*   **JWT Authentication:** Secure stateless authentication with Access/Refresh token rotation.
*   **Granular RBAC:** 6+ distinct roles (`superadmin`,`admin`, `darh`, `logistic`,`charoi`, `chef`, `driver`, `Operateur`,`technicien`,`accountant`,`user`).
*   **Dynamic UI:** The frontend automatically adapts menus and actions based on the user's permission level.

### 🚗 Fleet Operations
*   **Vehicle Inventory:** Detailed tracking of VIN, specs, purchase history, and real-time status.
*   **Fuel Management:** Immutable fuel logging with **Verification Locking** (once verified by Admin, records become read-only).
*   **Maintenance & Repairs:** Garage assignments, cost tracking, and incident reporting.

### 🔄 Intelligent Workflows
*   **Multi-Stage Approvals:** Vehicle requests must pass a strict chain of command:
    1.  **Chef de Service** validates the need.
    2.  **Logistics** confirms vehicle availability.
    3.  **Fleet Manager (Charoi)** grants final release.
*   **Bulk Operations:** Batch verification for Fuel and Maintenance logs to streamline administrative work.

---

## 🛠 Tech Stack

### Backend
*   **Framework:** FastAPI (Python 3.11)
*   **Database:** PostgreSQL (Async SQLAlchemy ORM)
*   **Migrations:** Alembic
*   **Validation:** Pydantic V2

### Frontend
*   **Architecture:** Vanilla JS SPA (Lightweight Custom Router)
*   **Styling:** Tailwind CSS + Glassmorphism UI
*   **Icons:** Lucide

### DevOps & Infrastructure
*   **Containerization:** Docker & Docker Compose
*   **CI/CD:** GitHub Actions (Automated build & push to Docker Hub)
*   **Cloud:** Google Cloud Platform (Compute Engine)
*   **Server:** Nginx (Reverse Proxy with SSL)

---

## 🏗 Architecture & Design Decisions

### 1. The SPA "Shell" Architecture
Instead of using a heavy frontend framework like React for this internal tool, I architected a **lightweight, vanilla JavaScript router**.
*   **`index.html`** acts as the App Shell (Sidebar + Header).
*   **`router.js`** dynamically injects HTML partials (`users.html`, `vehicles.html`) into the DOM.
*   This results in **sub-100ms load times** and zero build-step complexity for the frontend.

### 2. Immutable Verification Logic
To prevent fraud in Fuel and Maintenance logs, a **Locking Mechanism** was implemented in the backend:
*   Standard users can `Create` logs.
*   Admins can `Verify` logs.
*   **Constraint:** Once `is_verified=True`, the record is locked at the Database level. No API endpoint allows modification of a verified record, ensuring audit integrity.

---

## 🚀 Getting Started (Local Development)

### Prerequisites
*   Docker & Docker Compose
*   Git

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/elvisquant/fleeting.git
    cd fleeting
    ```

2.  **Environment Setup**
    ```bash
    # Create .env file from example
    cp .env.example .env
    # (Edit .env with your local DB credentials)
    ```

3.  **Start Services (Docker)**
    ```bash
    docker compose up -d --build
    ```

4.  **Run Migrations**
    ```bash
    docker compose exec fastapi-service alembic upgrade head
    ```

5.  **Access the App**
    *   Frontend: `http://localhost:8000`
    *   Swagger API: `http://localhost:8000/docs`
    *   Database Admin (Adminer): `http://localhost:8080`

---

## ⚙️ Deployment Pipeline (CI/CD)

The project utilizes a fully automated **GitHub Actions** pipeline (`deploy.yml`):

1.  **Push to Main:** Developer pushes code to GitHub.
2.  **Build:** GitHub Runner builds the Docker Image.
3.  **Push Registry:** Image pushed to Docker Hub (`elvisquant/fleetdash-backend`).
4.  **Deploy:** Action SSHs into the GCP Server.
5.  **Update:** Pulls the new image, restarts containers, and applies Database Migrations automatically.

---

## 📸 Screenshots

| Dashboard Overview | Vehicle Management |
|:---:|:---:|
| <img src="./screenshots/dashboard.png" alt="Dashboard" width="100%"> | <img src="./screenshots/vehicles.png" alt="Vehicles" width="100%"> |

| Dashboard Overview | Vehicle Management |
|:---:|:---:|
| <img src="./screenshots/dashboard.png" alt="Dashboard" width="100%"> | <img src="./screenshots/vehicles.png" alt="Vehicles" width="100%"> |

| Approval Workflow | Mobile Responsive |
|:---:|:---:|
| <img src="./screenshots/dashboard.png" alt="Dashboard" width="100%"> | <img src="./screenshots/vehicles.png" alt="Vehicles" width="100%"> |

---

## 🤝 Contact & Hire

I built this project to demonstrate my ability to handle **Complex System Architecture**, **Database Design**, and **DevOps Automation**.

If you are looking for a **Senior Full-Stack Engineer** who understands the full lifecycle of software development—from database schema to production deployment—let's talk.I am always open to share with others my skills and tech experience.

*   **Portfolio:** [elvisquant.com](https://elvisquant.com)
*   **LinkedIn:** [linkedin.com/in/elvisquant](https://linkedin.com/in/elvisquant)
*   **Email:** elvis@elvisquant.com


[![Sponsor](https://img.shields.io/badge/Sponsor-EA4AAA?style=for-the-badge&logo=github-sponsors&logoColor=white)](https://github.com/sponsors/elvisquant)