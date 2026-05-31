require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function migrate() {
  const schemaPath = path.join(__dirname, '../../../infra/schema.sql');
  
  if (!fs.existsSync(schemaPath)) {
    console.error('No se encontró infra/schema.sql en:', schemaPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');
  const client = await pool.connect();

  try {
    console.log('Aplicando schema...');
    await client.query(sql);
    console.log('✅ Schema aplicado exitosamente');
  } catch (err) {
    // Si ya existe (re-ejecutar), mostrar qué falló exactamente
    if (err.code === '42P07' || err.code === '42710') {
      console.log('⚠️  Algunas tablas/tipos ya existen. Si quieres recrear desde cero ejecuta:');
      console.log('   docker-compose down -v && docker-compose up -d postgres');
      console.log('   Y luego vuelve a correr npm run db:migrate');
    } else {
      console.error('❌ Error SQL:', err.message);
      console.error('   Código:', err.code);
      console.error('   Posición en el archivo:', err.position);
      if (err.position) {
        const pos = parseInt(err.position);
        const sqlText = fs.readFileSync(schemaPath, 'utf8');
        const lines = sqlText.substring(0, pos).split('\n');
        console.error('   Línea aproximada:', lines.length);
        console.error('   Contexto:', lines.slice(-3).join('\n'));
      }
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
