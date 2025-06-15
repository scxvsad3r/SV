const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// رابط ويب هوك ديسكورد (غيرّه إلى الرابط حقك)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1382169050129502308/vvhIvYwXpnuumokS93llkK9rcIlGtZYFxXC2ckqhW-4-lfNKZuNcRTHHPxKyPf4F0Kc2';

// دالة لإرسال لوق نصي بسيط
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

// مسار استقبال الطلب الجديد من الـ frontend
app.post('/api/order', async (req, res) => {
  try {
    const {
      name,
      phone,
      device,
      cashPrice,
      installmentPrice,
      monthly,
      code  // هذا هو order_code
    } = req.body;

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
      embeds: [
        {
          title: "🔐 تسجيل دخول جديد",
          color: 0x6A0DAD,
          fields: [
            { name: "المستخدم", value: users[username].name, inline: true },
            { name: "الدور", value: username === 'admin' ? 'مشرف رئيسي' : 'مراقب', inline: true },
            { name: "الوقت", value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }), inline: false }
          ]
        }
      ]
    };
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embedLog)
    }).catch(err => console.error('Failed to send embed log:', err));

    return res.redirect('/admin');
  } else {
    await sendDiscordLog(`🚫 محاولة تسجيل دخول فاشلة باسم مستخدم: \`${username}\` في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
    return res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: **${req.session.username}** (الدور: ${req.session.role}) في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
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
        <td>
          <select data-prev="${order.status}" onchange="${req.session.role === 'admin' ? `handleStatusChange(${order.id}, this)` : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="تم التنفيذ" ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض" ${order.status === 'مرفوض' ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
        <td>${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</td>
      </tr>
    `).join('');

    res.send(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>لوحة التحكم - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet" />
        <style>
          body {
            font-family: 'Almarai', sans-serif;
            background: linear-gradient(to right, #3b0a77, #845ec2);
            color: white;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
          }
          header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
          }
          h1 {
            margin: 0;
          }
          .greeting {
            font-size: 1.2rem;
            font-weight: 600;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            color: black;
            border-radius: 8px;
            overflow: hidden;
          }
          th, td {
            padding: 12px;
            text-align: center;
            border-bottom: 1px solid #ddd;
          }
          th {
            background: #3b0a77;
            color: white;
          }
          select {
            padding: 6px;
            border-radius: 5px;
            border: 1px solid #3b0a77;
            font-weight: 600;
          }
          input[type="search"] {
            padding: 8px 12px;
            border-radius: 6px;
            border: none;
            width: 300px;
            font-size: 16px;
          }
          form.search-form {
            margin-bottom: 20px;
          }
          .logout-btn {
            background: #fff;
            color: #3b0a77;
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            text-decoration: none;
          }
          .logout-btn:hover {
            background: #845ec2;
            color: white;
          }
        </style>
      </head>
      <body>
        <header>
          <h1>لوحة التحكم</h1>
          <div>
            <span class="greeting">${req.session.greeting || ''}</span>
            <a href="/logout" class="logout-btn">تسجيل خروج</a>
          </div>
        </header>
        <form class="search-form" method="GET" action="/admin">
          <input type="search" name="q" placeholder="بحث بالاسم، رقم الجوال أو كود الطلب" value="${searchQuery || ''}" />
          <button type="submit">بحث</button>
        </form>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>رقم الجوال</th>
              <th>الجهاز</th>
              <th>سعر الكاش</th>
              <th>سعر التقسيط</th>
              <th>الدفعة الشهرية</th>
              <th>كود الطلب</th>
              <th>الحالة</th>
              <th>تاريخ الطلب</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <script>
          // دالة تتبع الحالة السابقة
          function setInitialStatusTracking() {
            const selects = document.querySelectorAll('select');
            selects.forEach(select => {
              select.setAttribute('data-prev', select.value);
            });
          }

          // عند تحميل الصفحة
          document.addEventListener('DOMContentLoaded', setInitialStatusTracking);

          // دالة تغيير الحالة
          async function handleStatusChange(id, select) {
            const status = select.value;

            if (status === 'تم التنفيذ') {
              const phone = select.parentElement.parentElement.children[1].textContent.trim();

              const message = encodeURIComponent("عميلنا العزيز، تم استلام طلبك لتمويل تقسيط الجوال عبر 4Store. لمتابعة الطلب أو استكمال الإجراءات، يرجى زيارة الرابط المرسل رسالة نصية");

              window.open(`https://wa.me/${phone}?text=${message}`, '_blank');

              // إعادة الحالة القديمة (عدم تحديث قاعدة البيانات)
              select.value = select.getAttribute('data-prev');
            } else {
              try {
                const res = await fetch('/order/' + id + '/status', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status })
                });
                const data = await res.json();
                alert(data.message);
                // تحديث الحالة السابقة
                select.setAttribute('data-prev', status);
              } catch (e) {
                alert('حدث خطأ أثناء تحديث الحالة');
              }
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error loading admin page:', err);
    res.status(500).send('خطأ في تحميل البيانات');
  }
});

// API تحديث حالة الطلب (فقط للمدير)
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لتحديث الحالة' });
  }

  const orderId = req.params.id;
  const { status } = req.body;

  if (!['قيد المراجعة', 'تم التنفيذ', 'مرفوض'].includes(status)) {
    return res.status(400).json({ message: 'حالة غير صالحة' });
  }

  try {
    const result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    await sendDiscordLog(`📝 تم تحديث حالة الطلب رقم #${orderId} إلى: ${status}`);

    res.json({ message: 'تم تحديث الحالة بنجاح' });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء تحديث الحالة' });
  }
});

// بدء الخادم
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
