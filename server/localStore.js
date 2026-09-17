const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PLATINUM } = require('./constants');

const file = path.join(__dirname, 'data/store.json');

function read() { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); return data; }
function id(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function now() { return new Date(getClock()).toISOString(); }
function isMongoReady(mongoose) { return mongoose.connection.readyState === 1; }
function tierFor(data, points) { return [...data.tiers].sort((a, b) => b.threshold - a.threshold).find(tier => points >= tier.threshold) || data.tiers[0]; }

function getClock() {
  const data = read();
  return data.meta?.clock || new Date().toISOString();
}

function setClock(iso) {
  const data = read();
  data.meta = data.meta || {};
  data.meta.clock = iso;
  write(data);
}

function getOutbox() {
  const data = read();
  return data.outbox || [];
}

function addOutbox(notification) {
  const data = read();
  data.outbox = data.outbox || [];
  data.outbox.push(notification);
  write(data);
}

function ensureLocalBootstrap() {
  const data = read();
  let changed = false;

  if (!data.meta) { data.meta = { clock: new Date().toISOString() }; changed = true; }
  if (!data.meta.clock) { data.meta.clock = new Date().toISOString(); changed = true; }
  if (!data.outbox) { data.outbox = []; changed = true; }

  if (!data.tiers.some(tier => tier.name === 'Platinum')) {
    data.tiers.push({ _id: 'tier-platinum', ...PLATINUM });
    changed = true;
  }

  for (const member of data.members) {
    const platinum = data.tiers.find(tier => tier.name === 'Platinum');
    if (platinum && member.lifetimePoints >= platinum.threshold && member.tier !== 'Platinum') {
      member.tier = 'Platinum';
      changed = true;
    }
    if (!member.lastActivityAt) {
      const memberTx = data.transactions.filter(item => item.member === member._id);
      member.lastActivityAt = memberTx.length
        ? memberTx.reduce((latest, item) => (new Date(item.createdAt) > new Date(latest) ? item.createdAt : latest), memberTx[0].createdAt)
        : (member.updatedAt || member.createdAt);
      changed = true;
    }
  }

  if (changed) write(data);
}

module.exports = {
  read, write, id, now, isMongoReady, tierFor, getClock, setClock, getOutbox, addOutbox, ensureLocalBootstrap
};
