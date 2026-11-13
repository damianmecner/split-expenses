const express = require('express');
const db = require('../database');

const router = express.Router({ mergeParams: true });

router.use((req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  next();
});

function isMember(groupId, userId) {
  if (!Number.isInteger(groupId) || !Number.isInteger(userId)) {
    return false;
  }
  const row = db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
  return row !== undefined;
}

// "12.50" or "12,5" -> 1250 (integer cents). Returns null for invalid input.
function parseAmountToCents(value) {
  const text = String(value === undefined ? '' : value).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  if (cents <= 0 || cents > 100000000) {
    return null;
  }
  return cents;
}

// Splits an amount equally; leftover cents go to the first people on the list.
function splitEqually(totalCents, userIds) {
  const base = Math.floor(totalCents / userIds.length);
  const remainder = totalCents - base * userIds.length;
  return userIds.map((userId, index) => ({
    userId,
    cents: base + (index < remainder ? 1 : 0),
  }));
}

router.post('/', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!isMember(groupId, req.session.userId)) {
    return res.status(403).json({ error: 'You are not a member of this group.' });
  }

  const body = req.body || {};

  const amountCents = parseAmountToCents(body.amount);
  if (amountCents === null) {
    return res.status(400).json({ error: 'Enter a valid amount, for example 12.50.' });
  }

  const paidBy = Number(body.paidBy);
  if (!isMember(groupId, paidBy)) {
    return res.status(400).json({ error: 'The person who paid must be a member of the group.' });
  }

  const splitBetween = Array.isArray(body.splitBetween)
    ? [...new Set(body.splitBetween.map(Number))].filter(Number.isInteger)
    : [];
  if (splitBetween.length === 0) {
    return res.status(400).json({ error: 'Choose at least one person to split the expense with.' });
  }
  if (!splitBetween.every((id) => isMember(groupId, id))) {
    return res.status(400).json({ error: 'Everyone in the split must be a member of the group.' });
  }

  const description = String(body.description || '').trim().slice(0, 100);
  const today = new Date().toISOString().slice(0, 10);
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') && !isNaN(new Date(body.date)) ? body.date : today;

  const save = db.transaction(() => {
    const result = db
      .prepare(
        'INSERT INTO expenses (group_id, paid_by, amount_cents, description, date) VALUES (?, ?, ?, ?, ?)'
      )
      .run(groupId, paidBy, amountCents, description, date);

    const expenseId = result.lastInsertRowid;
    const insertShare = db.prepare(
      'INSERT INTO expense_shares (expense_id, user_id, amount_cents) VALUES (?, ?, ?)'
    );
    for (const share of splitEqually(amountCents, splitBetween)) {
      // The payer does not owe money to themselves, so their own part is not stored.
      if (share.userId !== paidBy) {
        insertShare.run(expenseId, share.userId, share.cents);
      }
    }
    return expenseId;
  });

  const expenseId = save();
  res.status(201).json({ id: expenseId });
});

router.get('/', (req, res) => {
  const groupId = Number(req.params.groupId);
  if (!isMember(groupId, req.session.userId)) {
    return res.status(403).json({ error: 'You are not a member of this group.' });
  }

  const expenses = db
    .prepare(
      `
      SELECT e.id, e.amount_cents, e.description, e.date,
             e.paid_by, u.name AS paid_by_name,
             (SELECT group_concat(us.name, ', ')
                FROM expense_shares s
                JOIN users us ON us.id = s.user_id
               WHERE s.expense_id = e.id) AS shared_with
      FROM expenses e
      JOIN users u ON u.id = e.paid_by
      WHERE e.group_id = ?
      ORDER BY e.date DESC, e.id DESC
    `
    )
    .all(groupId);

  res.json(expenses);
});

module.exports = router;