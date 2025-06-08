const express = require('express');
const basicAuth = require('express-basic-auth');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات (مرة واحدة فقط)
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

app.use(cors());
app.use(bodyParser.json());

// استقبال الطلب من نموذج HTML
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  try {
    await pool.query(
      `INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, phone, device, cashPrice, installmentPrice, monthly, code]
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// حماية صفحة الإدارة بكلمة مرور
app.use('/admin', basicAuth({
  users: { 'admin': '123456' },
  challenge: true,
  realm: '4 STORE',
  unauthorizedResponse: (req) => {
    return `
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>تسجيل الدخول - 4 STORE</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Almarai', sans-serif;
              background: linear-gradient(135deg, #4b1c78, #7e3cff);
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              color: #fff;
            }
            .container {
              background: #fff;
              color: #333;
              padding: 30px;
              border-radius: 12px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.2);
              text-align: center;
              max-width: 400px;
              width: 100%;
            }
            h2 {
              margin-bottom: 20px;
              color: #4b1c78;
            }
            input {
              width: 100%;
              padding: 12px;
              margin-bottom: 15px;
              border: 1px solid #ccc;
              border-radius: 8px;
              font-size: 16px;
            }
            button {
              width: 100%;
              padding: 12px;
              background-color: #4b1c78;
              color: #fff;
              border: none;
              font-size: 16px;
              border-radius: 8px;
              cursor: pointer;
              transition: 0.3s;
            }
            button:hover {
              background-color: #6334a5;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>تسجيل الدخول</h2>
            <p>يرجى إدخال اسم المستخدم وكلمة المرور</p>
            <form>
              <input type="text" placeholder="اسم المستخدم" disabled>
              <input type="password" placeholder="كلمة المرور" disabled>
              <button disabled>تسجيل الدخول</button>
            </form>
            <p style="color: red; margin-top: 10px;">بيانات الدخول غير صحيحة</p>
          </div>
        </body>
      </html>
    `;
  }
}));
