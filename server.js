// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

const DISCORD_WEBHOOK_URL = 'رابط_الويب_هوك_الخاص_بك';

// إرسال لوق بسيط إلى ديسكورد
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

// الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: 'رابط_قاعدة_البيانات_الخاصة_بك',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا لم يكن موجودًا
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// استقبال الطلب الجديد
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
    return res.status(400).json({ message: 'بيانات الطلب غير كاملة' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

    const order = result.rows[0];

    await sendDiscordLog(`📦 طلب جديد  
• الاسم: **${name}**  
• جوال: **${phone}**  
• جهاز: **${device}**  
• كود الطلب: **${code}**  
• الوقت: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});

// تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>تسجيل الدخول</title></head>
    <body><form method="POST" action="/login">
      <input name="username" placeholder="اسم المستخدم" />
      <input name="password" type="password" placeholder="كلمة المرور" />
      <button type="submit">دخول</button>
    </form></body></html>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = {
    'admin': { password: 'dev2008', name: 'سامر عبدالله' },
    'mod':   { password: 'mod2004', name: 'عبد الرحمن خالد' }
  };
  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة تسجيل دخول فاشلة باسم: \`${username}\``);
    return res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: **${req.session.username}**`);
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
      <td>${order.order_code}</td><td>${order.status}</td>
    </tr>
  `).join('');

  res.send(`
    <html dir="rtl"><head><meta charset="UTF-8"><title>لوحة الإدارة</title></head>
    <body><h1>لوحة التحكم</h1><table border="1">${rows}</table><a href="/logout">خروج</a></body></html>
  `);
});

// تحديث الحالة
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ message: 'ليس لديك صلاحية' });

  const { status } = req.body;
  const id = req.params.id;
  const validStatuses = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];

  if (!validStatuses.includes(status)) return res.status(400).json({ message: 'حالة غير صالحة' });

  try {
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'الطلب غير موجود' });

    await sendDiscordLog(`✅ تم تحديث حالة الطلب (ID: ${id}) إلى "${status}" بواسطة ${req.session.username}`);
    res.json({ message: 'تم التحديث بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء التحديث' });
  }
});

// حذف الطلب
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ message: 'ليس لديك صلاحية' });

  const id = req.params.id;
  try {
    const result = await pool.query('DELETE FROM orders WHERE id=$1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'الطلب غير موجود' });

    await sendDiscordLog(`🗑️ تم حذف الطلب (ID: ${id}) بواسطة ${req.session.username}`);
    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ أثناء الحذف' });
  }
});

// ✅ استعلام عن الطلب (tak.js)
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

app.listen(port, () => console.log(`🚀 السيرفر يعمل على المنفذ ${port}`));
