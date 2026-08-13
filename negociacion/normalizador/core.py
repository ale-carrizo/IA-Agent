"""`normalizar()` — el paso que convierte lenguaje suelto en un precio auditable.

Contrato (§3 del brief):

    LLM interpretar → NORMALIZAR (función pura) → POLÍTICA decidir (código puro)

Este módulo es la parte del medio. Es una **función pura**: mismos argumentos,
mismo resultado, sin I/O, sin reloj, sin red. Se testea contra el golden dataset.

Regla que gobierna todo el archivo:

    la validación determinística SIEMPRE puede BAJAR la confianza,
    nunca subirla.

La confianza arranca en la similitud del match (embedding o léxico) y de ahí
sólo puede caer. Cada caída deja un motivo legible, que es lo que el operador
ve en el panel cuando la celda sale en ámbar.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Sequence

from .lexico import extraer_concentraciones
from .numeros import parsear_precio
from .tipos import Candidato, ItemCrudo, Normalizado, Requerido
from .unidades import (
    Presentacion,
    misma_forma,
    normalizar_texto,
    parsear_presentacion,
    presentacion_de_catalogo,
    quitar_palabras_de_envase,
)

__all__ = ["normalizar", "UMBRAL_CONFIANZA"]

# Piso para que una cotización pueda entrar al presupuesto (§10 del brief).
# La política lo usa para decidir CLARIFICAR, y la auditoría lo vuelve a
# chequear antes de aprobar. Está acá para que haya UN solo número.
UMBRAL_CONFIANZA = 0.85

# Techo cuando el proveedor cotiza una presentación distinta a la del pliego,
# aunque el unitario sea convertible exacto. Deliberadamente por debajo del
# umbral: en este dominio ofrecer otro formato es una diferencia REAL para el
# hospital (no compra unidades sueltas), y re-preguntar cuesta un mensaje.
# Si el cliente confirma que le sirve cualquier formato mientras el unitario
# cierre, este es el único número que hay que mover.
CAP_PRESENTACION_DISTINTA = 0.80

# Techo cuando el mensaje no alcanza para saber en qué unidad está el precio.
CAP_UNIDAD_DESCONOCIDA = 0.60

# Piso de IDENTIFICACIÓN: por debajo de esto el texto no nombra a ningún
# producto del catálogo y el resultado es "no matcheó", no "matcheó flojito".
# Sin este piso, el ancla del pliego convertiría cualquier ruido en el producto
# que estábamos esperando — que es justo el error que no podemos cometer.
SIMILITUD_MINIMA = 0.55

_DOS = Decimal("0.01")


class _Confianza:
    """Acumulador de penalizaciones. No expone forma de subir el valor."""

    def __init__(self, base: float) -> None:
        self.valor = max(0.0, min(1.0, base))
        self.motivos: list[str] = []

    def penalizar(self, factor: float, motivo: str) -> None:
        if factor >= 1.0:
            return
        self.valor *= factor
        self.motivos.append(motivo)

    def techo(self, tope: float, motivo: str) -> None:
        if tope >= self.valor:
            return
        self.valor = tope
        self.motivos.append(motivo)

    def anular(self, motivo: str) -> None:
        self.valor = 0.0
        self.motivos.append(motivo)


def _redondear(v: Decimal) -> Decimal:
    return v.quantize(_DOS, rounding=ROUND_HALF_UP)


def _unidades_requeridas(req: Requerido | None) -> int | None:
    """Unidades por presentación que pide el pliego."""
    if req is None:
        return None
    if req.unidades_requeridas:
        return req.unidades_requeridas
    p = parsear_presentacion(req.presentacion_requerida)
    return p.unidades if p.unidades_conocidas else None


def _inferir_unidades_del_catalogo(
    pres: Presentacion, elegido: Candidato, candidatos: Sequence[Candidato]
) -> tuple[int | None, str | None]:
    """El proveedor dijo "la caja" sin decir de cuántas. ¿Se puede saber?

    Sólo si el catálogo deja UNA sola lectura: entre los productos con la misma
    droga + concentración + forma, un único tamaño de ese envase. Si hay dos
    (caja x50 y caja x100), la respuesta correcta es "no sé" → re-preguntar.
    """
    p = elegido.producto
    hermanos = [
        c.producto
        for c in candidatos
        if normalizar_texto(c.producto.droga) == normalizar_texto(p.droga)
        and normalizar_texto(c.producto.concentracion) == normalizar_texto(p.concentracion)
        and normalizar_texto(c.producto.forma) == normalizar_texto(p.forma)
    ]
    if pres.envase:
        hermanos = [
            h for h in hermanos
            if presentacion_de_catalogo(h.presentacion, h.unidades_por_presentacion, h.forma).envase == pres.envase
        ]
    tamanos = {h.unidades_por_presentacion for h in hermanos}
    if len(tamanos) == 1:
        return tamanos.pop(), None
    if len(tamanos) > 1:
        return None, f"el catálogo tiene {len(tamanos)} tamaños de {pres.envase or 'presentación'} para ese producto"
    return None, "no hay presentación de catálogo para inferir el tamaño"


def normalizar(
    item: ItemCrudo,
    candidatos: Sequence[Candidato],
    requerido: Requerido | None = None,
) -> Normalizado:
    """Texto del proveedor → producto + precio unitario + confianza.

    `candidatos` viene ordenado por similitud descendente (lo arma el caller:
    búsqueda vectorial en producción, `lexico.buscar_candidatos` en tests).
    `requerido` es el ítem del pliego; si se pasa, se validan contra él la
    presentación y el producto.
    """
    motivos_previos: list[str] = []

    # ── 1. Producto ────────────────────────────────────────────────────────
    if candidatos and max(c.similitud for c in candidatos) < SIMILITUD_MINIMA:
        candidatos = []          # parecidos de casualidad no son candidatos

    if not candidatos:
        return Normalizado(
            producto_id=None,
            precio_unitario=None,
            precio_por_presentacion=None,
            presentacion="sin especificar",
            unidades_por_presentacion=None,
            confianza=0.0,
            conversion_exacta=False,
            presentacion_igual_a_requerida=False,
            motivos=("no matcheó ningún producto del catálogo",),
        )

    mejor = max(candidatos, key=lambda c: c.similitud)

    # El pliego ancla la lectura. Si a este proveedor le preguntamos por un
    # producto concreto y su respuesta no contradice a ninguno mejor, se lee
    # como respuesta a ESA pregunta. No es asumir: es el contexto que existe.
    elegido = mejor
    del_pliego = next(
        (c for c in candidatos if requerido is not None and c.producto.id == requerido.producto_id),
        None,
    )
    if del_pliego is not None and mejor.similitud - del_pliego.similitud <= 0.05:
        elegido = del_pliego

    producto = elegido.producto
    anclado = requerido is not None and requerido.producto_id == producto.id
    conf = _Confianza(elegido.similitud)

    # Sin ancla del pliego, dos candidatos igual de parecidos = el match no
    # distingue, y eso es exactamente lo que hay que preguntar.
    if not anclado:
        otros = [c for c in candidatos if c.producto.id != producto.id]
        if otros:
            segundo = max(otros, key=lambda c: c.similitud)
            if elegido.similitud - segundo.similitud < 0.03:
                conf.techo(0.70, "hay otro producto del catálogo igual de parecido")

    # ── 2. Validación determinística: concentración ────────────────────────
    # Que el proveedor no repita la concentración es normal (está contestando
    # una pregunta que ya la traía). Sólo penaliza fuerte cuando esa omisión
    # deja DOS lecturas posibles y nada la desempata.
    concs_texto = extraer_concentraciones(item.texto_producto)
    concs_prod = extraer_concentraciones(producto.concentracion)
    if concs_texto and concs_prod:
        if not (concs_texto & concs_prod):
            conf.techo(0.25, f"la concentración mencionada no es la del producto ({producto.concentracion})")
    elif concs_prod:
        otras_concentraciones = {
            normalizar_texto(c.producto.concentracion)
            for c in candidatos
            if normalizar_texto(c.producto.droga) == normalizar_texto(producto.droga)
        } - {normalizar_texto(producto.concentracion)}
        if otras_concentraciones and not anclado:
            conf.techo(0.60, "no dijo la concentración y hay más de una en juego para esa droga")
        else:
            conf.penalizar(0.98, "no se pudo confirmar la concentración (no la mencionó)")

    # ── 3. Validación determinística: forma farmacéutica ───────────────────
    texto_forma = quitar_palabras_de_envase(
        f"{item.texto_producto} {item.unidad_texto or ''}", producto.presentacion
    )
    coincide_forma = misma_forma(texto_forma, producto.forma)
    if coincide_forma is False:
        conf.techo(0.25, f"la forma mencionada no coincide con la del producto ({producto.forma})")
    elif coincide_forma is None:
        otras_formas = {
            normalizar_texto(c.producto.forma)
            for c in candidatos
            if normalizar_texto(c.producto.droga) == normalizar_texto(producto.droga)
        } - {normalizar_texto(producto.forma)}
        if otras_formas and not anclado:
            conf.techo(0.60, "no dijo la forma farmacéutica y hay más de una para esa droga")
        else:
            conf.penalizar(0.98, "no se pudo confirmar la forma farmacéutica (no la mencionó)")

    # ── 4. ¿Es el producto que pide el pliego? ─────────────────────────────
    if requerido is not None and requerido.producto_id is not None and not anclado:
        conf.techo(0.50, "el proveedor cotizó un producto distinto al del pliego")

    # ── 5. Precio ──────────────────────────────────────────────────────────
    precio = parsear_precio(item.precio_texto)
    if not precio:
        conf.anular(f"no se pudo leer el precio: {precio.ambiguo}")
        return Normalizado(
            producto_id=producto.id,
            precio_unitario=None,
            precio_por_presentacion=None,
            presentacion="sin especificar",
            unidades_por_presentacion=None,
            confianza=0.0,
            conversion_exacta=False,
            presentacion_igual_a_requerida=False,
            motivos=tuple(motivos_previos + conf.motivos),
        )

    # ── 6. ¿Por unidad o por presentación? ¿De cuántas? ────────────────────
    pres = parsear_presentacion(item.unidad_texto)
    unidades: int | None = None

    if pres.tipo == "unidad":
        unidades = 1
    elif pres.unidades_conocidas:
        unidades = pres.unidades
    elif pres.tipo == "presentacion":
        # Dijo "la caja" sin la cantidad: sólo se completa si el catálogo no
        # deja lugar a dudas. Si no, es la pregunta que hay que hacer.
        unidades, problema = _inferir_unidades_del_catalogo(pres, elegido, candidatos)
        if unidades is None:
            conf.techo(
                CAP_UNIDAD_DESCONOCIDA,
                f"dijo '{pres.envase or 'presentación'}' sin decir de cuántas unidades; {problema}",
            )
        else:
            conf.penalizar(0.98, f"unidades por {pres.envase or 'presentación'} inferidas del catálogo ({unidades})")
    else:
        conf.techo(CAP_UNIDAD_DESCONOCIDA, "no aclaró si el precio es por unidad o por presentación")

    # ── 7. Aritmética (acá y en ningún otro lado) ──────────────────────────
    precio_por_presentacion: Decimal | None = None
    precio_unitario: Decimal | None = None
    conversion_exacta = False

    if unidades and unidades > 0:
        if unidades == 1:
            precio_unitario = _redondear(precio.valor)
            precio_por_presentacion = precio_unitario
        else:
            precio_por_presentacion = _redondear(precio.valor)
            precio_unitario = _redondear(precio.valor / Decimal(unidades))
            # Si la división no cierra en dos decimales, el unitario es
            # aproximado: se avisa, no se oculta.
            if precio_unitario * Decimal(unidades) != precio_por_presentacion:
                conf.penalizar(0.97, "el precio unitario no divide exacto (se redondeó a 2 decimales)")
        conversion_exacta = coincide_forma is not False

    etiqueta = pres.etiqueta
    if unidades and not pres.unidades_conocidas and pres.envase:
        etiqueta = f"{pres.envase} x{unidades}"
    elif unidades and pres.tipo == "unidad":
        etiqueta = f"{pres.forma or producto.forma} x1"

    # ── 8. ¿Coincide con la presentación pedida? ───────────────────────────
    req_unidades = _unidades_requeridas(requerido)
    presentacion_igual = True
    if req_unidades and unidades:
        presentacion_igual = req_unidades == unidades
        if not presentacion_igual:
            # Aunque el unitario sea comparable, ofrecer otro formato es una
            # diferencia real para el hospital → se re-pregunta, no se asume.
            conf.techo(
                CAP_PRESENTACION_DISTINTA,
                f"ofrece {etiqueta} y el pliego pide {requerido.presentacion_requerida}",
            )
    elif req_unidades and not unidades:
        presentacion_igual = False

    return Normalizado(
        producto_id=producto.id,
        precio_unitario=precio_unitario,
        precio_por_presentacion=precio_por_presentacion,
        presentacion=etiqueta,
        unidades_por_presentacion=unidades,
        confianza=round(conf.valor, 4),
        conversion_exacta=conversion_exacta,
        presentacion_igual_a_requerida=presentacion_igual,
        motivos=tuple(motivos_previos + conf.motivos),
    )
