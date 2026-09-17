const store = require('../localStore');

function buildTierNotification(member, previousTier, newTier) {
  return {
    id: store.id('notification'),
    type: 'tier_upgrade',
    memberId: String(member._id),
    phone: member.phone,
    name: member.name,
    previousTier,
    newTier,
    message: `Congratulations! You have reached ${newTier} tier.`,
    createdAt: store.now()
  };
}

async function deliverNotification(notification) {
  const url = process.env.NOTIFICATION_SERVICE_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification)
    });
  } catch (error) {
    console.warn(`Notification service unavailable (${error.message}). Entry kept in outbox.`);
  }
}

async function notifyTierUpgrade(member, previousTier, newTier) {
  const notification = buildTierNotification(member, previousTier, newTier);
  store.addOutbox(notification);
  await deliverNotification(notification);
  return notification;
}

function getOutbox() {
  return store.getOutbox();
}

module.exports = { notifyTierUpgrade, getOutbox, buildTierNotification };
