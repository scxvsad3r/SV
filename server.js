require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

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

// تحقق تسجيل الدخول
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.authenticated = true;
    req.session.username = username;

    // إشعار إلى Discord
    try {
      if (process.env.DISCORD_WEBHOOK_URL) {
        await axios.post(process.env.DISCORD_WEBHOOK_URL, {
          content: `🔐 تم تسجيل دخول الأدمن (${username}) إلى لوحة الإدارة.`
        });
      }
    } catch (err) {
      console.error('فشل إرسال الإشعار إلى Discord:', err.message);
    }

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
    const q = req.query.q;
    let result;
    if (q) {
      const search = `%${q}%`;
      result = await pool.query(`
        SELECT * FROM orders
        WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1
        ORDER BY created_at DESC
      `, [search]);
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }

    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price}</td>
        <td>${order.installment_price}</td>
        <td>${order.monthly}</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString('ar-EG', { timeZone: 'Asia/Riyadh' })}</td>
        <td>
          <select onchange="updateStatus(${order.id}, this.value)">
            ${['قيد المراجعة','قيد التنفيذ','تم التنفيذ','مرفوض'].map(s => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </td>
        <td><button onclick="deleteOrder(${order.id})" style="background:red; color:white;">حذف</button></td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>لوحة الإدارة - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; margin: 0; padding: 30px; background: #f5f7fa; }
          h1, h2 { text-align: center; color: #3b0a77; }
          table { width: 100%; border-collapse: collapse; background: white; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: center; }
          th { background: #3b0a77; color: white; }
          input, button, select { padding: 7px; font-size: 15px; border-radius: 5px; }
          button { cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>طلبات iPhone</h1>
        <h2>مرحبًا ${req.session.username}</h2>
        <div style="text-align:center;"><a href="/logout">🔓 تسجيل الخروج</a></div>
        <form method="GET" action="/admin" style="text-align:center; margin-top:15px;">
          <input type="text" name="q" placeholder="ابحث..." value="${q || ''}" />
          <button type="submit">🔍 بحث</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>السعر كاش</th>
              <th>السعر تقسيط</th><th>القسط الشهري</th><th>الكود</th>
              <th>الوقت</th><th>الحالة</th><th>حذف</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          function deleteOrder(id) {
            if (confirm('هل أنت متأكد؟')) {
              fetch('/api/delete/' + id, { method: 'DELETE' }).then(() => location.reload());
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
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في جلب الطلبات');
  }
});

// إرسال الطلب (من صفحة العميل)
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !code || phone.length < 8 || name.length < 2)
    return res.status(400).json({ error: 'البيانات غير صحيحة' });

  try {
    const existing = await pool.query('SELECT * FROM orders WHERE phone=$1 AND order_code=$2', [phone, code]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'تم تقديم الطلب مسبقًا' });

    await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'فشل إدخال الطلب' });
  }
});

// تحديث الحالة
app.put('/api/status/:id', async (req, res) => {
  if (!req.session.authenticated) return res.status(403).json({ error: 'غير مصرح' });
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

// حذف الطلب
app.delete('/api/delete/:id', async (req, res) => {
  if (!req.session.authenticated) return res.status(403).json({ error: 'غير مصرح' });
  try {
    await pool.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل الحذف' });
  }
});

app.listen(port, () => {
  console.log(`🚀 4 STORE running at http://localhost:${port}`);
});
