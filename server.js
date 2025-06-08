const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// إعداد الجلسات
app.use(session({
  secret: '4store_secret_key',
  resave: false,
  saveUninitialized: true
}));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// قاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا غير موجود
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
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// التحقق من بيانات الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123456') {
    req.session.loggedIn = true;
    res.redirect('/admin');
  } else {
    res.send('<script>alert("بيانات غير صحيحة"); window.location="/login";</script>');
  }
});

// حماية صفحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect('/login');
  }

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
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات - 4 STORE</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Almarai', sans-serif; padding: 30px; background: #f4f4f9; color: #333; direction: rtl; }
            h1 { text-align: center; color: #3b0a77; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; box-shadow: 0 0 10px #ccc; overflow: hidden; }
            th, td { padding: 12px 10px; text-align: center; border-bottom: 1px solid #eee; }
            th { background: #3b0a77; color: white; }
            tr:hover { background-color: #f1f1f1; }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone - 4 STORE</h1>
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
    res.status(500).send('خطأ أثناء جلب الطلبات');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
