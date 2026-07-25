FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps for psycopg2 build are avoided by using psycopg2-binary.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Wait for Postgres, then launch. Compose also gates on a healthcheck.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
