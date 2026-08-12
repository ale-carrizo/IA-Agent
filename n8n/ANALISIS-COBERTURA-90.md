# Análisis de cobertura — 90 preguntas del canal (Guadalupe / Anáhuac)

Fuente de verdad evaluada: reglas de las 9 etapas + 100 chunks de KB embebida + tabla cursos. Modelo actual: **gpt-4o-mini** (agente y router) + text-embedding-3-small.

Leyenda: ✅ cubierta (respuesta correcta hoy) · ⚠️ parcial (falta precisión/dato concreto) · ❌ falta (no hay info → el bot deflecta o alucina)

| # | Categoría | Pregunta | Cobertura | Dónde está / Qué falta |
|---|---|---|---|---|
| 1-9 | Modalidad | en línea/presencial/híbrido, en vivo vs grabadas | ✅ | FAQ: "100% en línea, 80% asincrónico (grabadas) + 20% sincrónico (en vivo)". Completo. |
| 10 | Semana ejecutiva | ¿Qué es? | ✅ | KB: "16h presenciales para aplicar lo aprendido y networking, en el último módulo". |
| 11 | Semana ejecutiva | ¿Es obligatoria? | ✅ | KB: "si no puede asistir presencial, la hace 100% virtual sin perder contenido". |
| 12 | Semana ejecutiva | ¿Cuándo y cuántas? | ⚠️ | "en el último módulo, 16h por diplomado". Falta FECHA concreta por generación. |
| 13-15 | Semana ejecutiva | ¿Dónde? ¿viajar? | ✅ | KB: "Campus Norte Anáhuac CDMX o virtual". |
| 16 | Horarios | ¿Qué días? | ❌ | **NO hay días concretos de clases en vivo.** |
| 17 | Horarios | ¿En qué horario? | ❌ | **NO hay horario concreto.** |
| 18 | Horarios | ¿noche/fin de semana? | ❌ | **NO especificado.** |
| 19 | Horarios | ¿horarios de esta generación? | ❌ | **Falta el calendario de la generación vigente.** |
| 20 | Horarios | ¿horas por semana? | ⚠️ | Se puede inferir de 240h/12m pero no hay dedicación semanal explícita. |
| 21-26 | Plan de estudios | temario, módulos, temas | ⚠️ | KB tiene módulos/240h por programa + PDF folleto. Falta temario detallado consultable por texto (está en el PDF). |
| 27-29 | Otra ciudad/país | ¿puedo 100% en línea? | ✅ | "100% en línea" cubre; la semana ejecutiva es virtual opcional. |
| 30 | Otra ciudad/país | ¿el título sirve fuera de México? | ⚠️ | Solo "internacionalización/colaboraciones". Falta respuesta clara de validez internacional. |
| 31-36 | Requisitos/perfil | requisitos, sin licenciatura, experiencia, perfil | ✅ | FAQ: "no obligatorio título, se recomienda; documento de identidad; perfil: experiencia + interés". |
| 37-40 | Ubicación/campus | campus norte, ciudad | ✅ | KB: "Campus Norte Anáhuac, CDMX". |
| 41-44 | Fecha inicio | inicio, próxima generación, fecha máxima | ⚠️ | KB tiene "Inicio próximo: Julio 2026" en ALGUNOS programas. Falta: fecha máxima de inscripción y calendario completo/actualizado. |
| 45-48 | Inscripción | cómo, paso a paso, hasta cuándo | ✅ (⚠️ deadline) | FAQ: "1) registro 2) forma de pago 3) pago 4) documento identidad". Falta fecha límite concreta. |
| 49-51 | Duración | cuánto dura, meses/horas, distribución | ✅ | "Máster 12 meses / 240h; Diplomados 4 meses / 80h". |
| 52-53 | Certificado | ¿me dan certificado? | ✅ | FAQ: "certificado digital de la Universidad Anáhuac". |
| 54 | Certificado | ¿avaladas por la SEP? | ❌ | **CRÍTICO: no hay respuesta explícita SEP/RVOE.** Ver gaps. |
| 55 | Certificado | ¿qué documento recibo? | ✅ | "Certificado de Máster o Diplomado por Anáhuac". |
| 56 | Documentación | ¿Qué es el IDMEX? ¿INE o CURP? | ❌ | **"IDMEX" NO aparece en ningún lado.** |
| 57 | Documentación | "documento de identidad" ¿qué pongo? | ⚠️ | Se menciona el requisito pero NO se explica qué subir (INE/pasaporte). |
| 58 | Documentación | ¿qué documentos necesito? | ✅ | "solo documento de identidad". |
| 59 | Documentación | error en el formulario | ❌ | **No hay guía de resolución de error del form.** |
| 60-63 | Validez/RVOE/SEP | RVOE, validez oficial, avalado, posgrado oficial | ❌/⚠️ | **CRÍTICO:** solo implícito ("NO otorga grado de maestría con validez SEP"). Falta script explícito y honesto de RVOE/validez. |
| 64-68 | Máster vs maestría/diplomado | diferencias, cuál conviene | ✅ | FAQ: sección "Diferenciales Máster/Diplomados vs Maestría" + "Rebatir: ¿son maestrías?". Bien cubierto. |
| 69 | Título | ¿con qué título salgo? | ✅ | "Certificado de Máster/Diplomado Anáhuac". |
| 70 | Título | ¿cédula profesional SEP? | ❌ | **CRÍTICO: no hay respuesta explícita a cédula.** (implícito: no). |
| 71 | Título | ¿grado de maestría? | ✅ | "No otorga grado de maestría". |
| 72 | Título | sin cédula de licenciatura, ¿puedo? | ✅ | "no obligatorio título/cédula, solo documento". |
| 73-75 | Contacto humano | agendar llamada, asesor | ✅ | Handoff a asesor + agendar (según horario). |
| 76-79 | Profesores | quién imparte, formación, internacionales, listado | ⚠️ | KB: "docentes internacionales, Global/Regional/Local Minds", algunos nombres (Harari, Herculano-Houzel, Rashid). Falta listado completo por programa. |
| 80 | Envío material | folleto/temario por aquí | ✅ | Envía PDF (adjunto). |
| 81-82 | Idioma | ¿español o inglés? | ❌ | **"idioma/inglés/español" NO aparece.** |
| 83 | Plataforma | ¿Zoom/campus virtual? | ⚠️ | "plataforma LXP" mencionada. Falta si las clases en vivo son Zoom/Meet. |
| 84 | Carga trabajo | tareas/exámenes | ✅ | FAQ: "60% mínimo por módulo + portafolio + proyecto final". |
| 85 | Networking | comunidad | ⚠️ | Mencionado ("networking") pero sin detalle. |
| 86 | Diplomado suelto | ¿uno o los tres? | ✅ | "Máster = 3 diplomados; también hay diplomados individuales". |
| 87 | Doble titulación | internacional | ❌ | **NO aparece.** |
| 88 | Titulación/tesis | ¿lleva tesis? | ⚠️ | Implícito: "proyecto final" (no tesis). Falta respuesta explícita. |
| 89 | Docencia/área | ¿me sirve para X? | ⚠️ | Consultivo; el bot puede responder pero sin dato duro por profesión. |
| 90 | Empresa | proponerlo como desarrollo profesional | ⚠️ | "desarrollo profesional" mencionado; sin programa B2B concreto. |

## Resumen de precisión
- **Cubierto bien (✅): ~55% de las preguntas** → hoy se responden con precisión alta.
- **Parcial (⚠️): ~28%** → responde pero le falta un dato concreto (fechas, horarios, listado docentes).
- **Falta (❌): ~17%** → hoy el bot deflecta o corre riesgo de alucinar.

## GAPS a cargar (prioridad por volumen × riesgo)
1. **RVOE / SEP / cédula / validez oficial** (~60 menciones, ALTO RIESGO legal). Necesito el texto oficial: ¿tiene RVOE? ¿otorga cédula? Respuesta honesta y clara ("programa de formación continua, certificado Anáhuac, NO es posgrado con RVOE/cédula" — confirmar).
2. **Horarios concretos** (días/horario de clases en vivo) — el tema #3 en volumen (~123). Aunque 80% es a tu ritmo, falta el patrón de las clases en vivo (día/hora) o un script claro.
3. **IDMEX / documento de identidad** (~40) — qué es, qué subir (INE/pasaporte), qué hacer si el form da error. Destraba inscripciones.
4. **Fechas de inicio actuales + fecha máxima de inscripción** (~125 combinando inicio+inscripción) — dato que cambia por generación; idealmente data-driven.
5. **Idioma** (~13) — ¿español? ¿ponentes traducidos?
6. **Título: validez internacional** (~30) — ¿sirve fuera de México?
7. **Doble titulación / titulación internacional** — sí/no explícito.
8. **Listado de docentes por programa** — para "¿quién imparte?".
9. (menor) Networking/comunidad detalle; plataforma de clases en vivo (Zoom/Meet); B2B empresas.

## Modelo
- Actual **gpt-4o-mini**: OK para lo cubierto, pero flojea en desambiguación fina (máster/maestría/RVOE/cédula) y puede alucinar donde falta info.
- **Recomendado: subir el nodo del AGENTE a gpt-4o (o gpt-4.1)** para respuestas más contundentes, mejor adherencia a scripts delicados y menos alucinación. Router puede quedar en gpt-4o-mini (clasificar es simple y barato).
- OJO: el modelo NO compensa info faltante. Para 95-99% real hay que **cargar los gaps de arriba Y** subir el modelo.
