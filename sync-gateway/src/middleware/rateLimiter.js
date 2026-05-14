const rateLimits = new Map(); // ip:userId → { count, resetAt }

const WINDOW_MS = 60_000;

/**
 * @param {number} max Requêtes autorisées par fenêtre de 60s
 */
function rateLimit(max = 100) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.user?.id || 'anon'}`;
    const now = Date.now();
    const entry = rateLimits.get(key);

    if (!entry || entry.resetAt < now) {
      rateLimits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        message: `Trop de requêtes — réessayez dans ${retryAfter}s`,
        retry_after: retryAfter,
      });
    }
    next();
  };
}

// Nettoyage toutes les 5 minutes (évite la fuite mémoire)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimits.entries()) {
    if (v.resetAt < now) rateLimits.delete(k);
  }
}, 5 * 60_000);

module.exports = { rateLimit };
