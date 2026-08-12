// QA end-to-end de TODAS las acciones del panel contra localhost:3000.
const B = "http://localhost:3000";
const GUADALUPE = "00000000-0000-0000-0000-0000000000a6";
let pass = 0, fail = 0;
const fails = [];

async function call(method, path, body) {
  const r = await fetch(B + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = r.status === 204 ? null : await r.json(); } catch {}
  return { status: r.status, data };
}
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; fails.push(label + (extra ? " :: " + extra : "")); console.log("  ✗ " + label + (extra ? " :: " + extra : "")); }
}

(async () => {
  console.log("=== QA panel ===");

  // 0) crear agente QA
  let r = await call("POST", "/api/agentes", { nombre: "QA Bot", tenant: "QA", ambiente: "QA", idioma: "es" });
  ok(r.status === 201 && r.data?.id, "crear agente");
  const A = r.data?.id;
  if (!A) { console.log("sin agente QA, aborto"); return; }

  // 1) Identidad PATCH
  r = await call("PATCH", `/api/agentes/${A}`, { persona: "agresivo", tono: "formal", long_max_mensaje: 150, usar_emojis: false });
  ok(r.status === 200 && r.data?.persona === "agresivo" && r.data?.long_max_mensaje === 150, "identidad PATCH");

  // 2) Variables
  r = await call("POST", `/api/agentes/${A}/variables`, { nombre: "empresa", tipo: "texto" });
  ok(r.status === 201, "variable POST"); const varId = r.data?.id;
  r = await call("GET", `/api/agentes/${A}/variables`);
  ok(r.status === 200 && r.data?.length === 1, "variable GET");
  r = await call("DELETE", `/api/variables/${varId}`);
  ok(r.status === 204, "variable DELETE");

  // 3) Guardrails
  r = await call("POST", `/api/agentes/${A}/guardrails`, { nombre: "g1", regla: "no precios", patron_bloqueo: "precio" });
  ok(r.status === 201, "guardrail POST"); const gId = r.data?.id;
  r = await call("PATCH", `/api/guardrails/${gId}`, { activo: false });
  ok(r.status === 200 && r.data?.activo === false, "guardrail PATCH");
  r = await call("DELETE", `/api/guardrails/${gId}`);
  ok(r.status === 204, "guardrail DELETE");

  // 4) Canales
  r = await call("POST", `/api/agentes/${A}/canales`, { canal_numero: "999" + Date.now(), nombre: "QA chan", botmaker_token: "tok", handoff_intent_id: "Derivar", cola: "asesores" });
  ok(r.status === 201, "canal POST"); const canId = r.data?.id;
  r = await call("GET", `/api/agentes/${A}/canales`);
  ok(r.status === 200 && r.data?.[0]?.tiene_token === true, "canal GET (token oculto)");
  r = await call("PATCH", `/api/canales/${canId}`, { cola: "ventas" });
  ok(r.status === 200, "canal PATCH");
  r = await call("DELETE", `/api/canales/${canId}`);
  ok(r.status === 204, "canal DELETE");

  // 5) Horarios + feriados
  const horarios = Array.from({ length: 7 }, (_, d) => ({ dia: d, hora_inicio: d >= 1 && d <= 5 ? "09:00" : null, hora_fin: d >= 1 && d <= 5 ? "18:00" : null, cerrado: !(d >= 1 && d <= 5) }));
  r = await call("PUT", `/api/agentes/${A}/horarios`, { horarios });
  ok(r.status === 200, "horarios PUT");
  r = await call("GET", `/api/agentes/${A}/horarios`);
  ok(r.status === 200 && r.data?.length === 7, "horarios GET");
  r = await call("POST", `/api/agentes/${A}/feriados`, { fecha: "2026-12-25", descripcion: "Navidad" });
  ok(r.status === 201, "feriado POST"); const ferId = r.data?.id;
  r = await call("DELETE", `/api/feriados/${ferId}`);
  ok(r.status === 204, "feriado DELETE");

  // 6) Cursos + turmas
  r = await call("POST", `/api/agentes/${A}/cursos`, { nombre: "Curso QA", tipo: "master", area: "IA", modalidad: "online", precio: "x" });
  ok(r.status === 201, "curso POST"); const curId = r.data?.id;
  r = await call("PATCH", `/api/cursos/${curId}`, { descripcion: "desc qa" });
  ok(r.status === 200, "curso PATCH");
  r = await call("POST", `/api/cursos/${curId}/turmas`, { fecha_inicio: "2026-07-01", cupos: 20 });
  ok(r.status === 201, "turma POST"); const turId = r.data?.id;
  r = await call("GET", `/api/agentes/${A}/cursos`);
  ok(r.status === 200 && r.data?.[0]?.turmas?.length === 1, "curso GET con turmas");
  r = await call("DELETE", `/api/turmas/${turId}`);
  ok(r.status === 204, "turma DELETE");
  r = await call("DELETE", `/api/cursos/${curId}`);
  ok(r.status === 204, "curso DELETE");

  // 7) Follow-ups
  r = await call("POST", `/api/agentes/${A}/follow-ups`, { delay_minutos: 120, mensaje: "hola?" });
  ok(r.status === 201, "follow-up POST"); const fuId = r.data?.id;
  r = await call("POST", `/api/agentes/${A}/follow-ups`, { delay_minutos: 2000, mensaje: "x" });
  ok(r.status === 400, "follow-up valida 24h (>1439 rechaza)");
  r = await call("PATCH", `/api/follow-ups/${fuId}`, { activo: false });
  ok(r.status === 200, "follow-up PATCH");
  r = await call("DELETE", `/api/follow-ups/${fuId}`);
  ok(r.status === 204, "follow-up DELETE");

  // 8) KB base + doc
  r = await call("POST", `/api/agentes/${A}/kb`, { nombre: "Base QA" });
  ok(r.status === 201, "kb base POST"); const baseId = r.data?.id;
  r = await call("POST", `/api/kb/${baseId}/documentos`, { nombre: "Doc QA", pdf_url: "https://x/y.pdf", programa: "P" });
  ok(r.status === 201, "kb doc POST"); const docId = r.data?.id;
  r = await call("GET", `/api/agentes/${A}/kb`);
  ok(r.status === 200 && r.data?.[0]?.documentos?.length === 1, "kb GET con docs");
  r = await call("DELETE", `/api/kb/documentos/${docId}`);
  ok(r.status === 204, "kb doc DELETE");

  // 9) Etapas + 5 pestañas
  r = await call("POST", "/api/etapas", { agente_id: A, nombre: "Etapa QA", objetivo: "obj", reglas: "reglas qa" });
  ok(r.status === 201, "etapa POST"); const eId = r.data?.id;
  r = await call("PATCH", `/api/etapas/${eId}`, { calificacion: "sal", reglas: "reglas v2" });
  ok(r.status === 200 && r.data?.calificacion === "sal", "etapa PATCH (Identidad tab)");
  // herramientas tab
  const herr = await call("GET", "/api/herramientas");
  ok(herr.status === 200 && herr.data?.length >= 8, "herramientas catálogo");
  const faqId = herr.data?.find((h) => h.clave === "faq_kb")?.id;
  r = await call("PUT", `/api/etapas/${eId}/herramientas`, { ids: [faqId] });
  ok(r.status === 200, "etapa herramientas PUT");
  r = await call("GET", `/api/etapas/${eId}/herramientas`);
  ok(r.status === 200 && r.data?.includes(faqId), "etapa herramientas GET");
  // variables tab
  r = await call("PUT", `/api/etapas/${eId}/variables`, { ids: [] });
  ok(r.status === 200, "etapa variables PUT (vacío no rompe)");
  // horarios tab
  r = await call("PUT", `/api/etapas/${eId}/horarios`, { horarios: [{ dia: 1, hora_inicio: "10:00", hora_fin: "12:00", cerrado: false }] });
  ok(r.status === 200, "etapa horarios PUT");
  // prompt tab (compilación)
  r = await call("GET", `/api/etapas/${eId}/prompt`);
  const prompt = r.data?.prompt || "";
  ok(r.status === 200 && prompt.includes("Etapa QA") && prompt.includes("reglas v2") && prompt.includes("faq_kb"), "etapa PROMPT compila (etapa+reglas+tool)", "len=" + prompt.length);
  r = await call("DELETE", `/api/etapas/${eId}`);
  ok(r.status === 204, "etapa DELETE");

  // 10) Lecturas de Guadalupe (real): conversaciones, detalle, agenda, observabilidad, prompt de etapa real
  r = await call("GET", `/api/agentes/${GUADALUPE}/conversaciones`);
  ok(r.status === 200 && Array.isArray(r.data?.sesiones), "conversaciones GET", "total=" + r.data?.total);
  const tel = r.data?.sesiones?.[0]?.telefono;
  if (tel) {
    r = await call("GET", `/api/conversaciones/${encodeURIComponent(tel)}?agente_id=${GUADALUPE}`);
    ok(r.status === 200 && r.data?.contacto && Array.isArray(r.data?.mensajes), "conversación detalle (render)", "msgs=" + r.data?.mensajes?.length);
  }
  r = await call("GET", `/api/agentes/${GUADALUPE}/agenda`);
  ok(r.status === 200 && r.data?.agendamientos !== undefined, "agenda GET");
  r = await call("GET", `/api/agentes/${GUADALUPE}/observabilidad`);
  ok(r.status === 200 && r.data?.tokens && Array.isArray(r.data?.eventos), "observabilidad GET");
  // prompt de una etapa REAL de Guadalupe (debe traer las reglas reales)
  const et = await call("GET", `/api/etapas?agente_id=${GUADALUPE}`);
  const faqEtapa = et.data?.find((e) => e.orden === 1);
  if (faqEtapa) {
    r = await call("GET", `/api/etapas/${faqEtapa.id}/prompt`);
    ok(r.status === 200 && (r.data?.prompt || "").length > 1000, "prompt etapa real Guadalupe", "len=" + (r.data?.prompt || "").length);
  }

  console.log(`\n=== RESULTADO: ${pass} OK, ${fail} FAIL ===`);
  if (fails.length) console.log("FALLOS:\n - " + fails.join("\n - "));
  console.log("(agente QA queda en la DB, inofensivo)");
})();
