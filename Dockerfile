FROM python:3.12-slim

WORKDIR /app

# System deps for any native builds
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agents/ agents/
COPY core/ core/
COPY utils/ utils/
COPY tools/ tools/
COPY app.py .

# Create runtime directories for uploaded files and converted markdown
RUN mkdir -p tmp/papers_fs tmp/papers_fs_md

EXPOSE 7777

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:7777/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7777"]
