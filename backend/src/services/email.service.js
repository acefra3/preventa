const { EmailClient } = require('@azure/communication-email');

let _client = null;

function getClient() {
  if (_client) return _client;
  const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING || '';
  if (conn && !conn.startsWith('endpoint=https://...')) {
    _client = new EmailClient(conn);
  }
  return _client;
}

const SENDER = () => process.env.AZURE_COMMUNICATION_SENDER || 'noreply@bluetab.net';
const APP_URL = () => process.env.CORS_ORIGIN || 'http://localhost:5173';

// ── Base HTML wrapper ────────────────────────────────────────
function html(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 0">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0"
      style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08)">
      <!-- Header -->
      <tr>
        <td style="background:#185FA5;padding:20px 32px;text-align:left">
          <span style="color:#fff;font-size:16px;font-weight:600">● Bluetab Preventa</span>
        </td>
      </tr>
      <!-- Body -->
      <tr><td style="padding:28px 32px 24px">${bodyHtml}</td></tr>
      <!-- Footer -->
      <tr>
        <td style="background:#F9FAFB;padding:14px 32px;border-top:1px solid #E5E7EB">
          <p style="margin:0;font-size:11px;color:#9CA3AF">
            Este correo fue generado automáticamente por la plataforma Bluetab Preventa.
            Por favor no respondas directamente a este mensaje.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function h1(text)       { return `<h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#111827">${text}</h1>`; }
function p(text)         { return `<p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.6">${text}</p>`; }
function small(text)     { return `<p style="margin:0 0 14px;font-size:12px;color:#6B7280">${text}</p>`; }
function btn(url, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:20px 0">
    <tr><td style="background:#185FA5;border-radius:8px">
      <a href="${url}" style="display:inline-block;padding:10px 22px;color:#fff;font-size:14px;font-weight:600;text-decoration:none">${label}</a>
    </td></tr>
  </table>`;
}
function infoBox(rows) {
  const cells = rows.map(([k,v]) =>
    `<tr>
      <td style="padding:8px 12px;font-size:12px;color:#6B7280;width:40%;border-bottom:1px solid #F3F4F6">${k}</td>
      <td style="padding:8px 12px;font-size:12px;color:#111827;font-weight:600;border-bottom:1px solid #F3F4F6">${v}</td>
    </tr>`
  ).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:#F9FAFB;border-radius:8px;margin:16px 0;overflow:hidden">${cells}</table>`;
}

// ── Send helper ──────────────────────────────────────────────
async function send(to, toName, subject, bodyHtml) {
  const client = getClient();
  const fullHtml = html(subject, bodyHtml);

  if (!client) {
    // En desarrollo: imprime en consola
    console.log('\n📧 [EMAIL - DEV MODE]');
    console.log(`   To:      ${toName} <${to}>`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:    (HTML omitted — configure AZURE_COMMUNICATION_CONNECTION_STRING)`);
    console.log('');
    return;
  }

  const message = {
    senderAddress: SENDER(),
    recipients: { to: [{ address: to, displayName: toName }] },
    content: { subject, html: fullHtml },
  };
  const poller = await client.beginSend(message);
  await poller.pollUntilDone();
}

// ══════════════════════════════════════════════════════════════
// TEMPLATES
// ══════════════════════════════════════════════════════════════

// 1. Contraseña olvidada
async function sendPasswordReset(to, name, resetUrl) {
  await send(to, name, 'Recupera tu contraseña — Bluetab Preventa',
    h1('Recupera tu contraseña') +
    p(`Hola <strong>${name}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta en la plataforma Bluetab Preventa.`) +
    btn(resetUrl, 'Restablecer contraseña') +
    small('Este enlace expira en <strong>1 hora</strong>. Si no solicitaste esto, ignora este correo — tu contraseña no cambiará.')
  );
}

// 2. Bienvenida / primer acceso (admin crea usuario)
async function sendWelcome(to, name, role, tempPassword) {
  const roleLabels = { admin:'Administrador', preventa:'Preventa', comercial:'Comercial' };
  await send(to, name, 'Bienvenido a Bluetab Preventa — tus credenciales',
    h1(`¡Bienvenido, ${name}!`) +
    p('El equipo de Bluetab ha creado tu cuenta en la plataforma de gestión de propuestas técnicas. Aquí están tus credenciales de acceso:') +
    infoBox([
      ['Correo',      to],
      ['Contraseña temporal', tempPassword],
      ['Rol asignado', roleLabels[role] || role],
    ]) +
    btn(`${APP_URL()}/login`, 'Acceder a la plataforma') +
    small('Por seguridad, te recomendamos cambiar tu contraseña al iniciar sesión por primera vez.')
  );
}

// 3. Nueva propuesta registrada → notifica al admin
async function sendNewProposalToAdmin(adminEmail, adminName, proposal, commercial) {
  await send(adminEmail, adminName, `Nueva propuesta registrada: ${proposal.name}`,
    h1('Nueva propuesta ingresada') +
    p(`El comercial <strong>${commercial}</strong> ha registrado una nueva propuesta que requiere asignación a un miembro del equipo preventa.`) +
    infoBox([
      ['Propuesta',   proposal.name],
      ['Cliente',     proposal.client_name],
      ['Prioridad',   proposal.priority?.toUpperCase()],
      ['Score BANT',  `${proposal.composite_score || 0}/100`],
      ['Fecha límite', proposal.end_date],
    ]) +
    btn(`${APP_URL()}/proposals/${proposal.id}`, 'Ver propuesta y asignar') +
    p('Por favor accede a la plataforma para asignarla al preventa disponible.')
  );
}

// 4. Propuesta asignada → notifica al preventa
async function sendAssignedToPreventa(to, name, proposal, assignedBy) {
  await send(to, name, `Propuesta asignada: ${proposal.name} — ${proposal.client_name}`,
    h1('Se te asignó una propuesta') +
    p(`<strong>${assignedBy}</strong> te ha asignado la siguiente propuesta técnica. Por favor revisa los detalles y comienza el trabajo.`) +
    infoBox([
      ['Propuesta',    proposal.name],
      ['Cliente',      proposal.client_name],
      ['Prioridad',    proposal.priority?.toUpperCase()],
      ['Fecha inicio', proposal.start_date],
      ['Fecha límite', proposal.end_date],
      ['Score BANT',   `${proposal.composite_score || 0}/100`],
    ]) +
    btn(`${APP_URL()}/proposals/${proposal.id}`, 'Ver propuesta') +
    small('Puedes actualizar el porcentaje de avance y marcarla como entregada desde la plataforma.')
  );
}

// 5. Propuesta entregada → notifica al comercial
async function sendDeliveredToComercial(to, name, proposal, preventaName) {
  await send(to, name, `Propuesta lista para revisión: ${proposal.name}`,
    h1('Tu propuesta está lista') +
    p(`<strong>${preventaName}</strong> ha finalizado y entregado la propuesta técnica. Por favor revísala y apruébala o solicita ajustes.`) +
    infoBox([
      ['Propuesta',   proposal.name],
      ['Cliente',     proposal.client_name],
      ['Elaborada por', preventaName],
      ['Entregada',   new Date().toLocaleDateString('es-CO')],
    ]) +
    btn(`${APP_URL()}/proposals/${proposal.id}`, 'Revisar propuesta') +
    p('Tienes hasta <strong>2 rondas de revisión</strong> disponibles antes de que la propuesta deba concluirse.')
  );
}

// 6. Revisión solicitada → notifica al preventa
async function sendRevisionRequested(to, name, proposal, comercialName, iteration, note) {
  await send(to, name, `Revisión #${iteration} solicitada — ${proposal.name}`,
    h1(`Revisión #${iteration} solicitada`) +
    p(`<strong>${comercialName}</strong> ha solicitado ajustes sobre la propuesta <strong>${proposal.name}</strong>.`) +
    infoBox([
      ['Propuesta',   proposal.name],
      ['Cliente',     proposal.client_name],
      ['Revisión',    `#${iteration} de 2`],
      ['Solicitado por', comercialName],
    ]) +
    `<div style="background:#FFFBEB;border-left:3px solid #F59E0B;padding:12px 16px;margin:16px 0;border-radius:0 8px 8px 0">
      <p style="margin:0;font-size:13px;color:#92400E"><strong>Motivo:</strong> ${note}</p>
    </div>` +
    btn(`${APP_URL()}/proposals/${proposal.id}`, 'Ver propuesta y responder') +
    small('Debes indicar la fecha comprometida para el ajuste desde la plataforma.')
  );
}

// 7. Propuesta concluida → notifica a ambos (preventa y comercial)
async function sendConcluded(to, name, proposal) {
  await send(to, name, `Propuesta concluida: ${proposal.name}`,
    h1('Propuesta concluida ✓') +
    p(`La propuesta técnica <strong>${proposal.name}</strong> para <strong>${proposal.client_name}</strong> ha sido concluida exitosamente.`) +
    infoBox([
      ['Propuesta',   proposal.name],
      ['Cliente',     proposal.client_name],
      ['Concluida',   new Date().toLocaleDateString('es-CO')],
    ]) +
    btn(`${APP_URL()}/proposals/${proposal.id}`, 'Ver propuesta') +
    small('Puedes consultar el historial completo de la propuesta en la plataforma.')
  );
}

module.exports = {
  sendPasswordReset,
  sendWelcome,
  sendNewProposalToAdmin,
  sendAssignedToPreventa,
  sendDeliveredToComercial,
  sendRevisionRequested,
  sendConcluded,
};
