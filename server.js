// server.js
// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1382169050129502308/vvhIvYwXpnuumokS93llkK9rcIlGtZYFxXC2ckqhW-4-lfNKZuNcRTHHPxKyPf4F0Kc2';

// دالة لإرسال رسالة نصية لديسكورد
async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.error('Failed to send Discord log:', err);
  }
}

// دالة لإرسال Embed لديسكورد
async function sendDiscordEmbed(embed) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.error('Failed to send Discord embed:', err);
  }
}

// إعداد اتصال قاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false },
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
`).catch(err => console.error('Error creating table:', err));

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true },
}));

// --- توابع الحماية ---
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).json({ message: 'ليس لديك صلاحية' });
}

function requireModOrAdmin(req, res, next) {
  if (req.session.role === 'admin' || req.session.role === 'mod') return next();
  res.status(403).json({ message: 'ليس لديك صلاحية' });
}

// --- مسارات ---

// إضافة طلب جديد (Frontend يرسل هنا)
app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
    if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
      return res.status(400).json({ message: 'بيانات الطلب غير كاملة' });
    }
    const insertQuery = `
      INSERT INTO orders
        (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;
    const values = [name, phone, device, cashPrice, installmentPrice, monthly, code];
    const result = await pool.query(insertQuery, values);
    const order = result.rows[0];

    await sendDiscordLog(`📦 طلب جديد  
• الاسم: **${name}**  
• جوال: **${phone}**  
• جهاز: **${device}**  
• كود الطلب: **${code}**  
• الوقت: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error('Error in /api/order:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});

// صفحة تسجيل الدخول (GET)
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>تسجيل الدخول - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet" />
        <style>
          body { font-family: 'Almarai', sans-serif; background: linear-gradient(to right, #3b0a77, #845ec2); display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center; width: 350px; }
          h2 { margin-bottom: 25px; color: #3b0a77; }
          input, button { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; font-size: 15px; }
          input { border: 1px solid #ccc; }
          button { background: #3b0a77; color: white; border: none; }
          button:hover { background: #5a22a1; }
          .error { color: red; margin-bottom: 10px; font-size: 14px; }
        </style>
      </head>
      <body>
        <form class="login-box" method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<div class="error">بيانات الدخول غير صحيحة</div>' : ''}
          <input type="text" name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

// التحقق من بيانات الدخول (POST)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = {
    admin: { password: 'dev2008', name: 'سامر عبدالله' },
    mod: { password: 'mod2004', name: 'عبد الرحمن خالد' },
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    const firstName = users[username].name.split(' ')[0];
    req.session.greeting = username === 'admin'
      ? `مربحاً ${firstName}! 😀`
      : `مرحبا ${firstName}! 👋`;

    const embedLog = {
      title: "🔐 تسجيل دخول جديد",
      color: 0x6A0DAD,
      fields: [
        { name: "المستخدم", value: users[username].name, inline: true },
        { name: "الدور", value: username === 'admin' ? 'مشرف رئيسي' : 'مراقب', inline: true },
        { name: "الوقت", value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }), inline: false }
      ],
    };

    await sendDiscordEmbed(embedLog);

    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة تسجيل دخول فاشلة باسم مستخدم: \`${username}\` في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
    return res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: **${req.session.username}** (الدور: ${req.session.role}) في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// لوحة الإدارة - عرض الطلبات
app.get('/admin', requireAuth, async (req, res) => {
  try {
    let result;
    const searchQuery = req.query.q;
    if (searchQuery) {
      const search = `%${searchQuery}%`;
      result = await pool.query(
        `SELECT * FROM orders WHERE name ILIKE $1 OR phone ILIKE $1 OR device ILIKE $1 OR order_code ILIKE $1 ORDER BY created_at DESC`,
        [search]
      );
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }

    // عرض صفحة إدارة الطلبات بالـ EJS
    const ejs = require('ejs');
    const fs = require('fs');
    const path = require('path');

    const template = fs.readFileSync(path.join(__dirname, 'admin.ejs'), 'utf8');
    res.send(ejs.render(template, {
      user: { role: req.session.role, name: req.session.username },
      orders: result.rows,
      search: searchQuery || ''
    }));
  } catch (err) {
    console.error('Error loading admin:', err);
    res.status(500).send('حدث خطأ في تحميل الطلبات.');
  }
});

// تحديث حالة الطلب (admin فقط)
app.post('/admin/update-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) return res.status(400).send('بيانات غير كاملة');

    const updateRes = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );

    if (updateRes.rowCount === 0) return res.status(404).send('الطلب غير موجود');

    // سجل التغيير في ديسكورد
    const order = updateRes.rows[0];
    await sendDiscordLog(`✅ تم تحديث حالة الطلب  
• كود الطلب: **${order.order_code}**  
• الحالة الجديدة: **${status}**  
• بواسطة: **${req.session.username}**`);

    res.redirect('/admin');
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).send('خطأ في تحديث الحالة');
  }
});

// حذف طلب (admin فقط)
app.post('/admin/delete-order', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).send('الطلب غير محدد');

    const deleteRes = await pool.query('DELETE FROM orders WHERE id=$1 RETURNING *', [id]);

    if (deleteRes.rowCount === 0) return res.status(404).send('الطلب غير موجود');

    // سجل الحذف في ديسكورد
    await sendDiscordLog(`❌ تم حذف طلب  
• كود الطلب: **${deleteRes.rows[0].order_code}**  
• بواسطة: **${req.session.username}**`);

    res.redirect('/admin');
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).send('خطأ في حذف الطلب');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
