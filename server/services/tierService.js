const mongoose = require('mongoose');
const { Tier, Member } = require('../models');
const store = require('../localStore');
const { notifyTierUpgrade } = require('./notificationService');

const { PLATINUM } = require('../constants');

function tierForFromList(tiers, lifetimePoints) {
  return [...tiers].sort((a, b) => b.threshold - a.threshold).find(tier => lifetimePoints >= tier.threshold) || tiers[0];
}

async function getTiers() {
  if (!store.isMongoReady(mongoose)) return store.read().tiers;
  return Tier.find().lean();
}

async function tierFor(lifetimePoints) {
  const tiers = await getTiers();
  return tierForFromList(tiers, lifetimePoints);
}

async function applyTierChange(member, previousTier, data) {
  const nextTier = store.isMongoReady(mongoose)
    ? (await tierFor(member.lifetimePoints)).name
    : localTierFor(data, member.lifetimePoints).name;
  if (nextTier === previousTier) return nextTier;
  member.tier = nextTier;
  await notifyTierUpgrade(member, previousTier, nextTier);
  return nextTier;
}

function localTierFor(data, points) {
  return store.tierFor(data, points);
}

async function upgradeQualifyingMembers() {
  if (store.isMongoReady(mongoose)) {
    const platinum = await Tier.findOne({ name: 'Platinum' });
    if (!platinum) return;
    await Member.updateMany(
      { lifetimePoints: { $gte: platinum.threshold }, tier: { $ne: 'Platinum' } },
      { $set: { tier: 'Platinum' } }
    );
    return;
  }
  const data = store.read();
  const platinum = data.tiers.find(tier => tier.name === 'Platinum');
  if (!platinum) return;
  let changed = false;
  for (const member of data.members) {
    if (member.lifetimePoints >= platinum.threshold && member.tier !== 'Platinum') {
      member.tier = 'Platinum';
      changed = true;
    }
  }
  if (changed) store.write(data);
}

module.exports = { PLATINUM, tierFor, tierForFromList, applyTierChange, localTierFor, upgradeQualifyingMembers };
