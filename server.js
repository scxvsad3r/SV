const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// رابط ويب هوك ديسكورد (غيره إلى الرابط حقك)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN';

// دالة لإرسال لوق لديسكورد
async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('Failed to send Discord log:', err);
  }
}

// إعداد اتصال قاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا لم يكن موجود
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
`).catch(err => console.error('Error creating table:', err));

// وسطاء
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// صفحة تسجيل الدخول (GET)
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

// التحقق من بيانات الدخول (POST)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const users = {
    'admin': { password: 'dev2008', name: 'سامر عبدالله' },
    'mod': { password: 'mod2004', name: 'عبد الرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;

    await sendDiscordLog(`[تسجيل دخول] المستخدم **${users[username].name}** (الدور: ${username}) سجل الدخول بنجاح في ${new Date().toLocaleString()}`);

    res.redirect('/admin');
  } else {
    await sendDiscordLog(`[تسجيل دخول فاشل] محاولة دخول باسم مستخدم: \`${username}\` في ${new Date().toLocaleString()}`);
    res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`[تسجيل خروج] المستخدم **${req.session.username}** (الدور: ${req.session.role}) سجل الخروج في ${new Date().toLocaleString()}`);
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// حماية المسارات التي تحتاج تسجيل دخول
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// لوحة الإدارة - عرض الطلبات
app.get('/admin', requireAuth, async (req, res) => {
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
          <select onchange="${req.session.role === 'admin' ? `updateStatus(${order.id}, this.value)` : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option value="تم التنفيذ" ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض" ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="${req.session.role === 'admin' ? `deleteOrder(${order.id})` : `alert('ليس لديك صلاحية لحذف الطلب')`}" style="background:red; color:white; border:none; padding:5px 10px; border-radius:5px;">
            حذف
          </button>
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
          <div class="logout-link"><a href="/logout">تسجيل خروج</a></div>
          <h1>لوحة إدارة الطلبات (الدور: ${req.session.role})</h1>

          <form method="GET" action="/admin" style="text-align:center; margin-bottom: 20px;">
            <input type="text" name="q" placeholder="بحث باسم، جوال أو كود الطلب" style="padding: 10px; width: 300px; font-size: 15px;" value="${searchQuery || ''}" />
            <button type="submit" style="padding: 10px 20px; font-size: 15px; background:#3b0a77; color:#fff; border:none; border-radius:6px;">بحث</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>رقم الجوال</th>
                <th>الجهاز</th>
                <th>السعر نقداً</th>
                <th>السعر تقسيط</th>
                <th>شهر</th>
                <th>كود الطلب</th>
                <th>تاريخ الطلب</th>
                <th>الحالة</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <script>
            async function updateStatus(id, status) {
              try {
                const res = await fetch('/order/' + id + '/status', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status })
                });
                const data = await res.json();
                alert(data.message);
              } catch (e) {
                alert('حدث خطأ أثناء تحديث الحالة');
              }
            }

            async function deleteOrder(id) {
              if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
              try {
                const res = await fetch('/order/' + id, { method: 'DELETE' });
                const data = await res.json();
                alert(data.message);
                if (res.ok) location.reload();
              } catch (e) {
                alert('حدث خطأ أثناء حذف الطلب');
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('حدث خطأ في السيرفر');
  }
});

// تحديث حالة الطلب
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لتغيير الحالة' });
  }

  const id = req.params.id;
  const { status } = req.body;

  const validStatuses = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'حالة غير صحيحة' });
  }

  try {
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    await sendDiscordLog(`[تحديث حالة] المستخدم **${req.session.username}** قام بتغيير حالة الطلب (ID: ${id}) إلى "${status}" في ${new Date().toLocaleString()}`);

    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في تحديث الحالة' });
  }
});

// حذف الطلب
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لحذف الطلب' });
  }

  const id = req.params.id;
  try {
    const result = await pool.query('DELETE FROM orders WHERE id=$1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    await sendDiscordLog(`[حذف طلب] المستخدم **${req.session.username}** حذف الطلب (ID: ${id}) في ${new Date().toLocaleString()}`);

    res.json({ message: 'تم حذف الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في حذف الطلب' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
