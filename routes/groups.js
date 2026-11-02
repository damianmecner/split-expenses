const express = require('express');
const db = require('../database');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  next();
}

router.use(requireLogin);

function isMember(groupId, userId) {
  const row = db
    .prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
  return row !== undefined;
}

router.post('/', (req, res) => {
  const name = ((req.body || {}).name || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Group name is required.' });
  }

  const createGroup = db.transaction(() => {
    const result = db.prepare('INSERT INTO "groups" (name) VALUES (?)').run(name);
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)')
      .run(result.lastInsertRowid, req.session.userId);
    return result.lastInsertRowid;
  });

  const groupId = createGroup();
  res.status(201).json({ id: groupId, name });
});

router.get('/', (req, res) => {
  const groups = db
    .prepare(`
      SELECT g.id, g.name
      FROM "groups" g
      JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
    `)
    .all(req.session.userId);
  res.json(groups);
});

router.get('/:id/members', (req, res) => {
  const groupId = Number(req.params.id);
  if (!isMember(groupId, req.session.userId)) {
    return res.status(403).json({ error: 'You are not a member of this group.' });
  }

  const members = db
    .prepare(`
      SELECT u.id, u.name, u.email
      FROM users u
      JOIN group_members gm ON gm.user_id = u.id
      WHERE gm.group_id = ?
    `)
    .all(groupId);
  res.json(members);
});

router.post('/:id/members', (req, res) => {
  const groupId = Number(req.params.id);
  if (!isMember(groupId, req.session.userId)) {
    return res.status(403).json({ error: 'You are not a member of this group.' });
  }

  const email = ((req.body || {}).email || '').trim().toLowerCase();
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(404).json({ error: 'No user with this email. Ask your roommate to register first.' });
  }
  if (isMember(groupId, user.id)) {
    return res.status(409).json({ error: 'This user is already in the group.' });
  }

  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, user.id);
  res.status(201).json(user);
});

module.exports = router;