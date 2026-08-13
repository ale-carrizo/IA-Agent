"""Configuración por entorno. Sin defaults mágicos para lo que es peligroso."""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache


def _int(nombre: str, default: int) -> int:
    try:
        return int(os.environ.get(nombre, default))
    except ValueError:
        return default


def _dec(nombre: str, default: str) -> Decimal:
    try:
        return Decimal(os.environ.get(nombre, default))
    except Exception:
        return Decimal(default)


@dataclass(frozen=True)
class Config:
    # ── Base: la MISMA que usa el motor de agentes y el panel ──
    database_url: str

    # ── Transporte: el servicio NUNCA habla con un canal directo. ──
    # Postea acá y n8n resuelve Botmaker / Kapso / WhatsApp Cloud.
    n8n_salida_url: str
    n8n_token: str

    # ── LLM ──
    # 'openai'      → interpretar/expresar con modelos reales
    # 'determinista'→ sin red: heurísticas + plantillas (tests, CI, fallback)
    llm_modo: str
    openai_api_key: str
    modelo_interpretar: str      # barato: sólo traduce texto → estructura
    modelo_expresar: str         # el principal: redacta con el tono del agente
    modelo_embeddings: str

    # ── Supervisor ──
    minutos_sin_respuesta: int   # cuándo mandar recordatorio
    max_recordatorios: int
    horas_escalacion_voz: int    # cuánto antes del cierre se escala

    # ── Sobre por defecto al crear una licitación ──
    # precio_max = último precio histórico × factor. El humano lo pisa desde el panel.
    factor_precio_max: Decimal
    factor_precio_objetivo: Decimal

    # ── Auditoría ──
    desvio_outlier: Decimal      # ±30% contra el histórico

    # Agente del motor existente del que se toman tono y guardrails.
    # "la conducta del agente es data, no código": el tono de los mensajes a
    # proveedores se edita en el panel, no acá. Vacío = defaults del código.
    agente_id: str

    @property
    def usa_openai(self) -> bool:
        return self.llm_modo == "openai" and bool(self.openai_api_key)


@lru_cache(maxsize=1)
def cfg() -> Config:
    return Config(
        database_url=os.environ.get("DATABASE_URL", ""),
        n8n_salida_url=os.environ.get("N8N_SALIDA_URL", ""),
        n8n_token=os.environ.get("N8N_TOKEN", ""),
        llm_modo=os.environ.get("LLM_MODO", "openai" if os.environ.get("OPENAI_API_KEY") else "determinista"),
        openai_api_key=os.environ.get("OPENAI_API_KEY", ""),
        modelo_interpretar=os.environ.get("MODELO_INTERPRETAR", "gpt-4o-mini"),
        modelo_expresar=os.environ.get("MODELO_EXPRESAR", "gpt-4o"),
        modelo_embeddings=os.environ.get("MODELO_EMBEDDINGS", "text-embedding-3-small"),
        minutos_sin_respuesta=_int("MINUTOS_SIN_RESPUESTA", 45),
        max_recordatorios=_int("MAX_RECORDATORIOS", 2),
        horas_escalacion_voz=_int("HORAS_ESCALACION_VOZ", 3),
        factor_precio_max=_dec("FACTOR_PRECIO_MAX", "1.15"),
        factor_precio_objetivo=_dec("FACTOR_PRECIO_OBJETIVO", "0.98"),
        desvio_outlier=_dec("DESVIO_OUTLIER", "0.30"),
        agente_id=os.environ.get("AGENTE_LICITACIONES_ID", ""),
    )
