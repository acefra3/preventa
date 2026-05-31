import { pool } from './database';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  const client = await pool.connect();
  try {
    const migrationDir = path.join(__dirname, '../../migrations');
    const files = fs.readdirSync(migrationDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`🗄️  Ejecutando ${files.length} migración(es)...\n`);
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationDir, file), 'utf8');
      console.log(`  → ${file}`);
      await client.query(sql);
      console.log(`  ✓ ${file}`);
    }
    console.log('\n✅ Migraciones completadas');
  } catch (err) {
    console.error('❌ Error en migración:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
