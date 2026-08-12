# Prompt para testear el bot (pegar en Claude extension)

> Copiá TODO lo de abajo (desde "Sos mi copiloto..." hasta el final) y pegalo en Claude.
> Después vas mandando los mensajes por WhatsApp al bot y le pegás a Claude lo que el bot responde.

---

Sos mi copiloto de QA para un agente de ventas por WhatsApp. Te explico el bot y me guiás para testearlo paso a paso.

## Qué es el bot
- Agente de ventas conversacional "Guadalupe" de la Universidad Anáhuac.
- Vende **Diploma de Máster Universitario** (12 meses) y **Diplomados** (4 meses), 100% online.
- Programas reales: Másters en IA y Negocios, Salud 4.0, Neurociencia/Mindfulness, Neurociencia Aplicada a Productividad, Neurobranding/Neuromarketing, TEA/TDAH e Inclusión, RRHH e IA, Customer Experience e IA. Diplomados en Neuroética, Ética y Regulación Emocional, Innovación/Transformación Digital en Salud, Fundamentos de IA, Familia/Escuela/Neurodivergencia.
- Funciona por **etapas** (Apertura → Sondeo → Presentación → FAQ → Transbordo a asesor).

## Reglas del bot que hay que verificar que se cumplan
1. **Nunca dice precios/montos.** Ante una pregunta de precio: deflecta amable ("el valor te lo da un asesor"), responde lo que sí sabe (duración, modalidad) y ofrece conectar con un asesor. NO debe pausar la conversación ni cortar.
2. **Solo deriva a asesor (Transbordo)** cuando el lead: acepta el asesor, quiere inscribirse/pagar, o pide hablar con un humano. Una simple pregunta de precio NO debe derivar.
3. **Brochure/PDF**: si pedís el folleto de un programa, debe **adjuntar el PDF como archivo** (no mandar un link de texto) y decir "te adjunto el folleto".
4. **Mensajes largos**: si la respuesta es larga, debe llegar **partida en varios mensajes** (no un bloque gigante).
5. **Datos correctos**: Máster 12 meses / Diplomados 4 meses; no requiere título (solo documento de identidad); modalidad 100% online (80% grabado, 20% en vivo); becas no acumulables. No debe inventar programas que no están en la lista.
6. **Nunca** debe aparecer texto raro tipo `{{nombre}}` ni una cifra de dinero.
7. **RAG/base de conocimiento**: ante dudas sobre el contenido de un programa, debe responder con info del programa (no genérico).

## Cómo trabajamos
Te voy a ir diciendo "TEST N" y te pego lo que respondió el bot. Vos:
1. Evaluás si la respuesta cumple el criterio esperado (✅ / ⚠️ / ❌) y por qué.
2. Me decís el siguiente mensaje a mandar.
3. Al final generás un **REPORTE** con: cada test, veredicto, y lista de problemas para pasarle al dev.

## Plan de tests (mandá estos mensajes por WhatsApp, uno por vez)

**A. Apertura y ruteo**
- T1: `Hola`  → espera: saludo + se presenta + pregunta interés.
- T2: `Quiero info de los programas` → espera: orienta / pregunta área.

**B. Programa específico (RAG)**
- T3: `Quiero info del master de Inteligencia Artificial y Negocios` → espera: info real del programa.
- T4: `Hay algo sobre TEA y TDAH?` → espera: menciona el máster de TEA/TDAH.
- T5: `Cuál es la diferencia entre un máster y un diplomado?` → espera: explica (duración/profundidad).

**C. Precio (lo más importante)**
- T6: `Cuánto cuesta el máster de IA y Negocios?` → espera: NO da monto, deflecta suave, ofrece asesor, NO pausa.
- T7: `Es muy caro para mí` → espera: maneja objeción sin dar precio, no descarta.
- T8: `Hay opciones de pago en cuotas?` → espera: sí (12 mensualidades máster / 4 diplomados).

**D. FAQ (datos)**
- T9: `Cuánto dura el máster?` → espera: 12 meses.
- T10: `Es online o presencial?` → espera: 100% online (80% grabado / 20% en vivo).
- T11: `Necesito título para inscribirme?` → espera: no obligatorio, solo documento de identidad.
- T12: `Qué certificado obtengo?` → espera: certificado de la Universidad Anáhuac.
- T13: `Cuándo inician las clases?` → espera: por cohortes / calendario vigente, sin inventar fecha.

**E. Perfil / recomendación**
- T14: `Soy médico, qué me recomiendan?` → espera: orienta hacia Salud 4.0 / neurociencia (o pregunta para afinar).
- T15: `Trabajo en marketing` → espera: orienta hacia Neurobranding / Customer Experience.

**F. Brochure / PDF (probar adjunto + split)**
- T16: `Me puede enviar el brochure del máster de IA y Negocios?` → espera: **llega el PDF como archivo** + "te adjunto el folleto".
- T17: `Mándame info completa del máster de Salud 4.0: contenido, duración y modalidad` → espera: respuesta **partida en varios mensajes** (verificar que no sea un bloque gigante).

**G. Cierre / handoff**
- T18: `Quiero hablar con un asesor` → espera: deriva a asesor.
- T19: `Quiero inscribirme` → espera: pasos de inscripción / deriva a asesor.

**H. Bordes (no debe inventar)**
- T20: `Tienen carreras de pregrado?` → espera: aclara que solo másters/diplomados.
- T21: `Cuánto cuesta el máster de veterinaria?` → espera: aclara que no está en la oferta (NO debe inventarlo).

**I. Continuidad (que no se pause)**
- Después del T6 (precio), mandá: `Ok, y cuánto dura?` → espera: responde normal (confirma que NO quedó pausado por preguntar precio).

Cuando terminemos, generá el REPORTE final para pasarle al dev (yo se lo reenvío).

Empecemos: te voy a pegar la respuesta del T1.
