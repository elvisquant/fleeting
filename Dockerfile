FROM python:3.11

# set work directory
WORKDIR /usr/srv

# set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Create the user
RUN useradd -rm -d /code -s /bin/bash -g root -G sudo -u 1001 ubuntu

# 1. Copy requirements first (for caching)
COPY ./requirements.txt /usr/srv/requirements.txt

# 2. Install dependencies
RUN pip install --no-cache-dir --upgrade -r requirements.txt

# ========================================================
# 3. CRITICAL FIX: COPY THE APP CODE
# We use chown so the 'ubuntu' user owns the files
# ========================================================
COPY --chown=ubuntu:root . .

# Switch to non-root user
USER ubuntu

EXPOSE 8000

# 4. REMOVED '--reload' (Not recommended for production)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]