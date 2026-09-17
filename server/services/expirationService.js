const mongoose = require('mongoose');
const { Member, Transaction } = require('../models');
const store = require('../localStore');

const { EXPIRY_DAYS } = require('../constants');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function memberLastActivity(member, transactions) {
  if (member.lastActivityAt) return new Date(member.lastActivityAt);
  const memberTx = transactions.filter(item => item.member === member._id);
  if (memberTx.length) {
    return new Date(Math.max(...memberTx.map(item => new Date(item.createdAt).getTime())));
  }
  return new Date(member.updatedAt || member.createdAt);
}

function isStale(lastActivity, now) {
  return now.getTime() - lastActivity.getTime() >= EXPIRY_DAYS * MS_PER_DAY;
}

async function expireStalePoints(nowInput) {
  const now = nowInput ? new Date(nowInput) : new Date(store.getClock());
  const expired = [];

  if (!store.isMongoReady(mongoose)) {
    const data = store.read();
    for (const member of data.members) {
      if (member.balance <= 0) continue;
      const lastActivity = memberLastActivity(member, data.transactions);
      if (!isStale(lastActivity, now)) continue;
      const points = member.balance;
      const transaction = {
        _id: store.id('transaction'),
        member: member._id,
        type: 'expire',
        amount: 0,
        points: -points,
        description: `Points expired after ${EXPIRY_DAYS} days of inactivity`,
        createdAt: now.toISOString()
      };
      data.transactions.push(transaction);
      member.balance = 0;
      member.updatedAt = now.toISOString();
      expired.push({ memberId: member._id, points, transactionId: transaction._id });
    }
    store.setClock(now.toISOString());
    store.write(data);
    return { now: now.toISOString(), expired, expiredCount: expired.length };
  }

  const members = await Member.find({ balance: { $gt: 0 } });
  for (const member of members) {
    const lastTx = await Transaction.findOne({ member: member._id }).sort({ createdAt: -1 });
    const lastActivity = member.lastActivityAt
      ? new Date(member.lastActivityAt)
      : new Date(lastTx?.createdAt || member.updatedAt || member.createdAt);
    if (!isStale(lastActivity, now)) continue;
    const points = member.balance;
    const transaction = await Transaction.create({
      member: member._id,
      type: 'expire',
      amount: 0,
      points: -points,
      description: `Points expired after ${EXPIRY_DAYS} days of inactivity`,
      createdAt: now
    });
    member.balance = 0;
    member.updatedAt = now;
    await member.save();
    expired.push({ memberId: String(member._id), points, transactionId: String(transaction._id) });
  }
  store.setClock(now.toISOString());
  return { now: now.toISOString(), expired, expiredCount: expired.length };
}

module.exports = { expireStalePoints, EXPIRY_DAYS };
