"""Librería pura de normalización de respuestas de proveedores.

Sin dependencias fuera de la stdlib y sin I/O: es la pieza que se testea contra
el golden dataset y la que decide si un precio entra o no al presupuesto.
No importar nada de `app` desde acá.
"""

from .core import UMBRAL_CONFIANZA, normalizar
from .lexico import buscar_candidatos, similitud_lexica
from .numeros import parsear_precio
from .tipos import Candidato, ItemCrudo, Normalizado, ProductoCatalogo, Requerido
from .unidades import Presentacion, parsear_presentacion

__all__ = [
    "UMBRAL_CONFIANZA",
    "normalizar",
    "buscar_candidatos",
    "similitud_lexica",
    "parsear_precio",
    "parsear_presentacion",
    "Candidato",
    "ItemCrudo",
    "Normalizado",
    "Presentacion",
    "ProductoCatalogo",
    "Requerido",
]
