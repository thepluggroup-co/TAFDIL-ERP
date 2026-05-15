const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const arr = errors.array();
    const message = arr.map(e => `${e.path}: ${e.msg}`).join(', ');
    return res.status(400).json({ success: false, message, errors: arr });
  }
  next();
}

function errorHandler(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] ERROR:`, err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

module.exports = { validate, errorHandler };
