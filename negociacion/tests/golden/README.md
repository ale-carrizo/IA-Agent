# Golden dataset — respuestas reales de laboratorios

**Prioridad #1 del proyecto.** El riesgo no está en la orquestación: está en
`interpretar` + `normalizar`. Este dataset es el que impide que una regresión
silenciosa meta un precio mal leído en un presupuesto.

## Formato (`*.jsonl`, una línea por mensaje)

```json
{
  "id": "amoxi-caja-sin-cantidad",
  "raw": "la amoxi te la dejo 38.900 la caja, tengo stock",
  "pedido": [
    { "producto": "AR-AMX-500-100", "presentacion_requerida": "caja x100" }
  ],
  "interpretado": {
    "intencion": "precio",
    "items": [
      { "texto_producto": "la amoxi", "precio_texto": "38.900",
        "unidad_texto": "la caja", "condiciones": {} }
    ]
  },
  "esperado": [
    { "producto": "AR-AMX-500-100", "precio_unitario": "389.00",
      "presentacion": "caja x100", "confianza_min": 0.85 }
  ]
}
```

| campo | qué es |
|---|---|
| `raw` | el mensaje tal cual llegó por WhatsApp (o la transcripción del audio) |
| `pedido` | qué ítems del pliego se le habían pedido a ese proveedor — es el contexto que ancla la lectura |
| `interpretado` | la salida ESPERADA del nodo `interpretar` (el LLM). Permite testear `normalizar` sin llamar a ninguna API |
| `esperado` | la salida esperada de `normalizar`, ítem por ítem |
| `esperado[].confianza_min` | piso de confianza. `0` significa "tiene que quedar abajo del umbral y re-preguntar" |
| `confianza_max` | opcional: techo. Se usa para los casos que DEBEN caer en CLARIFICAR |

`producto` es el `codigo_externo` del catálogo, no el `id` serial: sobrevive a
un `drop database` y hace el dataset legible.

## Los dos modos de test

1. **`test_golden.py` (siempre, en CI)** — corre `normalizar(interpretado)` y
   verifica producto, precio unitario y banda de confianza. No usa red ni base.
2. **`test_interpretar_golden.py` (opcional)** — sólo si hay `OPENAI_API_KEY`:
   corre el LLM sobre `raw` y compara contra `interpretado`. Es el que detecta
   que un cambio de modelo o de prompt rompió la extracción.

## Cómo crecerlo (lo que hay que pedirle al cliente)

Los casos de acá son **sintéticos**: sirven para fijar el comportamiento, no
para medir precisión real. Hay que reemplazarlos por 100–200 respuestas reales,
que ya existen en los WhatsApp de las 15 personas que hoy piden precios.

Para exportarlas: la tabla `cotizaciones` guarda `raw_respuesta` de cada
mensaje que entra al sistema, así que a partir del primer día de uso el dataset
se alimenta solo. `python -m app.cli exportar-golden` arma el jsonl con los
casos que un humano corrigió en la cola de excepciones — que son, por
definición, los casos en los que el sistema se equivocó.

Casos que TIENEN que estar cubiertos (§9 del brief):
precio por unidad vs por caja · "lucas"/"palos" y formatos de número argentinos ·
varios ítems en un mensaje · sin stock · "te confirmo más tarde" · condiciones
de pago · presentación distinta a la pedida · audio transcripto con ruido.
