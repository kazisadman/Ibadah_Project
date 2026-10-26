require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const { MONGODB_URI, APP_PASSWORD, DB_NAME = 'ibadah', PORT = 3000 } = process.env;
if (!MONGODB_URI || !APP_PASSWORD) {
  console.error('Missing MONGODB_URI or APP_PASSWORD. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '5mb' }));
const page = () => fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
app.get(['/', '/index.html'], (q, r) => r.type('html').send(page()));
app.use(express.static(path.join(__dirname, 'public')));

// --- auth: password sent in a header, compared in constant time, with simple brute-force lockout
const fails = new Map();
const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a || '')).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
};
const auth = (req, res, next) => {
  const ip = req.ip, f = fails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 15 * 60 * 1000) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  if (same(req.get('x-app-password'), APP_PASSWORD)) { fails.delete(ip); return next(); }
  fails.set(ip, { n: f.n + 1, t: Date.now() });
  res.status(401).json({ error: 'Wrong password' });
};

// --- validation
const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const STATUS = ['', 'ontime', 'late', 'missed'];
const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
const num = v => Math.max(0, Math.min(10000000, parseInt(v) || 0));
const gl = v => (v === null || v === undefined || v === '') ? null : num(v);
const cleanEntry = (date, b = {}) => ({
  date,
  goalDurood: gl(b.goalDurood),
  goalIstighfar: gl(b.goalIstighfar),
  durood: num(b.durood),
  istighfar: num(b.istighfar),
  prayers: Object.fromEntries(PRAYERS.map(k => [k, STATUS.includes(b.prayers?.[k]) ? b.prayers[k] : '']))
});

let dbp;
const getDb = () => dbp || (dbp = MongoClient.connect(MONGODB_URI).then(c => {
  const d = c.db(DB_NAME);
  d.collection('entries').createIndex({ date: 1 }, { unique: true }).catch(() => {});
  return d;
}));
app.use('/api', async (q, r, next) => {
  try { q.db = await getDb(); next(); }
  catch (e) { dbp = null; console.error(e.message); r.status(500).json({ error: 'Database connection failed' }); }
});
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });

app.get('/api/check', auth, (q, r) => r.json({ ok: true }));

app.get('/api/entries', auth, wrap(async (q, r) =>
  r.json(await q.db.collection('entries').find({}, { projection: { _id: 0 } }).sort({ date: 1 }).toArray())));

app.put('/api/entries/:date', auth, wrap(async (q, r) => {
  if (!dateOk(q.params.date)) return r.status(400).json({ error: 'Bad date' });
  const e = cleanEntry(q.params.date, q.body);
  await q.db.collection('entries').updateOne({ date: e.date }, { $set: e }, { upsert: true });
  r.json(e);
}));

app.get('/api/settings', auth, wrap(async (q, r) => {
  const s = await q.db.collection('settings').findOne({ _id: 'main' });
  r.json({
    goalDurood: s?.goalDurood ?? 100, goalIstighfar: s?.goalIstighfar ?? 100,
    modeDurood: s?.modeDurood ?? 'manual', modeIstighfar: s?.modeIstighfar ?? 'manual',
    pct: s?.pct ?? 1, capDurood: s?.capDurood ?? 0, capIstighfar: s?.capIstighfar ?? 0
  });
}));

app.put('/api/settings', auth, wrap(async (q, r) => {
  const b = q.body || {};
  const s = {
    goalDurood: num(b.goalDurood), goalIstighfar: num(b.goalIstighfar),
    modeDurood: b.modeDurood === 'auto' ? 'auto' : 'manual', modeIstighfar: b.modeIstighfar === 'auto' ? 'auto' : 'manual',
    pct: Math.max(0, Math.min(100, parseFloat(b.pct) || 0)),
    capDurood: num(b.capDurood), capIstighfar: num(b.capIstighfar)
  };
  await q.db.collection('settings').updateOne({ _id: 'main' }, { $set: s }, { upsert: true });
  r.json(s);
}));

app.post('/api/import', auth, wrap(async (q, r) => {
  const list = (Array.isArray(q.body.entries) ? q.body.entries : []).filter(e => dateOk(e?.date)).slice(0, 20000);
  if (!list.length) return r.status(400).json({ error: 'No valid entries' });
  const ops = list.map(e => { const c = cleanEntry(e.date, e); return { updateOne: { filter: { date: c.date }, update: { $set: c }, upsert: true } }; });
  await q.db.collection('entries').bulkWrite(ops);
  r.json({ imported: list.length });
}));

if (require.main === module) {
  app.listen(PORT, () => console.log(`Dashboard running on http://localhost:${PORT}`));
}
module.exports = app;
