// email.ts
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false },
});

export const sendPasswordResetEmail = async (
  to: string,
  name: string,
  resetUrl: string
): Promise<void> => {
  if (!process.env.SMTP_USER) {
    console.log(`[Email] Simulado — Reset URL para ${to}: ${resetUrl}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Bluetab Preventa" <noreply@bluetab.net>',
    to,
    subject: 'Recuperación de contraseña — Bluetab Preventa',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#185FA5">Bluetab Preventa</h2>
        <p>Hola <strong>${name}</strong>,</p>
        <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar:</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:10px 20px;background:#185FA5;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0">
          Restablecer contraseña
        </a>
        <p style="color:#666;font-size:12px">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este mensaje.</p>
      </div>
    `,
  });
};

export const sendProposalNotificationEmail = async (
  to: string,
  name: string,
  subject: string,
  body: string
): Promise<void> => {
  if (!process.env.SMTP_USER) {
    console.log(`[Email] Simulado — Para ${to}: ${subject}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"Bluetab Preventa" <noreply@bluetab.net>',
    to, subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#185FA5">Bluetab Preventa</h2>
        <p>Hola <strong>${name}</strong>,</p>
        ${body}
        <p style="color:#666;font-size:12px">Ingresa a la plataforma para más detalles: <a href="${process.env.FRONTEND_URL}">${process.env.FRONTEND_URL}</a></p>
      </div>
    `,
  });
};
