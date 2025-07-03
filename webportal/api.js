const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_PATH = path.join(__dirname, '../redatRequests.json');

// Vrátí všechny žádosti
router.get('/redat', (req, res) => {
  if (!fs.existsSync(DATA_PATH)) return res.json({});
  const raw = fs.readFileSync(DATA_PATH);
  if (!raw.length) return res.json({});
  try {
    const data = JSON.parse(raw);
    res.json(data);
  } catch {
    res.json({});
  }
});

// Změna stavu žádosti
router.post('/redat/update', express.json(), (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).end();
  if (!fs.existsSync(DATA_PATH)) return res.status(404).end();
  const raw = fs.readFileSync(DATA_PATH);
  if (!raw.length) return res.status(404).end();
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    return res.status(500).end();
  }
  if (!data[id]) return res.status(404).end();
  data[id].status = status;
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  res.json({ ok: true });
});

module.exports = router;
