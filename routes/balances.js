const express = require('express');
const db = require('../database');
const { buildSummary } = require('../settlement');

const router = express.Router({ mergeParams: true });

router.use((req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  next();
});

router.get('/', (req, res) => {
  const groupId = Number(req.params.groupId);
  const userId = req.session.userId;

  const membership = Number.isInteger(groupId)
    ? db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId)
    : undefined;
  if (!membership) {
    return res.status(403).json({ error: 'You are not a member of this group.' });
  }

  const members = db
    .prepare(
      `SELECT u.id, u.name
         FROM users u
         JOIN group_members gm ON gm.user_id = u.id
        WHERE gm.group_id = ?`
    )
    .all(groupId);

  // Only unsettled shares count as debts.
  const rows = db
    .prepare(
      `SELECT s.user_id AS debtor_id, du.name AS debtor_name,
              e.paid_by AS creditor_id, cu.name AS creditor_name,
              SUM(s.amount_cents) AS amount_cents
         FROM expense_shares s
         JOIN expenses e ON e.id = s.expense_id
         JOIN users du ON du.id = s.user_id
         JOIN users cu ON cu.id = e.paid_by
        WHERE e.group_id = ? AND s.is_settled = 0
        GROUP BY s.user_id, e.paid_by`
    )
    .all(groupId);

  res.json(buildSummary(members, rows, userId));
});

module.exports = router;