
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
            <option value="قيد المراجعة" ${order.status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status==='قيد التنفيذ'?'selected':''}>قيد التنفيذ</option>
            <option value="تم التنفيذ"    ${order.status==='تم التنفيذ'   ?'selected':''}>تم التنفيذ</option>
            <option value="مرفوض"        ${order.status==='مرفوض'       ?'selected':''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="${req.session.role==='admin'
            ? `deleteOrder(${order.id})`
            : `alert('ليس لديك صلاحية لحذف الطلب')`}"
            style="background:red;color:white;border:none;padding:5px 10px;border-radius:5px;">
            حذف
          </button>
          <button onclick="sendWhatsAppMessage('${order.phone}', '${order.name}', '${order.order_code}')" 
                  style="background:green;color:white;border:none;padding:5px 10px;border-radius:5px; margin-left:5px;">
            تنفيذ الطلب
          </button>
        </td>
      </tr>
    `).join('');

    const greeting = req.session.greeting || 'مرحبا بك في لوحة الإدارة!';
    res.send(`
      <html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"><title>لوحة إدارة الطلبات</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; background: #fafafa; margin: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ccc; padding: 10px; text-align: center; }
          th { background: #6a0dad; color: white; }
          select { padding: 5px; border-radius: 5px; }
          button { cursor: pointer; }
          input[type="search"] { padding: 7px 10px; font-size: 16px; width: 300px; border-radius: 7px; border: 1px solid #aaa; margin-bottom: 15px; }
          .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
          .header h1 { margin: 0; color: #6a0dad; }
          .logout { background: #d9534f; color: white; padding: 8px 15px; border: none; border-radius: 7px; text-decoration: none; }
          .logout:hover { background: #c9302c; }
        </style>
        </head>
        <body>
          <div class="header">
            <h1>لوحة إدارة الطلبات</h1>
            <a href="/logout" class="logout">تسجيل خروج</a>
          </div>
          <div>${greeting}</div>
          <form method="GET" action="/admin">
            <input type="search" name="q" placeholder="بحث بالاسم، رقم الجوال، أو كود الطلب" value="${searchQuery || ''}" />
            <button type="submit">بحث</button>
          </form>
          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>رقم الجوال</th><th>الجهاز</th><th>السعر كاش</th>
                <th>السعر بالتقسيط</th><th>القسط الشهري</th><th>كود الطلب</th><th>وقت الطلب</th>
                <th>الحالة</th><th>التحكم</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <script>
            function updateStatus(id, status) {
              fetch('/admin/status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status })
              }).then(res => res.json())
                .then(data => alert(data.message))
                .catch(() => alert('حدث خطأ أثناء تحديث الحالة'));
            }

            function deleteOrder(id) {
              if (!confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
              fetch('/admin/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
              }).then(res => res.json())
                .then(data => {
                  alert(data.message);
                  if (data.success) location.reload();
                })
                .catch(() => alert('حدث خطأ أثناء حذف الطلب'));
            }

            function sendWhatsAppMessage(phone, name, orderCode) {
              const message = \`مرحبًا \${name}، تم تنفيذ الطلب ✅
رقم الطلب: \${orderCode}
عميلنا العزيز، تم استلام طلبك لتمويل تقسيط الجوال عبر 4Store. لمتابعة الطلب أو استكمال الإجراءات، يرجى زيارة الرابط المرسل رسالة نصية\`;

              // تنظيف رقم الجوال للواتساب (يجب أن يكون بالصيغة الدولية بدون +)
              let waPhone = phone.replace(/[^0-9]/g, '');
              const url = \`https://wa.me/\${waPhone}?text=\${encodeURIComponent(message)}\`;
              window.open(url, '_blank');
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error loading admin page:', err);
    res.status(500).send('حدث خطأ في تحميل صفحة الإدارة');
  }
});

// تحديث حالة الطلب (POST)
app.post('/admin/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ message: 'غير مسموح' });
  const { id, status } = req.body;
  try {
    const updateQuery = `UPDATE orders SET status = $1 WHERE id = $2`;
    await pool.query(updateQuery, [status, id]);
    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ message: 'خطأ في تحديث الحالة' });
  }
});

// حذف الطلب (POST)
app.post('/admin/delete', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({ message: 'غير مسموح' });
  const { id } = req.body;
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    res.json({ success: true, message: 'تم حذف الطلب بنجاح' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ success: false, message: 'خطأ في حذف الطلب' });
  }
});

// بدء السيرفر
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
