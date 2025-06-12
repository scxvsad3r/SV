
const express = require('express');
const path = require('path');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// جلسات لتخزين تسجيل الدخول
app.use(session({
  secret: 'secret_key_12345', // غيّر السر حسب ما تبي
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 ساعة
}));

// بيانات وهمية للمستخدمين (بدون DB للبساطة)
const users = [
  { username: 'admin', password: 'admin123', role: 'admin' },
  { username: 'mod', password: 'mod123', role: 'mod' },
  { username: 'user', password: 'user123', role: 'user' }
];

// Middleware للتحقق من تسجيل الدخول
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

// Middleware للتحقق من صلاحية الادمن فقط
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).send('ليس لديك صلاحية الوصول لهذه الصفحة.');
}

// Middleware للتحقق من صلاحية الأدمن أو المود
function isAdminOrMod(req, res, next) {
  if (req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'mod')) return next();
  return res.status(403).send('ليس لديك صلاحية الوصول لهذه الصفحة.');
}

// عرض صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

// معالجة تسجيل الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = { username: user.username, role: user.role };
    // توجيه حسب الدور
    if (user.role === 'admin' || user.role === 'mod') {
      return res.redirect('/admin');
    } else {
      return res.redirect('/chat');
    }
  }
  res.send('اسم المستخدم أو كلمة المرور خاطئة. <a href="/login">جرب مرة أخرى</a>');
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// صفحة لوحة الإدارة (لـ admin & mod)
app.get('/admin', isAdminOrMod, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// صفحة دردشة المستخدم (لـ user فقط)
app.get('/chat', isAuthenticated, (req, res) => {
  if (req.session.user.role === 'user') {
    return res.sendFile(path.join(__dirname, 'public/chat.html'));
  }
  res.status(403).send('هذه الصفحة مخصصة للمستخدمين فقط.');
});

// صفحة دردشة الأدمن (لـ admin فقط)
app.get('/admin-chat', isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin-chat.html'));
});

// ملفات ثابتة (css, js, images, ...)
app.use(express.static(path.join(__dirname, 'public')));


// ------- WebSocket للدردشة بين الأدمن والمستخدم --------
io.use((socket, next) => {
  // تأكد من الجلسة هنا (إذا تريد)
  next();
});

const usersOnline = {};  // لتخزين socket id لكل مستخدم وأدمن

io.on('connection', (socket) => {
  console.log('متصل:', socket.id);

  // استقبال تسجيل نوع المستخدم والدور
  socket.on('register', ({ username, role }) => {
    usersOnline[username] = { socketId: socket.id, role };
    console.log('مسجل:', username, role);
  });

  // استقبال رسالة دردشة
  socket.on('chat message', ({ from, to, message }) => {
    console.log(`رسالة من ${from} إلى ${to}: ${message}`);
    // إرسال للمتلقي إذا متصل
    if (usersOnline[to]) {
      io.to(usersOnline[to].socketId).emit('chat message', { from, message });
    }
  });

  // عند قطع الاتصال
  socket.on('disconnect', () => {
    console.log('انقطع:', socket.id);
    // إزالة المستخدم من القائمة
    for (const [username, data] of Object.entries(usersOnline)) {
      if (data.socketId === socket.id) {
        delete usersOnline[username];
        break;
      }
    }
  });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
