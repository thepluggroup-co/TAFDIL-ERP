/**
 * Logger structuré JSON — chaque requête émet une ligne JSON sur stdout.
 * Compatible avec DataDog / CloudWatch / Loki.
 */
function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    const log = {
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
      user_id: req.user?.id || null,
      user_role: req.user?.role || null,
      ip: req.ip,
      ua: req.get('user-agent')?.slice(0, 80) || null,
    };
    process.stdout.write(JSON.stringify(log) + '\n');
  });

  next();
}

module.exports = { requestLogger };
