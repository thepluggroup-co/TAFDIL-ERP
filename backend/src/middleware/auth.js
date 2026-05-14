const supabase = require('../config/supabase');

/**
 * Vérifie le JWT Supabase sur les routes protégées.
 * Injecte req.user = { id, email, role, metadata }
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Token manquant' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ success: false, message: 'Token invalide ou expiré' });
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.user_metadata?.role || 'vendeur',
    metadata: user.user_metadata,
  };

  next();
}

/**
 * Vérifie que l'utilisateur possède l'un des rôles autorisés.
 * Utiliser après requireAuth.
 *
 * @param {...string} roles  Ex: requireRole('dg', 'admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Non authentifié' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Accès refusé. Rôles autorisés : ${roles.join(', ')}`,
      });
    }
    next();
  };
}

/**
 * Protège les routes appelées par un scheduler externe (cron jobs).
 * Valide le header X-Cron-Key contre process.env.CRON_SECRET.
 * Ne nécessite pas de JWT utilisateur.
 */
function requireCronKey(req, res, next) {
  const key = req.headers['x-cron-key'];
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(500).json({ success: false, message: 'CRON_SECRET non configuré' });
  }
  if (!key || key !== secret) {
    return res.status(401).json({ success: false, message: 'Clé cron invalide ou manquante' });
  }
  next();
}

module.exports = { requireAuth, requireRole, requireCronKey };
