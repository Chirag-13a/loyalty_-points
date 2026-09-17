module.exports = {
  PLATINUM: { name: 'Platinum', threshold: 5000, multiplier: 3, tone: 'platinum' },
  EXPIRY_DAYS: Number(process.env.POINTS_EXPIRY_DAYS || 90)
};
