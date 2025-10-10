# Use a slim Python base
FROM python:3.10-slim

# Install system deps needed for cryptography/papermill
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    gcc \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install jupyter ipykernel papermill
RUN python -m ipykernel install --name=python3 --display-name "Python 3"

# Create app dir
WORKDIR /app

# Copy requirements & executor
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip
RUN pip install -r /app/requirements.txt

# Copy executor
COPY executor.py /app/executor.py

# Expose port
EXPOSE 8443

# Runtime env defaults (can be overridden by gcloud)
ENV RESULTS_BUCKET=yellowsense-technologies-cleanroom
ENV GCLOUD_PROJECT=yellowsense-technologies

# Run uvicorn
CMD ["uvicorn", "executor:app", "--host", "0.0.0.0", "--port", "8443", "--workers", "1", "--loop", "asyncio"]
