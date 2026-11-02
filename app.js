const express = require('express');
const session = require('express-session');
const db = require('./database');

const app = express();
app.use(express.json());
app.use(
  session({
    secret: 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(express.static('public'));

app.use('/api', require('./routes/auth'));
app.use('/api/groups', require('./routes/groups'));

app.get('/api/status', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS users FROM users').get();
  res.json({ status: 'ok', users: row.users });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));