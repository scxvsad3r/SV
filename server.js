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

// رابط ويب هوك ديسكورد (غيرّه إلى رابطك)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1384119260065824830/sC9L05k6gYr901RAzhAT2c6HWbtjE9X6D1UqucqyWFSFIltPZUhIHCmDdyINAfAHkh8c';

// دالة لإرسال رسالة نصية للديسكورد
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

// خدمة الملفات الثابتة (vd.html وغيرها في مجلد public)
app.use(express.static(path.join(__dirname, 'public')));

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

// مسار استلام طلب جديد
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
      <head><meta charset="UTF-8"><title>تسجيل الدخول - 4 STORE</title>
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
      embeds: [{
        title: "🔐 تسجيل دخول جديد",
        color: 0x6A0DAD,
        fields: [
          { name: "المستخدم", value: users[username].name, inline: true },
          { name: "الدور",     value: username === 'admin' ? 'مشرف رئيسي' : 'مراقب', inline: true },
          { name: "الوقت",     value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }), inline: false }
        ]
      }]
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

// دالة لتطهير نص للاستخدام داخل HTML/JS (لتفادي مشاكل الاقتباس)
function escapeForJs(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
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
      result = await pool.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 100`);
    }

    const orders = result.rows;

    // HTML صفحة الادمن مع جدول الطلبات وزر تغيير الحالة
    res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>لوحة التحكم - 4 STORE</title>
      <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet" />
      <style>
        body { font-family: 'Almarai', sans-serif; background: #fafafa; margin:0; padding:20px; }
        h1 { color: #6a0dad; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
        th { background: #6a0dad; color: white; }
        select { padding: 6px; border-radius: 5px; border: 1px solid #ccc; }
        .logout { float: left; margin-bottom: 15px; }
        input[type="search"] {
          padding: 6px;
          width: 250px;
          border-radius: 6px;
          border: 1px solid #aaa;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <a href="/logout" class="logout">تسجيل خروج</a>
      <h1>مرحباً ${req.session.greeting}</h1>
      <form method="GET" action="/admin">
        <input type="search" name="q" placeholder="ابحث بالاسم، جوال، كود الطلب..." value="${searchQuery || ''}" />
        <button type="submit">بحث</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>الرقم</th>
            <th>الاسم</th>
            <th>الجوال</th>
            <th>الجهاز</th>
            <th>سعر الكاش</th>
            <th>السعر بالتقسيط</th>
            <th>الدفعة الشهرية</th>
            <th>كود الطلب</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(order => {
            // تطهير القيم لتفادي مشاكل HTML/JS
            const safeName = escapeForJs(order.name);
            const safePhone = escapeForJs(order.phone);
            const safeCode = escapeForJs(order.order_code);
            return `
              <tr>
                <td>${order.id}</td>
                <td>${order.name}</td>
                <td>${order.phone}</td>
                <td>${order.device}</td>
                <td>${order.cash_price}</td>
                <td>${order.installment_price}</td>
                <td>${order.monthly}</td>
                <td>${order.order_code}</td>
                <td>
                  <select onchange="${req.session.role === 'admin' 
                    ? `updateStatus(${order.id}, this.value, '${safeName}', '${safePhone}', '${safeCode}')`
                    : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
                    <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
                    <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
                    <option value="تم التنفيذ" ${order.status === 'تم التنفيذ' ? 'selected' : ''}>تم التنفيذ</option>
                  </select>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <script>
        async function updateStatus(id, status, name, phone, code) {
          if (status === 'تم التنفيذ') {
            const message = \`مرحبًا \${name}، تم تنفيذ الطلب ✅\\nرقم الطلب: \${code}\\nعميلنا العزيز، تم استلام طلبك لتمويل تقسيط الجوال عبر 4Store. لمتابعة الطلب أو استكمال الإجراءات، يرجى زيارة الرابط المرسل برسالة نصية.\`;
            const phoneFormatted = phone.startsWith('0') ? '966' + phone.slice(1) : phone;
            const whatsappUrl = \`https://wa.me/\${phoneFormatted}?text=\${encodeURIComponent(message)}\`;
            window.open(whatsappUrl, '_blank');
            return; // لا تحدث تعديل في قاعدة البيانات
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
      </script>
    </body>
    </html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في جلب الطلبات');
  }
});

// تحديث حالة الطلب (في قاعدة البيانات)
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'غير مصرح لك بتغيير الحالة' });
  }
  const id = req.params.id;
  const { status } = req.body;

  if (!['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ'].includes(status)) {
    return res.status(400).json({ message: 'حالة غير صالحة' });
  }

  try {
    const result = await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }
    await sendDiscordLog(`✏️ تم تغيير حالة الطلب رقم #${id} إلى "${status}" بواسطة ${req.session.username}`);

    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في تحديث الحالة' });
  }
});

// صفحة vd.html لطلب العميل (ثابتة ضمن مجلد public)

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
