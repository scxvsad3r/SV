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

// إنشاء جدول الطلبات إن لم يكن موجودًا
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
    <html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"><title>تسجيل الدخول</title></head>
      <body>
        <form method="POST" action="/login">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<p style="color:red;">بيانات الدخول غير صحيحة</p>' : ''}
          <input name="username" placeholder="اسم المستخدم" required /><br/>
          <input name="password" type="password" placeholder="كلمة المرور" required /><br/>
          <button type="submit">دخول</button>
        </form>
      </body>
    </html>
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

// لوحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

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
        ${req.session.role === 'admin' ? `
          <select onchange="updateStatus(${order.id}, this.value)">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option value="تم التنفيذ" ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض" ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
          </select>
        ` : order.status}
      </td>
      <td>
        ${req.session.role === 'admin' ? `<button onclick="deleteOrder(${order.id})">🗑️</button>` : `<button onclick="alert('❌ ليس لديك صلاحية للحذف')">🗑️</button>`}
      </td>
    </tr>
  `).join('');

  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>لوحة الإدارة</title>
        <style>table, td, th { border: 1px solid #aaa; padding: 8px; border-collapse: collapse; }</style>
      </head>
      <body>
        <h2>مرحباً ${req.session.username}</h2>
        <a href="/logout">تسجيل الخروج</a>
        <table>
          <thead>
            <tr><th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>كاش</th><th>تقسيط</th><th>شهري</th><th>كود</th><th>الوقت</th><th>الحالة</th><th>حذف</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <script>
          function deleteOrder(id) {
            fetch('/api/delete/' + id, { method: 'DELETE' })
              .then(res => res.json())
              .then(data => {
                if (data.success) location.reload();
                else alert(data.error || 'فشل الحذف');
              });
          }
          function updateStatus(id, status) {
            fetch('/api/status/' + id, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            }).then(res => res.json())
              .then(data => {
                if (!data.success) alert(data.error || 'فشل التحديث');
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
  if (!name || !phone || !device || !code) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }
  try {
    const existing = await pool.query('SELECT * FROM orders WHERE phone = $1 AND order_code = $2', [phone, code]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'تم تقديم الطلب مسبقًا' });

    await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'خطأ بالخادم' });
  }
});

// حذف الطلب (admin فقط)
app.delete('/api/delete/:id', async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '❌ ليس لديك صلاحية للحذف' });
  }
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل الحذف' });
  }
});

// تحديث الحالة (admin فقط)
app.put('/api/status/:id', async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: '❌ ليس لديك صلاحية لتعديل الحالة' });
  }
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
    res.status(200).json({ success: true });
  } catch {
    res.status(500).json({ error: 'فشل التحديث' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
