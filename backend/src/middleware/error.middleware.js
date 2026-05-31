function errorHandler(err, req, res, next) {
  console.error('❌ Error:', err.message, err.stack);

  // Errores de validación (express-validator)
  if (err.type === 'validation') {
    return res.status(400).json({ error: 'Datos inválidos', details: err.errors });
  }

  // Error de clave duplicada PostgreSQL
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }

  // Error de FK violada
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia a recurso inexistente' });
  }

  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Error interno del servidor'
    : err.message;

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
