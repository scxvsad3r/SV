const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// الجلسة
app.use(session({
  secret: '4store-secret-key',
  resave: false,
  saveUninitialized: false
}));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ---------- واجهة تسجيل الدخول ----------
app.get('/login', (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect('/admin');
  }
  res.send(`
    <form method="POST" action="/login" style="font-family:sans-serif;max-width:300px;margin:100px auto;text-align:center;">
      <h2>تسجيل دخول الأدمن</h2>
      <input name="username" placeholder="اسم المستخدم" required style="display:block;width:100%;margin:10px 0;padding:10px" />
      <input name="password" type="password" placeholder="كلمة المرور" required style="display:block;width:100%;margin:10px 0;padding:10px" />
      <button type="submit" style="padding:10px 20px;">دخول</button>
    </form>
  `);
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'dev2008') {
    req.session.loggedIn = true;

    // إرسال إشعار إلى Discord
    if (process.env.DISCORD_WEBHOOK_URL) {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🛡️ تم دخول الأدمن إلى لوحة التحكم في 4 STORE ✅`
        })
      });
    }

    res.redirect('/admin');
  } else {
    res.send('بيانات غير صحيحة');
  }
});

// ---------- تسجيل الخروج ----------
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ---------- لوحة الإدارة ----------
app.get('/admin', async (req, res) => {
  if (!req.session.loggedIn) return res.redirect('/login');

  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const rows = result.rows;

    let html = `
      <h2 style="text-align:center;font-family:sans-serif;">لوحة إدارة طلبات iPhone</h2>
      <p style="text-align:center;"><a href="/logout">تسجيل خروج</a></p>
      <table border="1" cellspacing="0" cellpadding="8" style="margin:20px auto;font-family:sans-serif;">
        <tr>
          <th>الاسم</th><th>رقم الجوال</th><th>المدينة</th><th>نوع الجهاز</th><th>الحالة</th><th>كود الطلب</th><th>تحديث</th>
        </tr>`;

    rows.forEach(row => {
      html += `
        <tr>
          <td>${row.name}</td>
          <td>${row.phone}</td>
          <td>${row.city}</td>
          <td>${row.device}</td>
          <td>${row.status}</td>
          <td>${row.code}</td>
          <td>
            <form method="POST" action="/update" style="display:flex;gap:5px;">
              <input type="hidden" name="code" value="${row.code}" />
              <select name="status">
                <option ${row.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
                <option ${row.status === 'تم فتح الطلب' ? 'selected' : ''}>تم فتح الطلب</option>
                <option ${row.status === 'تم إنهاء الطلب' ? 'selected' : ''}>تم إنهاء الطلب</option>
              </select>
              <button type="submit">تحديث</button>
            </form>
          </td>
        </tr>`;
    });

    html += `</table>`;
    res.send(html);
  } catch (err) {
    res.status(500).send('خطأ في الاتصال بقاعدة البيانات');
  }
});

// ---------- تحديث حالة الطلب ----------
app.post('/update', async (req, res) => {
  if (!req.session.loggedIn) return res.status(403).send('غير مصرح');

  const { code, status } = req.body;

  try {
    await pool.query('UPDATE orders SET status=$1 WHERE code=$2', [status, code]);
    res.redirect('/admin');
  } catch (err) {
    res.status(500).send('فشل التحديث');
  }
});

// ---------- بدء السيرفر ----------
app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
