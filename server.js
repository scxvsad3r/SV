عدل هذ هو خله كل مرة يطل منه كلمت مرور

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

// إنشاء جدول الطلبات (مرة وحدة فقط)
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

// نقطة استقبال الطلب من HTML
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

// حماية صفحة الإدارة
app.use('/admin', basicAuth({
  users: { 'admin': '123456' },
  challenge: true,
  unauthorizedResponse: 'غير مصرح'
}));

// صفحة الإدارة
app.get('/admin', async (req, res) => {
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
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #f8f8f8; direction: rtl; }
            h1 { color: #3b0a77; }
            table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 0 10px #ccc; }
            th, td { padding: 10px; border: 1px solid #ddd; text-align: center; }
            th { background: #3b0a77; color: white; }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone</h1>
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
    res.status(500).send('حدث خطأ أثناء جلب الطلبات');
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
