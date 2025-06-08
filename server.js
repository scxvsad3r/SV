const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إعدادات الجلسة (للاحتفاظ بتسجيل الدخول)
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true
}));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// إنشاء جدول الطلبات إذا ما كان موجود
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

// صفحة تسجيل الدخول
app.get('/admin/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تسجيل دخول الإدارة - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Almarai', sans-serif;
            background-color: #f4f4f9;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
          }
          .login-box {
            background: #fff;
            padding: 30px 25px;
            border-radius: 12px;
            box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
            width: 90%;
            max-width: 380px;
            text-align: center;
          }
          .login-box h2 {
            color: #3b0a77;
            margin-bottom: 20px;
          }
          .login-box input {
            width: 100%;
            padding: 12px;
            margin: 10px 0;
            border: 1px solid #ccc;
            border-radius: 8px;
            font-size: 16px;
          }
          .login-box button {
            width: 100%;
            padding: 12px;
            background-color: #3b0a77;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: background 0.3s;
          }
          .login-box button:hover {
            background-color: #2a0756;
          }
        </style>
      </head>
      <body>
        <form class="login-box" method="POST" action="/admin/login">
          <h2>تسجيل دخول الإدارة</h2>
          <input type="text" name="username" placeholder="اسم المستخدم" required>
          <input type="password" name="password" placeholder="كلمة المرور" required>
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

// التحقق من تسجيل الدخول
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123456') {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.send('اسم المستخدم أو كلمة المرور خاطئة');
  }
});

// حماية صفحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.loggedIn) return res.redirect('/admin/login');

  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price} ريال</td>
        <td>${order.installment_price} ريال</td>
        <td>${order.monthly} ريال</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString('ar-EG')}</td>
      </tr>
    `).join('');

    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة الطلبات - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Almarai', sans-serif;
            margin: 0;
            background: #f8f8fc;
          }
          header {
            background-color: #3b0a77;
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 24px;
            position: sticky;
            top: 0;
            z-index: 1000;
          }
          .logout {
            position: absolute;
            left: 20px;
            top: 20px;
            background-color: #fff;
            color: #3b0a77;
            padding: 8px 16px;
            border: 1px solid #3b0a77;
            border-radius: 8px;
            text-decoration: none;
            font-size: 14px;
          }
          .container {
            padding: 20px;
            max-width: 95%;
            margin: auto;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          }
          th, td {
            padding: 12px 8px;
            text-align: center;
            border-bottom: 1px solid #eee;
            font-size: 14px;
          }
          th {
            background-color: #f1eef9;
            color: #3b0a77;
            font-weight: bold;
          }
          tr:hover {
            background-color: #f9f9ff;
          }

          @media (max-width: 768px) {
            table, thead, tbody, th, td, tr {
              display: block;
            }
            th {
              display: none;
            }
            td {
              position: relative;
              padding-right: 50%;
              text-align: right;
              border-bottom: 1px solid #ddd;
            }
            td::before {
              content: attr(data-label);
              position: absolute;
              right: 10px;
              font-weight: bold;
              color: #3b0a77;
            }
          }
        </style>
      </head>
      <body>
        <header>
          لوحة إدارة الطلبات - 4 STORE
          <a class="logout" href="/admin/logout">تسجيل خروج</a>
        </header>
        <div class="container">
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
            <tbody>
              ${rows.map(order => `
                <tr>
                  <td data-label="الاسم">${order.name}</td>
                  <td data-label="الجوال">${order.phone}</td>
                  <td data-label="الجهاز">${order.device}</td>
                  <td data-label="كاش">${order.cash_price} ريال</td>
                  <td data-label="تقسيط">${order.installment_price} ريال</td>
                  <td data-label="شهري">${order.monthly} ريال</td>
                  <td data-label="كود">${order.order_code}</td>
                  <td data-label="الوقت">${new Date(order.created_at).toLocaleString('ar-EG')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في تحميل الطلبات');
  }
});
