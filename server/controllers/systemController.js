const { expireStalePoints } = require('../services/expirationService');
const { getOutbox } = require('../services/notificationService');

async function advanceClock(req, res) {
  const now = req.body?.now;
  if (!now || Number.isNaN(new Date(now).getTime())) {
    return res.status(400).json({ message: 'Request body must include a valid ISO "now" timestamp.' });
  }
  const result = await expireStalePoints(now);
  res.json(result);
}

function listOutbox(_req, res) {
  res.json({ notifications: getOutbox() });
}

module.exports = { advanceClock, listOutbox };
