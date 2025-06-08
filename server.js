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

// تأكد من أن الحقل "status" مضاف (نفذه يدويًا في قاعدة البيانات):
// ALTER TABLE orders ADD COLUMN status TEXT DEFAULT 'قيد المراجعة';

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"><title>تسجيل الدخول</title></head>
      <body>
        <form method="POST" action="/login">
          <input name="username" placeholder="اسم المستخدم" />
          <input name="password" type="password" placeholder="كلمة المرور" />
          <button type="submit">دخول</button>
        </form>
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

// لوحة الإدارة
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
        <td>${new Date(order.created_at).toLocaleString()}</td>
        <td>
          <select onchange="updateStatus(${order.id}, this.value)">
            <option ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option ${order.status === 'تم الإنجاز' ? 'selected' : ''}>تم الإنجاز</option>
            <option ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="deleteOrder(${order.id})">حذف</button>
        </td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>لوحة الإدارة</title>
        </head>
        <body>
          <h2>مرحبًا ${req.session.username}</h2>
          <a href="/logout">تسجيل الخروج</a>
          <table border="1" width="100%" style="text-align:center;">
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
                <th>الحالة</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            function deleteOrder(id) {
              if (confirm("تأكيد الحذف؟")) {
                fetch('/api/delete/' + id, { method: 'DELETE' })
                  .then(() => location.reload());
              }
            }

            function updateStatus(id, newStatus) {
              fetch('/api/status/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
              }).then(res => {
                if (!res.ok) alert('خطأ في تحديث الحالة');
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

// استقبال الطلب
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  try {
    await pool.query(
      `INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [name, phone, device, cashPrice, installmentPrice, monthly, code, 'قيد المراجعة']
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// حذف الطلب
app.delete('/api/delete/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'خطأ في حذف الطلب' });
  }
});

// تحديث حالة الطلب
app.put('/api/status/:id', async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'فشل في تحديث الحالة' });
  }
});

// تشغيل السيرفر
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
