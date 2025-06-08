const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL
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
    status TEXT DEFAULT 'قيد التنفيذ',
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
      <head><meta charset="UTF-8"><title>تسجيل الدخول - 4 STORE</title></head>
      <body>
        <form method="POST" action="/login">
          <input type="text" name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
        ${req.query.error ? '<p style="color:red;">بيانات الدخول غير صحيحة</p>' : ''}
      </body>
    </html>
  `);
});

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

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

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
        <td>${order.status}</td>
        <td>${new Date(order.created_at).toLocaleString()}</td>
        <td>
          <select onchange="updateStatus(${order.id}, this.value)">
            <option ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option ${order.status === 'تم فتح الطلب' ? 'selected' : ''}>تم فتح الطلب</option>
            <option ${order.status === 'تم إنهاء الطلب' ? 'selected' : ''}>تم إنهاء الطلب</option>
          </select>
        </td>
        <td><button onclick="deleteOrder(${order.id})" style="background:red;color:white;">حذف</button></td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>لوحة الإدارة</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #f0f0f0; }
            table { width: 100%; background: #fff; border-collapse: collapse; }
            th, td { padding: 10px; border: 1px solid #ddd; }
            th { background: #3b0a77; color: white; }
          </style>
        </head>
        <body>
          <h2>مرحبًا ${req.session.username}</h2>
          <a href="/logout">تسجيل الخروج</a>
          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>كاش</th><th>تقسيط</th><th>شهري</th>
                <th>الكود</th><th>الحالة</th><th>التاريخ</th><th>تغيير الحالة</th><th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            function updateStatus(id, status) {
              fetch('/api/update-status/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              }).then(res => {
                if (!res.ok) alert('خطأ في تحديث الحالة');
              });
            }

            function deleteOrder(id) {
              if (confirm('تأكيد الحذف؟')) {
                fetch('/api/delete/' + id, { method: 'DELETE' })
                  .then(res => res.ok ? location.reload() : alert('خطأ في الحذف'));
              }
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
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.put('/api/update-status/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.delete('/api/delete/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطأ في حذف الطلب' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
