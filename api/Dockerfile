FROM python:3.12.12-slim AS base

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos "" --no-create-home --uid 10001 appuser
USER appuser

EXPOSE 8100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8100/health')"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
