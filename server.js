const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

// قاعدة البيانات PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: '4store-secret-key',
  resave: false,
  saveUninitialized: true
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
          body {
            font-family: 'Almarai', sans-serif;
            background: #f4f4f9;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .login-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            text-align: center;
            width: 320px;
          }
          input {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border-radius: 6px;
            border: 1px solid #ccc;
          }
          button {
            width: 100%;
            padding: 12px;
            background: #3b0a77;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
          }
          h2 {
            margin-bottom: 20px;
            color: #3b0a77;
          }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h2>تسجيل الدخول</h2>
          <form method="POST" action="/login">
            <input type="text" name="username" placeholder="اسم المستخدم" required />
            <input type="password" name="password" placeholder="كلمة المرور" required />
            <button type="submit">دخول</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// معالجة تسجيل الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123456') {
    req.session.authenticated = true;
    res.redirect('/admin');
  } else {
    res.send(`<script>alert("بيانات الدخول غير صحيحة"); window.location.href='/login';</script>`);
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// صفحة الإدارة (محمية)
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) {
    return res.redirect('/login');
  }

  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
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
      </tr>
    `).join('');

    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>لوحة الطلبات - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Almarai', sans-serif;
            background: #f4f4f9;
            padding: 20px;
            color: #333;
          }
          h1 {
            text-align: center;
            color: #3b0a77;
            margin-bottom: 20px;
          }
          .logout {
            text-align: center;
            margin-bottom: 20px;
          }
          .logout a {
            background: #d9534f;
            color: white;
            padding: 10px 20px;
            border-radius: 6px;
            text-decoration: none;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            border-radius: 10px;
            overflow: hidden;
          }
          th, td {
            padding: 14px;
            border-bottom: 1px solid #eee;
            text-align: center;
          }
          th {
            background-color: #3b0a77;
            color: white;
          }
          tr:hover {
            background-color: #f9f9f9;
          }
        </style>
      </head>
      <body>
        <h1>طلبات iPhone</h1>
        <div class="logout">
          <a href="/logout">تسجيل الخروج</a>
        </div>
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
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحميل الطلبات');
  }
});

// بدء السيرفر
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
