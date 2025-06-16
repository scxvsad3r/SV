// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// رابط ويب هوك ديسكورد (غيرّه لرابطك)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1384119260065824830/sC9L05k6gYr901RAzhAT2c6HWbtjE9X6D1UqucqyWFSFIltPZUhIHCmDdyINAfAHkh8c';

// دالة إرسال رسالة للديسكورد
async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.error('Failed to send Discord log:', err);
  }
}

// إعداد اتصال قاعدة البيانات PostgreSQL
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
`).catch(err => console.error('Error creating table:', err));

// إعدادات Express ومتوسطات
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true },
}));
app.use(express.static(path.join(__dirname, 'public')));

// مسار تسجيل طلب جديد
app.post('/api/order', async (req, res) => {
  try {
    const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
    if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
      return res.status(400).json({ message: 'بيانات الطلب غير كاملة' });
    }
    const insertQuery = `
      INSERT INTO orders
        (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;
    const values = [name, phone, device, cashPrice, installmentPrice, monthly, code];
    const result = await pool.query(insertQuery, values);
    const order = result.rows[0];

    await sendDiscordLog(`📦 طلب جديد  
• الاسم: **${name}**  
• جوال: **${phone}**  
• جهاز: **${device}**  
• كود الطلب: **${code}**  
• الوقت: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error('Error in /api/order:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});

// صفحة تسجيل الدخول (GET)
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Almarai', sans-serif;
            background: linear-gradient(to right, #3b0a77, #845ec2);
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .login-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            width: 350px;
            text-align: center;
          }
          h2 {
            margin-bottom: 25px;
            color: #3b0a77;
          }
          input, button {
            width: 100%;
            padding: 12px;
            margin-bottom: 15px;
            border-radius: 6px;
            font-size: 15px;
          }
          input {
            border: 1px solid #ccc;
          }
          button {
            background: #3b0a77;
            color: white;
            border: none;
            cursor: pointer;
          }
          button:hover {
            background: #5a22a1;
          }
          .error {
            color: red;
            margin-bottom: 10px;
            font-size: 14px;
          }
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
    'mod':   { password: 'mod2001', name: 'عبدالرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    const firstName = users[username].name.split(' ')[0];
    req.session.greeting = username === 'admin'
      ? `مربحاً ${firstName}! 😀`
      : `مرحبا ${firstName}! 👋`;

    const embedLog = {
      embeds: [{
        title: "🔐 تسجيل دخول جديد",
        color: 0x6A0DAD,
        fields: [
          { name: "المستخدم", value: users[username].name, inline: true },
          { name: "الدور", value: username === 'admin' ? 'مشرف رئيسي' : 'مراقب', inline: true },
          { name: "الوقت", value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }), inline: false }
        ]
      }]
    };
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedLog),
    }).catch(err => console.error('Failed to send embed log:', err));

    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة تسجيل دخول فاشلة باسم مستخدم: \`${username}\` في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
    return res.redirect('/login?error=1');
  }
});

// تسجيل خروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: **${req.session.username}** (الدور: ${req.session.role}) في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
  }
  req.session.destroy(() => res.redirect('/login'));
});

// حماية المسارات
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// لوحة الإدارة
app.get('/admin', requireAuth, async (req, res) => {
  try {
    const searchQuery = req.query.q;
    let result;
    if (searchQuery) {
      const search = `%${searchQuery}%`;
      result = await pool.query(
        `SELECT * FROM orders WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1 ORDER BY created_at DESC`,
        [search]
      );
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }

    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td><td>${order.phone}</td><td>${order.device}</td>
        <td>${order.cash_price}</td><td>${order.installment_price}</td><td>${order.monthly}</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</td>
        <td>
          <select onchange="${req.session.role === 'admin'
            ? `updateStatus(${order.id}, this.value)`
            : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option value="تم التنفيذ" ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض" ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="${req.session.role === 'admin'
            ? `deleteOrder(${order.id})`
            : `alert('ليس لديك صلاحية لحذف الطلب')`}"
            style="background:red;color:white;border:none;padding:5px 10px;border-radius:5px;">
            حذف
          </button>
        </td>
      </tr>
    `).join('');

    const greeting = req.session.greeting || 'مرحبا بك في لوحة الإدارة!';
    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8">
          <title>لوحة إدارة الطلبات</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Almarai', sans-serif;
              margin: 0; padding: 30px;
              background: #f5f7fa; color: #333;
              direction: rtl;
            }
            h1, h2 {
              text-align: center;
              color: #3b0a77;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background: #fff;
              border-radius: 10px;
              box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            }
            th, td {
              padding: 15px;
              text-align: center;
              border-bottom: 1px solid #eee;
              font-size: 15px;
            }
            th {
              background: #3b0a77;
              color: #fff;
            }
            button {
              padding: 5px 10px;
              font-size: 14px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }
            .logout-link {
              text-align: center;
              margin-bottom: 15px;
            }
            .logout-link a {
              color: #3b0a77;
              text-decoration: none;
              font-size: 15px;
            }
          </style>
        </head>
        <body>
          <div class="logout-link"><a href="/logout">تسجيل خروج</a></div>
          <h1>${greeting}</h1>
          <h2>لوحة إدارة الطلبات (الدور: ${req.session.role})</h2>
          <form method="GET" action="/admin" style="text-align:center; margin-bottom:20px;">
            <input name="q" type="search" placeholder="ابحث بالاسم، الجوال، أو كود الطلب" value="${searchQuery || ''}" style="width: 300px; padding: 8px; border-radius: 6px; border: 1px solid #ccc;" />
            <button type="submit" style="padding: 8px 16px; background: #3b0a77; color: white; border: none; border-radius: 6px;">بحث</button>
          </form>
          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>الجوال</th><th>الجهاز</th>
                <th>السعر الكاش</th><th>السعر بالتقسيط</th><th>القسط الشهري</th>
                <th>كود الطلب</th><th>تاريخ الطلب</th><th>الحالة</th><th>حذف</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <script>
            async function updateStatus(id, status) {
              if (status === 'قيد التنفيذ') {
                alert('ليس لديك صلاحية لتغيير الحالة إلى قيد التنفيذ');
                location.reload();
                return;
              }
              if (!confirm('هل أنت متأكد من تغيير حالة الطلب إلى "' + status + '"؟')) {
                location.reload();
                return;
              }
              try {
                const res = await fetch('/order/' + id + '/status', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status })
                });
                const data = await res.json();
                alert(data.message);
                location.reload();
              } catch {
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
              } catch {
                alert('حدث خطأ أثناء حذف الطلب');
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error loading admin page:', err);
    res.status(500).send('خطأ في تحميل الصفحة');
  }
});

// تحديث حالة الطلب (PUT)
app.put('/order/:id/status', requireAuth, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;

  const validStatuses = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'حالة غير صالحة' });
  }

  try {
    // يمكن تقييد تعديل الحالة فقط للمشرف الأساسي:
    if (req.session.role !== 'admin' && status !== 'قيد المراجعة' && status !== 'مرفوض') {
      return res.status(403).json({ message: 'ليس لديك صلاحية لتغيير هذه الحالة' });
    }

    const update = await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, id]);

    await sendDiscordLog(`📋 تم تغيير حالة الطلب #${id} إلى "${status}" بواسطة ${req.session.username}`);

    res.json({ message: 'تم تحديث الحالة بنجاح' });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث الحالة' });
  }
});

// حذف طلب (DELETE)
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية حذف الطلبات' });
  }
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM orders WHERE id=$1', [id]);
    await sendDiscordLog(`🗑️ تم حذف الطلب #${id} بواسطة ${req.session.username}`);
    res.json({ message: 'تم حذف الطلب بنجاح' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء حذف الطلب' });
  }
});

app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
