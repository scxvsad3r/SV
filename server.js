const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
// قم باستيراد node-fetch
const fetch = require('node-fetch'); // أو import fetch from 'node-fetch'; إذا كنت تستخدم ES Modules

const app = express();
const port = process.env.PORT || 3000;

// عنوان الويب هوك الخاص بالديسكورد
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1380965728668352644/ImB4sfkgPtAlzpTH4Uz6tVUaP4s5jZlZfTjfY8qN9PUYBj_e7XQZUAM9a4WY4v52oe4z';

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

app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; background: linear-gradient(to right, #3b0a77, #845ec2); display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .login-box { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); text-align: center; width: 350px; }
          h2 { margin-bottom: 25px; color: #3b0a77; }
          input, button { width: 100%; padding: 12px; margin-bottom: 15px; border-radius: 6px; font-size: 15px; }
          input { border: 1px solid #ccc; }
          button { background: #3b0a77; color: white; border: none; }
          button:hover { background: #5a22a1; }
          .error { color: red; margin-bottom: 10px; font-size: 14px; }
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
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  try {
    let result;
    const searchQuery = req.query.q;

    if (searchQuery) {
      const search = `%${searchQuery}%`;
      result = await pool.query(`
        SELECT * FROM orders
        WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1
        ORDER BY created_at DESC
      `, [search]);
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }

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
            body { font-family: 'Almarai', sans-serif; margin: 0; padding: 30px; background: #f5f7fa; color: #333; direction: rtl; }
            h1 { text-align: center; color: #3b0a77; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1); }
            th, td { padding: 15px; text-align: center; border-bottom: 1px solid #eee; font-size: 15px; }
            th { background-color: #3b0a77; color: white; }
            button { padding: 5px 10px; font-size: 14px; border: none; border-radius: 6px; cursor: pointer; }
            .refresh-btn { display: block; margin: 0 auto 20px; padding: 10px 25px; background-color: #3b0a77; color: white; }
            .logout-link { text-align: center; margin-bottom: 15px; }
            .logout-link a { color: #3b0a77; text-decoration: none; font-size: 15px; }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone</h1>
          <h2 style="text-align:center; color:#5a22a1;">مرحبًا ${req.session.username || ''}</h2>
          <div class="logout-link"><a href="/logout">🔓 تسجيل الخروج</a></div>
          <form method="GET" action="/admin" style="text-align: center; margin-bottom: 20px;">
            <input type="text" name="q" placeholder="ابحث بالاسم أو الجوال أو كود الطلب" style="padding:10px; width: 300px; border-radius: 6px; border:1px solid #ccc;" value="${req.query.q || ''}" />
            <button type="submit" style="padding: 10px 20px; background-color: #3b0a77; color: white; border: none; border-radius: 6px;">🔍 بحث</button>
          </form>
          <button class="refresh-btn" onclick="location.href='/admin'">🔄 تحديث الطلبات</button>
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
                <th>الحالة</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <script>
            function deleteOrder(id) {
              if (confirm('هل أنت متأكد أنك تريد حذف هذا الطلب؟')) {
                fetch('/api/delete/' + id, { method: 'DELETE' })
                  .then(res => res.ok ? location.reload() : alert('حدث خطأ أثناء الحذف'));
              }
            }

            function updateStatus(id, status) {
              fetch('/api/status/' + id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              }).then(res => {
                if (!res.ok) alert('فشل في تحديث الحالة');
              });
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

app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  if (!name || !phone || !device || !code || phone.length < 8 || name.length < 2) {
    return res.status(400).json({ error: 'البيانات المدخلة غير صحيحة' });
  }

  try {
    const existing = await pool.query(`
      SELECT * FROM orders WHERE phone = $1 AND order_code = $2
    `, [phone, code]);

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'تم تقديم هذا الطلب مسبقًا' });
    }

    // إدخال الطلب الجديد إلى قاعدة البيانات
    await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

    // *** الجزء الجديد: إرسال رسالة إلى الديسكورد ***
    const now = new Date();
    const dateTime = now.toLocaleString('ar-SA', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour12: true
    });

    const discordMessage = {
      username: '4 STORE - نظام الطلبات', // اسم البوت الذي يظهر في ديسكورد
      avatar_url: 'https://i.imgur.com/your-bot-avatar.png', // اختياري: رابط لصورة رمزية للبوت
      embeds: [
        {
          title: `طلب جديد: ${device}`,
          description: `لقد تم تسجيل طلب جديد بنجاح!`,
          color: 65280, // لون أخضر (يمكن تغييره)
          fields: [
            { name: 'الاسم', value: name, inline: true },
            { name: 'الجوال', value: phone, inline: true },
            { name: 'كود الطلب', value: code, inline: true },
            { name: 'السعر كاش', value: `${cashPrice || 'غير محدد'}`, inline: true },
            { name: 'السعر تقسيط', value: `${installmentPrice || 'غير محدد'}`, inline: true },
            { name: 'القسط الشهري', value: `${monthly || 'غير محدد'}`, inline: true },
            { name: 'الوقت والتاريخ', value: dateTime, inline: false },
            { name: 'حالة الطلب', value: 'قيد المراجعة', inline: false }
          ],
          timestamp: new Date().toISOString(), // الوقت الحالي بصيغة ISO
          footer: {
            text: 'نظام إدارة الطلبات - 4 STORE',
            icon_url: 'https://i.imgur.com/your-footer-icon.png' // اختياري: رابط لصورة صغيرة في التذييل
          }
        }
      ]
    };

    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordMessage),
      });
      console.log('تم إرسال إشعار طلب جديد إلى الديسكورد.');
    } catch (discordErr) {
      console.error('فشل إرسال رسالة إلى الديسكورد:', discordErr);
    }
    // *** نهاية الجزء الجديد ***

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'حدث خطأ أثناء معالجة الطلب' });
  }
});

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

app.put('/api/status/:id', async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
