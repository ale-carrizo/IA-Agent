import { db } from "@/lib/db";
import { enviarCrm, type CrmConfig } from "@/lib/crm";

// POST /api/crm/:crmId/test -> envío de PRUEBA al CRM con una ficha ficticia.
// OJO: pega contra el endpoint real; el registro queda marcado es_test=true.
export async function POST(_req: Request, { params }: { params: Promise<{ crmId: string }> }) {
  const { crmId } = await params;
  const { rows } = await db.query(
    "select i.*, a.nombre as agente_nombre from crm_integraciones i join agentes a on a.id=i.agente_id where i.id=$1",
    [crmId]
  );
  const integ = rows[0];
  if (!integ) return Response.json({ error: "integración no encontrada" }, { status: 404 });

  const config = integ.config as CrmConfig;
  const ctx = {
    telefono: "0000000000",
    conversacion_id: undefined,
    etapa: "TEST",
    agente: integ.agente_nombre as string,
    ficha: {
      nombre: "Prueba",
      apellido: "Panel",
      email: "test@gruponods.com",
      carrera_interes: "TEST",
      referral_source_type: "test",
      referral_source_id: "test",
      referral_ctwa_clid: "test",
    },
  };

  const r = await enviarCrm(config, ctx);
  await db.query(
    `insert into crm_envios (integracion_id, agente_id, conversacion_id, telefono, etapa, payload, status_http, respuesta, exito, es_test)
     values ($1,$2,null,$3,'TEST',$4,$5,$6,$7,true)`,
    [crmId, integ.agente_id, ctx.telefono, r.payload, r.status, r.respuesta, r.exito]
  );
  return Response.json({ status: r.status, exito: r.exito, respuesta: r.respuesta, payload: r.payload });
}
