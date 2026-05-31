import { pool } from '../config/database';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const USERS = [
  { email: 'admin@bluetab.net',          name: 'Roberto Sánchez', role: 'admin',     pass: 'admin123',     initials: 'RS', color: '#26215C', bg: '#EEEDFE' },
  { email: 'ana.martinez@bluetab.net',    name: 'Ana Martínez',   role: 'preventa',  pass: 'preventa123',  initials: 'AM', color: '#0C447C', bg: '#E6F1FB' },
  { email: 'laura.vega@bluetab.net',      name: 'Laura Vega',     role: 'preventa',  pass: 'preventa123',  initials: 'LV', color: '#712B13', bg: '#FAECE7' },
  { email: 'miguel.torres@bluetab.net',   name: 'Miguel Torres',  role: 'preventa',  pass: 'preventa123',  initials: 'MT', color: '#085041', bg: '#E1F5EE' },
  { email: 'carlos.rueda@bluetab.net',    name: 'Carlos Rueda',   role: 'comercial', pass: 'comercial123', initials: 'CR', color: '#27500A', bg: '#EAF3DE' },
  { email: 'juliana.ramos@bluetab.net',   name: 'Juliana Ramos',  role: 'comercial', pass: 'comercial123', initials: 'JR', color: '#633806', bg: '#FAEEDA' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Iniciando seed...');

    // Usuarios
    const userIds: Record<string, string> = {};
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.pass, 12);
      const res = await client.query(
        `INSERT INTO users (email, name, password_hash, role, avatar_initials, avatar_color, avatar_bg)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [u.email, u.name, hash, u.role, u.initials, u.color, u.bg]
      );
      userIds[u.email] = res.rows[0].id;
      console.log(`  ✓ ${u.role}: ${u.email}`);
    }

    // Propuestas demo
    const PROPOSALS = [
      { name: 'Migración plataforma datos', client: 'Bancolombia', commercial: 'carlos.rueda@bluetab.net', assigned: 'ana.martinez@bluetab.net', status: 'en-progreso', pct: 68, priority: 'critica', bant: 82, start: '2025-05-01', end: '2025-07-15', value: 'USD 450,000', type: 'Arquitectura de datos' },
      { name: 'Arquitectura microservicios', client: 'EPM', commercial: 'carlos.rueda@bluetab.net', assigned: 'laura.vega@bluetab.net', status: 'entregada-revision', pct: 100, priority: 'alta', bant: 74, start: '2025-04-28', end: '2025-06-30', value: 'USD 280,000', type: 'Cloud migration' },
      { name: 'Data Governance & calidad', client: 'Avianca', commercial: 'juliana.ramos@bluetab.net', assigned: 'ana.martinez@bluetab.net', status: 'revision-1', pct: 100, priority: 'critica', bant: 68, start: '2025-05-18', end: '2025-07-01', value: 'USD 190,000', type: 'Data governance', iter: 1 },
      { name: 'Cloud modernization roadmap', client: 'Grupo Éxito', commercial: 'juliana.ramos@bluetab.net', assigned: 'miguel.torres@bluetab.net', status: 'concluida', pct: 100, priority: 'media', bant: 55, start: '2025-04-01', end: '2025-05-30', value: 'USD 320,000', type: 'Cloud migration', iter: 2 },
      { name: 'Plataforma analítica tiempo real', client: 'Davivienda', commercial: 'carlos.rueda@bluetab.net', assigned: 'ana.martinez@bluetab.net', status: 'pendiente', pct: 15, priority: 'alta', bant: 79, start: '2025-06-01', end: '2025-07-22', value: 'USD 520,000', type: 'Analytics & BI' },
    ];

    for (const p of PROPOSALS) {
      const seq = await client.query("SELECT nextval('proposal_code_seq') AS n");
      const code = `P${String(seq.rows[0].n).padStart(3, '0')}`;
      const res = await client.query(
        `INSERT INTO proposals
           (code, name, client, commercial_id, assigned_to, status, progress_pct, priority,
            start_date, end_date, bant_score, composite_score, iterations_count, estimated_value, proposal_type)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING id`,
        [
          code, p.name, p.client,
          userIds[p.commercial], userIds[p.assigned],
          p.status, p.pct, p.priority,
          p.start, p.end, p.bant, p.bant,
          p.iter || 0, p.value, p.type,
        ]
      );
      const propId = res.rows[0].id;

      // Agregar revisión para P003
      if (p.iter === 1) {
        await client.query(
          `INSERT INTO revisions (proposal_id, iteration_number, requested_by, notes, status)
           VALUES ($1, 1, $2, 'Falta sección de costos detallada y cronograma de implementación.', 'abierta')`,
          [propId, userIds[p.commercial]]
        );
      }
      if (p.iter === 2) {
        await client.query(
          `INSERT INTO revisions (proposal_id, iteration_number, requested_by, notes, status, adjust_deadline, closed_at, closed_by)
           VALUES ($1, 1, $2, 'Ajustar arquitectura cloud a multi-región.', 'cerrada', '2025-05-27', NOW(), $3)`,
          [propId, userIds[p.commercial], userIds[p.assigned]]
        );
        await client.query(
          `INSERT INTO revisions (proposal_id, iteration_number, requested_by, notes, status, adjust_deadline, closed_at, closed_by)
           VALUES ($1, 2, $2, 'Corrección menor en precios USD.', 'cerrada', '2025-05-30', NOW(), $3)`,
          [propId, userIds[p.commercial], userIds[p.assigned]]
        );
      }
      console.log(`  ✓ Propuesta: ${code} — ${p.name} (${p.client})`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Seed completado exitosamente');
    console.log('\nCredenciales de acceso:');
    USERS.forEach(u => console.log(`  ${u.role.padEnd(10)} ${u.email}  /  ${u.pass}`));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en seed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(() => process.exit(1));
