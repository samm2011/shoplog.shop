const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Tạo thư mục nếu chưa có
['uploads', 'data'].forEach(d => { 
  if (!fs.existsSync(d)) fs.mkdirSync(d); 
});

// Đường dẫn database
const FILES_DB = 'data/files.json';
const USERS_DB = 'data/users.json';
const VISITORS_DB = 'data/visitors.json';

// Khởi tạo file database nếu chưa có
if (!fs.existsSync(FILES_DB)) fs.writeFileSync(FILES_DB, '[]');
if (!fs.existsSync(VISITORS_DB)) fs.writeFileSync(VISITORS_DB, '[]');
if (!fs.existsSync(USERS_DB)) {
  fs.writeFileSync(USERS_DB, JSON.stringify([
    { username: 'admin', password: 'sammodz2025', role: 'admin' }
  ], null, 2));
}

// Hàm đọc/ghi database
const readDB = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeDB = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2), 'utf8');

// Cấu hình Multer (lưu file)
const storage = multer.diskStorage({
  destination: (req, f, cb) => cb(null, 'uploads/'),
  filename: (req, f, cb) => cb(null, Date.now() + '-' + Math.round(Math.random()*1e6) + '-' + f.originalname)
});
const upload = multer({ storage });

// ==========================================
// API: NGƯỜI TRUY CẬP (VISITORS)
// ==========================================
app.post('/api/visit', (req, res) => {
  const { device } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Không rõ';
  
  const visitors = readDB(VISITORS_DB);
  visitors.unshift({ ip, device, time: new Date().toISOString() });
  
  // Giữ lại 200 người gần nhất để file JSON không bị phình to
  if (visitors.length > 200) visitors.pop();
  
  writeDB(VISITORS_DB, visitors);
  res.json({ ok: true });
});

app.get('/api/visitors', (req, res) => res.json(readDB(VISITORS_DB)));


// ==========================================
// API: QUẢN LÝ FILE (FILES)
// ==========================================
app.get('/api/files', (req, res) => res.json(readDB(FILES_DB)));

app.post('/api/upload', upload.fields([
  { name: 'fileData', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), (req, res) => {
  const { name, description, externalLink, imageUrl } = req.body;
  const fileData = req.files && req.files['fileData'] ? req.files['fileData'][0] : null;
  const image = req.files && req.files['image'] ? req.files['image'][0] : null;

  // Kiểm tra xem có File thật hay chỉ có Link ngoài
  if (!fileData && !externalLink) {
    return res.status(400).json({ error: 'Vui lòng chọn file tải lên hoặc dán link ngoài' });
  }

  const item = {
    id: Date.now(),
    name: name || (fileData ? fileData.originalname : 'File từ link ngoài'),
    description: description || '',
    // Nếu có file tải lên thì lưu đường dẫn nội bộ, nếu không thì lấy link ngoài
    fileUrl: fileData ? '/uploads/' + fileData.filename : externalLink,
    fileName: fileData ? fileData.originalname : 'Link ngoài',
    // Ảnh cũng tương tự
    imageUrl: image ? '/uploads/' + image.filename : (imageUrl || null),
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
  if (item) { 
    item.downloads = (item.downloads || 0) + 1; 
    writeDB(FILES_DB, data); 
  }
  res.json({ ok: true });
});

app.delete('/api/files/:id', (req, res) => {
  const id = Number(req.params.id);
  let data = readDB(FILES_DB);
  const item = data.find(f => f.id === id);
  
  if (item) {
    // Chỉ xóa file vật lý nếu nó nằm trong thư mục uploads của mình
    [item.fileUrl, item.imageUrl].forEach(u => {
      if (u && u.startsWith('/uploads/')) { 
        const p = path.join(__dirname, u); 
        if (fs.existsSync(p)) fs.unlinkSync(p); 
      }
    });
    data = data.filter(f => f.id !== id);
    writeDB(FILES_DB, data);
  }
  res.json({ ok: true });
});


// ==========================================
// API: TÀI KHOẢN (USERS)
// ==========================================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = readDB(USERS_DB);
  const user = users.find(u => u.username === username && u.password === password);
  
  if (!user) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  res.json({ ok: true, username: user.username, role: user.role });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
  
  const users = readDB(USERS_DB);
  if (users.find(u => u.username === username)) {
    return res.status(409).json({ error: 'Tên đã tồn tại' });
  }
  
  users.push({ username, password, role: 'user' });
  writeDB(USERS_DB, users);
  res.json({ ok: true });
});

app.post('/api/change-password', (req, res) => {
  const { username, oldPassword, newPassword } = req.body;
  const users = readDB(USERS_DB);
  const user = users.find(u => u.username === username);
  
  if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
  if (user.password !== oldPassword) return res.status(401).json({ error: 'Mật khẩu cũ sai' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'Mật khẩu mới quá ngắn (tối thiểu 4 ký tự)' });
  
  user.password = newPassword;
  writeDB(USERS_DB, users);
  res.json({ ok: true });
});

// ==========================================
// KHỞI ĐỘNG SERVER
// ==========================================
app.listen(PORT, () => console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`));
