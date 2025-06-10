const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

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

// بيانات الدخول
const users = {
  'admin': { password: 'dev2008', name: 'سامر' },
  'mod': { password: 'mod2004', name: 'عبد الرحمن' }
};

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/login">
      <h2>تسجيل الدخول</h2>
      ${req.query.error ? '<p style="color:red">بيانات خاطئة</p>' : ''}
      <input name="username" placeholder="المستخدم"><br>
      <input name="password" placeholder="كلمة المرور" type="password"><br>
      <button>دخول</button>
    </form>
  `);
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    res.redirect('/admin');
  } else {
    res.redirect('/login?error=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// صفحة لوحة التحكم
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  const isAdmin = req.session.role === 'admin';

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
          <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
          <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
          <option value="تم التنفيذ" ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
          <option value="مرفوض" ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
        </select>
      </td>
      <td><button onclick="deleteOrder(${order.id})" style="background:red;color:white">حذف</button></td>
    </tr>
  `).join('');

  res.send(`
    <html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"><title>لوحة الإدارة</title></head>
      <body>
        <h1>طلبات iPhone</h1>
        <h3>مرحبًا ${req.session.username} - ${req.session.role}</h3>
        <a href="/logout">تسجيل الخروج</a>
        <table border="1" width="100%" style="text-align:center">
          <tr><th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>كاش</th><th>تقسيط</th><th>شهري</th><th>الكود</th><th>الوقت</th><th>الحالة</th><th>حذف</th></tr>
          ${rows}
        </table>

        <script>
          function updateStatus(id, status) {
            fetch('/api/status/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            }).then(res => {
              if (!res.ok) {
                res.json().then(data => alert(data.error || 'خطأ'));
              }
            });
          }

          function deleteOrder(id) {
            if (confirm('تأكيد الحذف؟')) {
              fetch('/api/delete/' + id, { method: 'DELETE' })
                .then(res => {
                  if (!res.ok) {
                    res.json().then(data => alert(data.error || 'خطأ'));
                  } else {
                    location.reload();
                  }
                });
            }
          }
        </script>
      </body>
    </html>
  `);
});

// API إرسال الطلب من الموقع
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !code) return res.status(400).json({ error: 'بيانات ناقصة' });

  const existing = await pool.query('SELECT * FROM orders WHERE phone = $1 AND order_code = $2', [phone, code]);
  if (existing.rows.length > 0) return res.status(400).json({ error: 'الطلب موجود مسبقاً' });

  await pool.query(`
    INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

  res.json({ success: true });
});

// API حذف الطلب
app.delete('/api/delete/:id', async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'ليس لديك صلاحية للحذف' });
  }

  const id = req.params.id;
  await pool.query('DELETE FROM orders WHERE id = $1', [id]);
  res.json({ success: true });
});

// API تحديث الحالة
app.put('/api/status/:id', async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'ليس لديك صلاحية لتغيير الحالة' });
  }

  const id = req.params.id;
  const { status } = req.body;
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
