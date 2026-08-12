# Integración Kapso (proveedor de transporte alternativo a Botmaker)

El motor es multi-proveedor: `canales.plataforma` decide el transporte (`botmaker` | `kapso`).
El **cerebro** (router, RAG, guardrails, estado) es el MISMO para ambos — no se duplica.
Kapso solo cambia la capa de transporte, que vive en el workflow **Kapso Adapter**.

## Arquitectura

```
WhatsApp ──▶ Kapso ──▶ webhook /kapso-entrada (Kapso Adapter, n8n)
                          │  normaliza, lookup canal por phone_number_id, gate de pausa
                          ▼
                       Motor "Agente - Etapas" (mismo cerebro que Botmaker)
                          │  devuelve { mensajes[], pdf_a_enviar, just_handed, razon }
                          ├──▶ enviar por Kapso API (formato Meta Cloud API)
                          └──▶ si just_handed: round-robin asesor + assignment API + pausar
```

- **Kapso Adapter**: workflow n8n `uGuwJwv4LOlmIAXj` (webhook `POST /webhook/kapso-entrada`).
- **Cerebro**: motor `x2HCf0kkjuZ8e6b8` (`/webhook/agente-entrada`), reutilizado tal cual.
- El mutex "¿quién habla?" vive en `conversaciones.pausado` (Postgres), NO en Kapso.

## APIs de Kapso usadas (base `api.kapso.ai`, header `X-API-Key`)

| Acción | Endpoint |
|---|---|
| Recibir | webhook `whatsapp.message.received` → `message.text.body`, `message.from`, `conversation.id`, `phone_number_id` |
| Enviar texto/PDF | `POST /meta/whatsapp/v24.0/{phone_number_id}/messages` (Meta Cloud API) |
| Handoff | `POST /platform/v1/whatsapp/conversations/{id}/assignments` `{assignment:{user_id,notes}}` |
| Devolver al bot | `PATCH /platform/v1/whatsapp/conversations/{id}/assignments/{aid}` `{active:false}` |
| Listar asesores | `GET /platform/v1/users` (para conocer los user_id) |

## Estado: construido y probado con mocks ✅

- Entrada + normalización del schema Kapso ✅
- Lookup de canal por `phone_number_id` (multi-tenant) ✅
- Gate de pausa (bot calla si hay humano) ✅
- Cerebro reutilizado (respondió y logueó) ✅
- Envío en formato Meta (request se arma correcto) ✅
- Handoff: round-robin de asesores + asignación + pausa + guardado de conversation_id ✅

Lo único NO probado sin cuenta real: que la API de Kapso **acepte** los requests (se arman
perfecto, pero el host rechaza una api_key mock). Se valida al cablear credenciales reales.

## Checklist para poner en producción (cuando haya cuenta Kapso)

1. **Crear cuenta Kapso** (plan Free alcanza para el POC: 2.000 msgs/mes, número US pre-verificado).
2. **Conectar un número** de WhatsApp → anotar su `phone_number_id`.
3. **Sacar la API Key** del proyecto (X-API-Key).
4. **Configurar el webhook** en Kapso apuntando a
   `https://n8n-ac1b.srv1490495.hstgr.cloud/webhook/kapso-entrada`, evento
   `whatsapp.message.received`. (Recomendado: activar HMAC y validar la firma — ver docs/security.)
5. **Cargar los asesores**: en Kapso, cada asesor es un usuario del proyecto con rol `human_agent`
   → obtener su `user_id` (`GET /platform/v1/users`).
6. **En el panel** → agente → Canal de Conexión → Nuevo canal → proveedor **Kapso**:
   - Etiqueta, API Key, Phone Number ID, cola.
   - Desplegar "Asesores del round-robin" y cargar el `user_id` + nombre de cada asesor.
7. **Probar**: mandar un WhatsApp real al número; verificar respuesta y, forzando un handoff,
   que la conversación aparezca asignada en `inbox.kapso.ai` al asesor de turno.

## Pendiente (fase 2, requiere cuenta para configurar)

- **Devolver el control al bot**: hoy el handoff pausa la conversación. Falta un webhook que
  escuche `whatsapp.conversation.ended` / `whatsapp.conversation.inactive` de Kapso y ponga
  `pausado=false` + `PATCH assignment active:false`. (Mientras tanto se despausa desde el panel.)
- **Presencia de asesores** (online/offline, horario): el round-robin actual reparte entre todos
  los asesores activos sin saber si están conectados. Agregar tabla de presencia si hace falta.
- **Buffering**: Kapso junta mensajes cortos nativamente (debounce 1-60s). Conviene activarlo en
  Kapso en vez de duplicar la lógica de Redis del motor.
