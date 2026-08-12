# n8n en modo cola (queue mode) — escala horizontal

Esto se aplica en el **deployment de n8n de tu VPS (Hostinger)**, no en el workflow.
Hace que n8n distribuya las ejecuciones a *workers* separados vía Redis (BullMQ por debajo).
Necesario cuando un solo proceso n8n no da abasto (muchos webhooks concurrentes).

## Qué necesita
- **Redis** alcanzable por n8n. Tenés dos opciones:
  - Usar el **Redis de Railway** ya creado (proxy `reseau.proxy.rlwy.net:10415`). Funciona, pero suma latencia (sale a internet).
  - **Recomendado para queue mode:** un **Redis local en la VPS** (mismo docker-compose), por baja latencia. El Redis de Railway lo seguís usando para dedupe/locks del motor; el de queue mode puede ser otro.
- El **mismo Postgres** que ya usa n8n (Railway) — no cambia.

## docker-compose (VPS) — main + worker + redis local

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: always
    volumes: ["redisdata:/data"]

  n8n:                      # proceso PRINCIPAL (UI + webhooks)
    image: docker.n8n.io/n8nio/n8n
    restart: always
    ports: ["5678:5678"]
    environment:
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - N8N_RUNNERS_ENABLED=true
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=<tu host Postgres Railway / proxy>
      - DB_POSTGRESDB_PORT=<puerto>
      - DB_POSTGRESDB_DATABASE=railway
      - DB_POSTGRESDB_USER=postgres
      - DB_POSTGRESDB_PASSWORD=<password>
      - N8N_ENCRYPTION_KEY=<la MISMA en main y workers>
      - WEBHOOK_URL=https://n8n-ac1b.srv1490495.hstgr.cloud/
    depends_on: [redis]

  n8n-worker:               # WORKER (procesa ejecuciones). Escalá replicas a gusto.
    image: docker.n8n.io/n8nio/n8n
    restart: always
    command: worker
    environment:
      - EXECUTIONS_MODE=queue
      - QUEUE_BULL_REDIS_HOST=redis
      - QUEUE_BULL_REDIS_PORT=6379
      - N8N_RUNNERS_ENABLED=true
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=<igual que arriba>
      - DB_POSTGRESDB_PORT=<igual>
      - DB_POSTGRESDB_DATABASE=railway
      - DB_POSTGRESDB_USER=postgres
      - DB_POSTGRESDB_PASSWORD=<password>
      - N8N_ENCRYPTION_KEY=<la MISMA que el main>
    depends_on: [redis, n8n]
    deploy:
      replicas: 2           # cantidad de workers (escala horizontal)

volumes:
  redisdata: {}
```

## Puntos clave / gotchas
1. **`N8N_ENCRYPTION_KEY` debe ser IDÉNTICA** en main y workers (si no, los workers no pueden desencriptar las credenciales). Si tu n8n ya tiene una, copiala (está en `~/.n8n/config` del contenedor actual). NO la cambies o perdés las credenciales guardadas.
2. El **main** sigue recibiendo los webhooks; los **workers** ejecutan. Tu webhook (`/webhook/agente-entrada`) no cambia.
3. Escalás agregando réplicas de `n8n-worker` (o instancias en más VPS apuntando al mismo Redis + Postgres).
4. El **Wait** del debounce funciona igual en queue mode (n8n persiste y reanuda la ejecución).
5. Migración: hacé backup de la base de n8n antes. Levantás con `docker compose up -d`. Verificás en Settings → que diga modo "queue".

## ¿Lo necesitás YA?
No. Con un solo proceso n8n aguantás bastante volumen. Queue mode es para cuando veas la cola de ejecuciones acumularse o picos de muchos leads simultáneos. La infra (Redis) ya está lista; es solo cambiar el compose y sumar el worker.
