const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret4store',
  resave: false,
  saveUninitialized: false
}));

// تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>تسجيل الدخول</title>
        <style>
          body { font-family: 'Tahoma', sans-serif; background: #f3f3f3; display: flex; justify-content: center; align-items: center; height: 100vh; }
          .login-box { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); width: 300px; text-align: center; }
          input { width: 100%; margin-bottom: 15px; padding: 10px; border: 1px solid #ccc; border-radius: 5px; }
          button { background: #3b0a77; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        </style>
      </head>
      <body>
        <form class="login-box" method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          <input type="text" name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === process.env.ADMIN_PASSWORD) {
    req.session.authenticated = true;
    res.redirect('/admin');
  } else {
    res.send('<script>alert("بيانات غير صحيحة"); window.location.href="/login";</script>');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// صفحة الإدارة مع البحث
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  const q = req.query.q || '';
  try {
    const result = await pool.query(`
      SELECT * FROM orders
      WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1
      ORDER BY created_at DESC
    `, [`%${q}%`]);

    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price}</td>
        <td>${order.installment_price}</td>
        <td>${order.monthly}</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString()}</td>
        <td><button onclick="deleteOrder(${order.id})" style="background:red; color:white;">حذف</button></td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة الإدارة</title>
          <style>
            body { font-family: 'Tahoma'; background: #f9f9f9; padding: 20px; }
            h1 { text-align: center; color: #3b0a77; }
            table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 0 10px #ccc; }
            th, td { padding: 10px; text-align: center; border-bottom: 1px solid #eee; }
            th { background: #3b0a77; color: white; }
            input[type="search"] { width: 250px; padding: 8px; margin: 10px 0; border: 1px solid #ccc; border-radius: 5px; }
            button { padding: 5px 10px; border: none; border-radius: 5px; }
            .logout { float: left; margin-top: -50px; background: #777; color: white; }
          </style>
        </head>
        <body>
          <h1>لوحة الطلبات</h1>
          <form method="GET" action="/admin">
            <input type="search" name="q" placeholder="بحث بالاسم أو الجوال أو الكود" value="${q}" />
            <button type="submit">بحث</button>
            <button onclick="window.location.href='/logout'" class="logout">تسجيل الخروج</button>
          </form>
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الجوال</th>
                <th>الجهاز</th>
                <th>السعر كاش</th>
                <th>السعر تقسيط</th>
                <th>القسط الشهري</th>
                <th>كود الطلب</th>
                <th>الوقت</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <script>
            function deleteOrder(id) {
              if (confirm('هل تريد حذف الطلب؟')) {
                fetch('/api/delete/' + id, { method: 'DELETE' }).then(res => {
                  if (res.ok) location.reload();
                  else alert('فشل الحذف');
                });
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('حدث خطأ');
  }
});

// API لحذف الطلب
app.delete('/api/delete/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'خطأ في الحذف' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Running on http://localhost:${port}`);
});
