# Servicio de negociación (Railway: mismo proyecto que la DB).
FROM python:3.12-slim

WORKDIR /app

# Dependencias primero: cachean bien y cambian poco.
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
      "fastapi>=0.115" "uvicorn[standard]>=0.32" "pydantic>=2.9" \
      "psycopg[binary,pool]>=3.2" "httpx>=0.27" \
      "langgraph>=0.2.60" "langgraph-checkpoint-postgres>=2.0.7" \
      "openai>=1.55" "python-dotenv>=1.0"

COPY normalizador/ ./normalizador/
COPY app/ ./app/

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

# Un solo worker a propósito: el grafo usa un checkpointer con conexión propia
# y el volumen (decenas de mensajes por minuto) no justifica más. Si hiciera
# falta escalar, se suben réplicas — el servicio es stateless.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
