const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// بيانات الاتصال
const DISCORD_WEBHOOK_URL = 'رابط_الويب_هوك_الخاص_بك';
const DATABASE_URL = 'رابط_قاعدة_البيانات_الخاصة_بك';

// Discord Logger
async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('فشل في إرسال رسالة إلى Discord:', err);
  }
}

// قاعدة البيانات
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات
pool.query(`
  CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    name TEXT,
    phone TEXT,
    device TEXT,
    cash_price INTEGER,
    installment_price INTEGER,
    monthly INTEGER,
    order_code TEXT,
    status TEXT DEFAULT 'قيد المراجعة',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(console.error);

// إعدادات السيرفر
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// تسجيل دخول وهمي
const users = {
  'admin': { password: 'dev2008', name: 'سامر عبدالله' },
  'mod': { password: 'mod2004', name: 'عبد الرحمن خالد' }
};

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  const error = req.query.error ? '<p style="color:red;">اسم المستخدم أو كلمة المرور خاطئة</p>' : '';
  res.send(`
    <html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تسجيل الدخول</title></head>
    <body style="text-align:center;font-family:sans-serif;">
      <h2>تسجيل الدخول</h2>
      ${error}
      <form method="POST" action="/login">
        <input name="username" placeholder="اسم المستخدم" required /><br><br>
        <input name="password" type="password" placeholder="كلمة المرور" required /><br><br>
        <button type="submit">دخول</button>
      </form>
    </body></html>
  `);
});

// تسجيل الدخول
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;

    await sendDiscordLog(`🔐 دخول: ${users[username].name}`);
    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة دخول فاشلة باسم: \`${username}\``);
    return res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 خروج: ${req.session.username}`);
  }
  req.session.destroy(() => res.redirect('/login'));
});

// حماية المسارات
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// لوحة الإدارة
app.get('/admin', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  const rows = result.rows.map(order => `
    <tr>
      <td>${order.name}</td><td>${order.phone}</td><td>${order.device}</td>
      <td>${order.cash_price}</td><td>${order.installment_price}</td><td>${order.monthly}</td>
      <td>${order.order_code}</td><td>${order.status}</td><td>${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</td>
    </tr>
  `).join('');

  res.send(`
    <html dir="rtl"><head><meta charset="UTF-8"><title>لوحة الإدارة</title></head>
    <body style="font-family:sans-serif;">
      <h1>لوحة التحكم - ${req.session.username}</h1>
      <table border="1" cellpadding="5"><tr>
        <th>الاسم</th><th>الجوال</th><th>الجهاز</th>
        <th>نقدًا</th><th>تقسيط</th><th>شهري</th>
        <th>الكود</th><th>الحالة</th><th>تاريخ</th>
      </tr>${rows}</table>
      <br><a href="/logout">تسجيل الخروج</a>
    </body></html>
  `);
});

// واجهة استعلام الطلبات (tak.js)
app.post('/api/track', async (req, res) => {
  const { name, phone, code } = req.body;

  if (!name || !phone || !code) {
    return res.json({ status: 'error', message: '⚠️ الرجاء إدخال جميع الحقول المطلوبة' });
  }

  try {
    const query = `
      SELECT * FROM orders
      WHERE name = $1 AND phone = $2 AND order_code = $3
      ORDER BY created_at DESC LIMIT 1
    `;
    const result = await pool.query(query, [name, phone, code]);

    if (result.rowCount === 0) {
      return res.json({ status: 'error', message: '❌ لم يتم العثور على طلب بهذه البيانات' });
    }

    const order = result.rows[0];
    const createdAt = new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });

    const msg = `📦 تفاصيل الطلب:\n• الاسم: ${order.name}\n• الجوال: ${order.phone}\n• الجهاز: ${order.device}\n• السعر نقداً: ${order.cash_price} ريال\n• السعر تقسيط: ${order.installment_price} ريال\n• كود الطلب: ${order.order_code}\n• الحالة: ${order.status}\n• تاريخ الطلب: ${createdAt}`;

    res.json({ status: 'success', message: msg });
  } catch (err) {
    console.error('Error in /api/track:', err);
    res.json({ status: 'error', message: '❌ حدث خطأ أثناء البحث عن الطلب' });
  }
});

app.listen(port, () => console.log(`🚀 السيرفر يعمل على http://localhost:${port}`));
