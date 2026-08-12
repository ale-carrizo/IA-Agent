-- ============================================================
--  Follow-ups por plantilla HSM (WhatsApp) para disparar FUERA de la
--  ventana de 24h, donde el texto libre lo rechaza WhatsApp.
--  El envío usa la API trigger-intent de Botmaker (intentIdOrName + variables),
--  igual que el workflow "Envio Plantilla botmaker".
-- ============================================================

-- follow_ups: tipo + datos de la plantilla
alter table follow_ups add column if not exists tipo text not null default 'texto';   -- 'texto' | 'hsm'
alter table follow_ups add column if not exists intent_hsm text;                        -- intentIdOrName de Botmaker (ej. anahuac_reapertura)
alter table follow_ups add column if not exists variables_hsm jsonb not null default '{}'::jsonb; -- { "contactFirstName": "{{nombre}}", ... }

-- canales: el channelId de Botmaker (ej. anahuacgmp-whatsapp-5215597219794),
-- necesario para trigger-intent (distinto del número pelado).
alter table canales add column if not exists channel_id_botmaker text;
