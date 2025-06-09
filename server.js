// server.js
require('dotenv').config();                    // لتحميل متغيرات البيئة من .env
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');           // إذا كان Node.js أقل من 18، وإلا يمكنك حذفها

const app = express();
const port = process.env.PORT || 3000;

// إعداد قاعدة البيانات
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // عيّن DATABASE_URL في .env
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا لم يكن موجوداً
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

// ميدل وير
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// دالة مساعدة للإرسال إلى Discord
async function notifyDiscord(message) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('Discord notification error:', err);
  }
}

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
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

// معالجة تسجيل الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'dev2008') {
    req.session.authenticated = true;
    req.session.username = 'سامر عبدالله';
    res.redirect('/admin');
  } else {
    res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// لوحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  try {
    const searchQuery = req.query.q || '';
    const statusFilter = req.query.filter || '';
    let query = 'SELECT * FROM orders';
    const values = [];

    if (searchQuery) {
      values.push(`%${searchQuery}%`);
      query += ` WHERE (name ILIKE $${values.length} OR phone ILIKE $${values.length} OR order_code ILIKE $${values.length})`;
    }
    if (statusFilter) {
      values.push(statusFilter);
      query += values.length === 1
        ? ` WHERE status = $${values.length}`
        : ` AND status = $${values.length}`;
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);

    // إحصائيات
    const statsRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'قيد المراجعة') AS pending,
        COUNT(*) FILTER (WHERE status = 'قيد التنفيذ') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'تم التنفيذ') AS completed,
        COUNT(*) FILTER (WHERE status = 'مرفوض') AS rejected,
        COUNT(*) AS total
      FROM orders
    `);
    const stats = statsRes.rows[0];

    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price}</td>
        <td>${order.installment_price}</td>
        <td>${order.monthly}</td>
        <td>
          ${order.order_code}
          <button onclick="copyToClipboard('${order.order_code}')">📋</button>
        </td>
        <td>${new Date(order.created_at).toLocaleString()}</td>
        <td>
          <select onchange="updateStatus(${order.id}, this.value)" style="background-color:${{
            'قيد المراجعة': '#e2e3e5',
            'قيد التنفيذ': '#ffeeba',
            'تم التنفيذ':   '#c3e6cb',
            'مرفوض':       '#f5c6cb'
          }[order.status] || '#fff'};">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option value="تم التنفيذ"   ${order.status === 'تم التنفيذ'   ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض"       ${order.status === 'مرفوض'       ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="deleteOrder(${order.id})" style="background:red; color:white;">حذف</button>
        </td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Almarai', sans-serif; margin: 0; padding: 30px; background: #f5f7fa; direction: rtl; }
            h1 { text-align: center; color: #3b0a77; margin-bottom: 10px; }
            .stats { text-align:center; margin-bottom:20px; }
            .stats span { margin: 0 10px; font-weight:bold; }
            form { text-align: center; margin-bottom: 15px; }
            input, select, button { padding:10px; margin-right:5px; border-radius:6px; border:1px solid #ccc; }
            table { width:100%; border-collapse:collapse; background:#fff; box-shadow:0 5px 20px rgba(0,0,0,0.1); }
            th, td { padding:15px; text-align:center; border-bottom:1px solid #eee; }
            th { background:#3b0a77; color:#fff; }
            .refresh-btn { display:block; margin:10px auto; padding:10px 25px; background:#3b0a77; color:#fff; border:none; border-radius:6px; cursor:pointer; }
            .logout { text-align:center; margin-bottom:15px; }
            .logout a { color:#3b0a77; text-decoration:none; }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone</h1>
          <h2 style="text-align:center; color:#5a22a1;">مرحبًا ${req.session.username}</h2>
          <div class="logout"><a href="/logout">🔓 تسجيل الخروج</a></div>

          <div class="stats">
            <span>الإجمالي: ${stats.total}</span>
            <span style="color:orange;">قيد المراجعة: ${stats.pending}</span>
            <span style="color:blue;">قيد التنفيذ: ${stats.in_progress}</span>
            <span style="color:green;">تم التنفيذ: ${stats.completed}</span>
            <span style="color:red;">مرفوض: ${stats.rejected}</span>
          </div>

          <form method="GET" action="/admin">
            <input type="text" name="q" placeholder="ابحث بالاسم أو الجوال أو كود الطلب" value="${searchQuery}" />
            <select name="filter">
              <option value="">كل الحالات</option>
              <option value="قيد المراجعة"${statusFilter==='قيد المراجعة'?' selected':''}>قيد المراجعة</option>
              <option value="قيد التنفيذ"${statusFilter==='قيد التنفيذ'?' selected':''}>قيد التنفيذ</option>
              <option value="تم التنفيذ"${statusFilter==='تم التنفيذ'?' selected':''}>تم التنفيذ</option>
              <option value="مرفوض"${statusFilter==='مرفوض'?' selected':''}>مرفوض</option>
            </select>
            <button type="submit">🔍 بحث</button>
          </form>

          <button class="refresh-btn" onclick="location.href='/admin'">🔄 تحديث</button>

          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>كاش</th><th>تقسيط</th><th>شهري</th>
                <th>كود الطلب</th><th>الوقت</th><th>الحالة</th><th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <audio id="notifSound" src="/notif.mp3" preload="auto"></audio>
          <script>
            function deleteOrder(id) {
              if (confirm('هل تريد حذف هذا الطلب؟')) {
                fetch('/api/delete/' + id, { method: 'DELETE' })
                  .then(res => res.ok ? location.reload() : alert('فشل الحذف'));
              }
            }
            function updateStatus(id, status) {
              fetch('/api/status/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              }).then(res => {
                if (!res.ok) alert('فشل تحديث الحالة');
              });
              document.getElementById('notifSound').play();
            }
            function copyToClipboard(text) {
              navigator.clipboard.writeText(text)
                .then(() => alert('تم نسخ الكود: ' + text));
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Admin error:', err);
    res.status(500).send('خطأ أثناء تحميل لوحة الإدارة');
  }
});

// إضافة طلب جديد مع تنبيه Discord
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !code || phone.length < 8 || name.length < 2) {
    return res.status(400).json({ error: 'البيانات غير صحيحة' });
  }
  try {
    const existing = await pool.query(
      'SELECT * FROM orders WHERE phone=$1 AND order_code=$2',
      [phone, code]
    );
    if (existing.rows.length) {
      return res.status(400).json({ error: 'تم تقديم الطلب مسبقًا' });
    }
    await pool.query(
      `INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, phone, device, cashPrice, installmentPrice, monthly, code]
    );
    // إشعار Discord
    notifyDiscord(`📥 طلب جديد #${code}\n• ${name} - ${phone}\n• ${device}\n• كاش: ${cashPrice} - تقسيط: ${installmentPrice}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في معالجة الطلب' });
  }
});

// حذف طلب
app.delete('/api/delete/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل الحذف' });
  }
});

// تحديث حالة الطلب مع تنبيه Discord
app.put('/api/status/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    const old = await pool.query('SELECT order_code, name FROM orders WHERE id=$1', [id]);
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]);
    if (old.rows.length) {
      const { order_code, name } = old.rows[0];
      notifyDiscord(`🔄 تم تغيير حالة الطلب #${order_code} لـ ${status} (المستخدم: ${name})`);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
