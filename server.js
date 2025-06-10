const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// اتصال PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات
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
  cookie: { secure: false }
}));

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; background: #f5f7fa; display: flex; justify-content: center; align-items: center; height: 100vh; }
          .login-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 0 15px rgba(0,0,0,0.1); }
          input, button { width: 100%; padding: 10px; margin: 10px 0; font-size: 16px; border-radius: 6px; border: 1px solid #ccc; }
          button { background-color: #3b0a77; color: white; border: none; }
        </style>
      </head>
      <body>
        <form class="login-box" method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<p style="color:red;">بيانات خاطئة</p>' : ''}
          <input type="text" name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

// تسجيل الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = {
    'admin': { password: 'dev2008', name: 'سامر' },
    'mod': { password: 'mod2004', name: 'عبد الرحمن' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    res.redirect('/admin');
  } else {
    res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// لوحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  const searchQuery = req.query.q;
  let result;
  if (searchQuery) {
    const q = `%${searchQuery}%`;
    result = await pool.query(`SELECT * FROM orders WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1 ORDER BY created_at DESC`, [q]);
  } else {
    result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  }

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
        ${isAdmin ? `
          <select onchange="updateStatus(${order.id}, this.value)">
            <option ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
            <option ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
          </select>` : `<button onclick="alert('ليس لديك صلاحية لتغيير الحالة')">${order.status}</button>`}
      </td>
      <td>
        <button onclick="${isAdmin ? `deleteOrder(${order.id})` : `alert('ليس لديك صلاحية للحذف')`}" style="background:red;color:white;">حذف</button>
      </td>
    </tr>
  `).join('');

  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>لوحة التحكم</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; padding: 30px; background: #f5f7fa; }
          table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 0 15px rgba(0,0,0,0.1); border-radius: 8px; }
          th, td { padding: 12px; text-align: center; border: 1px solid #eee; }
          th { background: #3b0a77; color: white; }
        </style>
      </head>
      <body>
        <h1>مرحبا ${req.session.username}</h1>
        <a href="/logout">تسجيل الخروج</a>
        <form method="GET" action="/admin">
          <input type="text" name="q" placeholder="بحث" value="${searchQuery || ''}" />
          <button type="submit">🔍</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>السعر كاش</th><th>تقسيط</th><th>شهري</th><th>الكود</th><th>الوقت</th><th>الحالة</th><th>حذف</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <script>
          function deleteOrder(id) {
            fetch('/api/delete/' + id, { method: 'DELETE' })
              .then(res => res.json())
              .then(data => {
                if (data.error) return alert(data.error);
                location.reload();
              });
          }

          function updateStatus(id, status) {
            fetch('/api/status/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            }).then(res => res.json())
              .then(data => {
                if (data.error) alert(data.error);
              });
          }
        </script>
      </body>
    </html>
  `);
});

// إضافة طلب
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  if (!name || !phone || !device || !code || phone.length < 8) {
    return res.status(400).json({ error: 'بيانات غير صحيحة' });
  }

  const exists = await pool.query('SELECT * FROM orders WHERE phone = $1 AND order_code = $2', [phone, code]);
  if (exists.rows.length > 0) {
    return res.status(400).json({ error: 'تم إرسال الطلب مسبقًا' });
  }

  await pool.query(`INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [name, phone, device, cashPrice, installmentPrice, monthly, code]);

  res.status(200).json({ success: true });
});

// حذف طلب
app.delete('/api/delete/:id', async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'ليس لديك صلاحية' });

  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ في الحذف' });
  }
});

// تحديث حالة الطلب
app.put('/api/status/:id', async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'ليس لديك صلاحية' });

  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
