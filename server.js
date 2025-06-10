const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// رابط Webhook لـ Discord
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1380224693490946078/pkVZhjxSuuzB5LhM3AkCQ5nYjTYvssP6JYKabKsDofvSQcljDk7Oh6Hx_joNstjwb_CL';

// الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا لم يكن موجود
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
`);

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// عرض صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; background: #eee; display: flex; justify-content: center; align-items: center; height: 100vh; }
          form { background: #fff; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 300px; text-align: center; }
          input, button { width: 100%; padding: 10px; margin-top: 10px; }
          button { background: #3b0a77; color: white; border: none; cursor: pointer; }
          .error { color: red; margin-top: 10px; }
        </style>
      </head>
      <body>
        <form method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<div class="error">بيانات الدخول غير صحيحة</div>' : ''}
          <input type="text" name="username" placeholder="اسم المستخدم" required>
          <input type="password" name="password" placeholder="كلمة المرور" required>
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

// تحقق تسجيل الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const users = {
    'admin': { password: 'dev2008', name: 'سامر عبدالله' },
    'mod': { password: 'mod2004', name: 'عبد الرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;

    axios.post(DISCORD_WEBHOOK_URL, {
      content: `🔐 تسجيل دخول\n👤 المستخدم: **${users[username].name}**\n🎖️ الدور: **${username}**\n🕒 ${new Date().toLocaleString('ar-EG')}`
    }).catch(console.error);

    res.redirect('/admin');
  } else {
    res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  const username = req.session.username || 'غير معروف';
  const role = req.session.role || 'غير معروف';

  axios.post(DISCORD_WEBHOOK_URL, {
    content: `🚪 تسجيل خروج\n👤 المستخدم: **${username}**\n🎖️ الدور: **${role}**\n🕒 ${new Date().toLocaleString('ar-EG')}`
  }).catch(console.error);

  req.session.destroy(() => res.redirect('/login'));
});

// إرسال طلب جديد
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  if (!name || !phone || !device || !code || phone.length < 8 || name.length < 2) {
    return res.status(400).json({ error: 'البيانات المدخلة غير صحيحة' });
  }

  try {
    const existing = await pool.query(`
      SELECT * FROM orders WHERE phone = $1 AND order_code = $2
    `, [phone, code]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'تم تقديم هذا الطلب مسبقًا' });
    }

    await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

    axios.post(DISCORD_WEBHOOK_URL, {
      content: `📥 طلب جديد
👤 الاسم: **${name}**
📞 الجوال: **${phone}**
📱 الجهاز: **${device}**
💰 كاش: ${cashPrice} ريال
💳 تقسيط: ${installmentPrice} ريال | ${monthly} ريال شهري
🆔 كود: ${code}
🕒 ${new Date().toLocaleString('ar-EG')}`
    }).catch(console.error);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'خطأ في المعالجة' });
  }
});

// حذف الطلب (admin فقط)
app.delete('/api/delete/:id', async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'صلاحية غير كافية' });

  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);

    axios.post(DISCORD_WEBHOOK_URL, {
      content: `🗑️ حذف طلب
🆔 ID: ${req.params.id}
👤 بواسطة: ${req.session.username} (${req.session.role})
🕒 ${new Date().toLocaleString('ar-EG')}`
    }).catch(console.error);

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الحذف' });
  }
});

// تحديث حالة الطلب (admin فقط)
app.put('/api/status/:id', async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'صلاحية غير كافية' });

  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);

    axios.post(DISCORD_WEBHOOK_URL, {
      content: `✏️ تحديث حالة
🆔 ID: ${req.params.id}
📌 الحالة الجديدة: ${status}
👤 بواسطة: ${req.session.username} (${req.session.role})
🕒 ${new Date().toLocaleString('ar-EG')}`
    }).catch(console.error);

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في التحديث' });
  }
});

// لوحة الإدارة (أضف كود HTML إن أردت)
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  // صفحة الإدارة سيتم استكمالها لاحقًا أو حسب الطلب
  res.send(`<h1>مرحبًا ${req.session.username}</h1><a href="/logout">تسجيل الخروج</a>`);
});

// تشغيل الخادم
app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
