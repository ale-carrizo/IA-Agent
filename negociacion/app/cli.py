"""Utilidades de línea de comandos.

    python -m app.cli embeddings         # rellena catalogo_maestro.embedding
    python -m app.cli exportar-golden    # arma un jsonl con los casos reales
    python -m app.cli auditar <id>
    python -m app.cli tick
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .db import conexion, consultar, ejecutar


def embeddings() -> None:
    """Calcula el embedding de cada producto sin embedding.

    El texto que se embebe es el mismo que después busca el normalizador:
    droga + concentración + forma + presentación. Si cambia esta plantilla,
    hay que recalcular TODO el catálogo, no sólo lo nuevo.
    """
    from .llm import embedding

    with conexion() as conn:
        filas = consultar(
            conn,
            """select id, droga, concentracion, forma, presentacion
                 from catalogo_maestro where activo and embedding is null""",
        )
        print(f"{len(filas)} productos sin embedding")
        for i, f in enumerate(filas, start=1):
            texto = f"{f['droga']} {f['concentracion']} {f['forma']} {f['presentacion']}"
            vector = embedding(texto)
            if vector is None:
                print("sin API key o falló el embedding; nada que hacer")
                return
            ejecutar(conn, "update catalogo_maestro set embedding = %s::vector where id = %s", (str(vector), f["id"]))
            if i % 50 == 0:
                print(f"  {i}/{len(filas)}")
    print("listo")


def exportar_golden(salida: str = "tests/golden/reales.jsonl") -> None:
    """Exporta a golden dataset los casos que un humano tuvo que corregir.

    Son, por definición, los casos en los que el sistema se equivocó — el
    material más valioso que existe para el dataset (§9).
    """
    with conexion() as conn:
        filas = consultar(
            conn,
            """
            select c.raw_respuesta, c.precio_unitario, c.presentacion_ofrecida,
                   c.confianza, cm.codigo_externo, i.presentacion_requerida,
                   e.decision, e.motivo
              from cotizaciones c
              join items_licitacion i on i.id = c.item_id
              left join catalogo_maestro cm on cm.id = i.producto_id
              left join excepciones e on e.cotizacion_id = c.id and e.estado = 'resuelta'
             where c.raw_respuesta is not null
             order by c.actualizado desc
             limit 500
            """,
        )
    destino = Path(salida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", encoding="utf-8") as fh:
        for f in filas:
            fh.write(
                json.dumps(
                    {
                        "raw": f["raw_respuesta"],
                        "pedido": [{"producto": f["codigo_externo"], "presentacion_requerida": f["presentacion_requerida"]}],
                        "interpretado": {"intencion": "precio", "items": []},   # a completar a mano
                        "esperado": [
                            {
                                "requerido": f["codigo_externo"],
                                "producto": f["codigo_externo"],
                                "precio_unitario": str(f["precio_unitario"]) if f["precio_unitario"] else None,
                                "confianza_min": 0.85,
                            }
                        ],
                        "revisado_por_humano": bool(f.get("decision")),
                        "motivo_excepcion": f.get("motivo"),
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )
    print(f"{len(filas)} casos → {destino}")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        return
    comando = sys.argv[1]
    if comando == "embeddings":
        embeddings()
    elif comando == "exportar-golden":
        exportar_golden(*sys.argv[2:3])
    elif comando == "auditar":
        from .auditoria import auditar

        print(json.dumps(auditar(int(sys.argv[2]), registrar_evento=False), indent=2, ensure_ascii=False, default=str))
    elif comando == "tick":
        from .supervisor import tick

        print(json.dumps(tick(), indent=2, ensure_ascii=False, default=str))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
