const express = require('express');
const db = require('./database');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello, Split Expenses!');
});

app.get('/api/status', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS users FROM users').get();
  res.json({ status: 'ok', users: row.users });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));