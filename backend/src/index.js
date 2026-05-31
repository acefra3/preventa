require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./config/database');

const PORT = process.env.PORT || 3001;

async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`✅ Bluetab API corriendo en http://localhost:${PORT}`);
    console.log(`   Entorno: ${process.env.NODE_ENV}`);
  });
}

start().catch(err => {
  console.error('❌ Error al iniciar el servidor:', err);
  process.exit(1);
});
