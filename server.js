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

// مسار لحذف الطلب
app.delete('/api/delete/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'خطأ في حذف الطلب' });
  }
});

// حماية صفحة الإدارة بكلمة مرور
app.use('/admin', basicAuth({
  users: { 'admin': '123456' },
  challenge: true,
  unauthorizedResponse: 'غير مصرح'
}));

// صفحة عرض الطلبات
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
        <td>
          <button onclick="deleteOrder(${order.id})" style="background:red; color:white; border:none; padding:5px 10px; border-radius:5px;">حذف</button>
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
            body {
              font-family: 'Almarai', sans-serif;
              margin: 0;
              padding: 30px;
              background: #f5f7fa;
              color: #333;
              direction: rtl;
            }
            h1 {
              text-align: center;
              color: #3b0a77;
              margin-bottom: 30px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background: #fff;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
            }
            th, td {
              padding: 15px;
              text-align: center;
              border-bottom: 1px solid #eee;
              font-size: 15px;
            }
            th {
              background-color: #3b0a77;
              color: white;
              font-size: 16px;
            }
            tr:hover {
              background-color: #f0f0f0;
            }
            button {
              padding: 5px 10px;
              font-size: 14px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }
            .refresh-btn {
              display: block;
              margin: 0 auto 20px;
              padding: 10px 25px;
              background-color: #3b0a77;
              color: white;
              font-size: 15px;
            }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone</h1>
          <button class="refresh-btn" onclick="location.reload()">🔄 تحديث الطلبات</button>
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
              if (confirm('هل أنت متأكد أنك تريد حذف هذا الطلب؟')) {
                fetch('/api/delete/' + id, { method: 'DELETE' })
                  .then(res => {
                    if (res.ok) {
                      alert('تم حذف الطلب بنجاح');
                      location.reload();
                    } else {
                      alert('حدث خطأ أثناء الحذف');
                    }
                  });
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Admin page error:', err);
    res.status(500).send('حدث خطأ أثناء جلب الطلبات');
  }
});

// تشغيل الخادم
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
