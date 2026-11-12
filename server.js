const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

['uploads', 'data'].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

const FILES_DB = 'data/files.json';
const USERS_DB = 'data/users.json';
if (!fs.existsSync(FILES_DB)) fs.writeFileSync(FILES_DB, '[]');
if (!fs.existsSync(USERS_DB)) {
  fs.writeFileSync(USERS_DB, JSON.stringify([
    { username: 'admin', password: 'sammodz2025', role: 'admin' }
  ], null, 2));
}

const readDB = f => JSON.parse(fs.readFileSync(f));
const writeDB = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

const storage = multer.diskStorage({
  destination: (req, f, cb) => cb(null, 'uploads/'),
  filename: (req, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e6) + '-' + f.originalname)
});
const upload = multer({ storage });

app.get('/api/files', (req, res) => res.json(readDB(FILES_DB)));

app.post('/api/upload', upload.fields([
  { name: 'fileData', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  const { name, description } = req.body;
  const fileData = req.files['fileData'] ? req.files['fileData'][0] : null;
  const image = req.files['image'] ? req.files['image'][0] : null;
  if (!fileData) return res.status(400).json({ error: 'Thiếu file' });

  const item = {
    id: Date.now(),
    name: name || fileData.originalname,
    description: description || '',
    fileUrl: '/uploads/' + fileData.filename,
    fileName: fileData.originalname,
    imageUrl: image ? '/uploads/' + image.filename : null,
    createdAt: new Date().toISOString(),
    downloads: 0
  };
  const data = readDB(FILES_DB);
  data.unshift(item);
  writeDB(FILES_DB, data);
  res.json(item);
});

app.post('/api/files/:id/download', (req, res) => {
  const id = Number(req.params.id);
  const data = readDB(FILES_DB);
  const item = data.find(f => f.id === id);
  if (item) { item.downloads = (item.downloads || 0) + 1; writeDB(FILES_DB, data); }
  res.json({ ok: true });
});

app.delete('/api/files/:id', (req, res) => {
  const id = Number(req.params.id);
  let data = readDB(FILES_DB);
  const item = data.find(f => f.id === id);
  if (item) {
    [item.fileUrl, item.imageUrl].forEach(u => {
      if (u) { const p = path.join(__dirname, u); if (fs.existsSync(p)) fs.unlinkSync(p); }
    });
    data = data.filter(f => f.id !== id);
    writeDB(FILES_DB, data);
  }
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readDB(USERS_DB);
  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  res.json({ ok: true, username: user.username, role: user.role });
});

app.post('/api/change-password', (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  const users = readDB(USERS_DB);
  const user = users.find(u => u.username === username);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
  if (user.password !== oldPassword) return res.status(401).json({ error: 'Mật khẩu cũ sai' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Mật khẩu mới quá ngắn' });
  user.password = newPassword;
  writeDB(USERS_DB, users);
  res.json({ ok: true });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
  const users = readDB(USERS_DB);
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'Tên đã tồn tại' });
  users.push({ username, password, role: 'user' });
  writeDB(USERS_DB, users);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`🚀 Chạy tại http://localhost:${PORT}`));
