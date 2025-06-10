const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL setup
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

// المستخدمين
const users = {
  'admin': { password: 'dev2008', name: 'سامر' },
  'mod': { password: 'mod2004', name: 'عبد الرحمن' }
};

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; background: linear-gradient(to right, #3b0a77, #845ec2); display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center; width: 350px; }
          h2 { margin-bottom: 25px; color: #3b0a77; }
          input, button { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; font-size: 15px; }
          input { border: 1px solid #ccc; }
          button { background: #3b0a77; color: white; border: none; }
          .error { color: red; font-size: 14px; }
        </style>
      </head>
      <body>
        <form class="login-box" method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<div class="error">بيانات الدخول غير صحيحة</div>' : ''}
          <input type="text" name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
  `);
});

// معالجة تسجيل الدخول
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

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// إرسال الطلب
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !code || phone.length < 8 || name.length < 2) {
    return res.status(400).json({ error: 'البيانات غير صحيحة' });
  }

  const exists = await pool.query('SELECT * FROM orders WHERE phone=$1 AND order_code=$2', [phone, code]);
  if (exists.rows.length > 0) return res.status(400).json({ error: 'تم إرسال هذا الطلب مسبقاً' });

  await pool.query(`
    INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

  res.status(200).json({ success: true });
});

// حذف الطلب - فقط admin
app.delete('/api/delete/:id', async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'ليس لديك صلاحية الحذف' });
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل في الحذف' });
  }
});

// تحديث الحالة - admin و mod
app.put('/api/status/:id', async (req, res) => {
  if (!req.session.authenticated) return res.status(401).json({ error: 'غير مصرح' });
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

// لوحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  const q = req.query.q ? `%${req.query.q}%` : null;
  const orders = q
    ? await pool.query(`SELECT * FROM orders WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1 ORDER BY created_at DESC`, [q])
    : await pool.query('SELECT * FROM orders ORDER BY created_at DESC');

  const rows = orders.rows.map(order => `
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
          ${['قيد المراجعة','قيد التنفيذ','تم التنفيذ','مرفوض'].map(status => `
            <option value="${status}" ${order.status === status ? 'selected' : ''}>${status}</option>
          `).join('')}
        </select>
      </td>
      <td>
        ${req.session.role === 'admin' ? `<button onclick="deleteOrder(${order.id})" style="background:red;color:white;border:none;padding:6px 12px;border-radius:5px;">حذف</button>` : '—'}
      </td>
    </tr>
  `).join('');

  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>لوحة الإدارة</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; background: #f2f2f2; padding: 20px; }
          h1 { text-align: center; color: #3b0a77; }
          table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden; }
          th, td { padding: 12px 15px; text-align: center; border-bottom: 1px solid #ddd; }
          th { background: #3b0a77; color: white; }
          button { cursor: pointer; }
          .logout { text-align: center; margin-bottom: 10px; }
        </style>
      </head>
      <body>
        <div class="logout"><a href="/logout">🔓 تسجيل الخروج</a></div>
        <h1>طلبات iPhone - مرحبًا ${req.session.username}</h1>
        <form method="GET" action="/admin" style="text-align:center;margin:20px;">
          <input type="text" name="q" placeholder="بحث..." value="${req.query.q || ''}" style="padding:10px; width:300px;" />
          <button type="submit">بحث</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>الجهاز</th>
              <th>كاش</th>
              <th>تقسيط</th>
              <th>شهري</th>
              <th>الكود</th>
              <th>الوقت</th>
              <th>الحالة</th>
              <th>حذف</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <script>
          function deleteOrder(id) {
            if (confirm("هل أنت متأكد؟")) {
              fetch("/api/delete/" + id, { method: "DELETE" })
                .then(res => res.ok ? location.reload() : alert("ليس لديك صلاحية"));
            }
          }

          function updateStatus(id, status) {
            fetch("/api/status/" + id, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status })
            });
          }
        </script>
      </body>
    </html>
  `);
});

// تشغيل الخادم
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
