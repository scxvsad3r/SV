
// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1382169050129502308/vvhIvYwXpnuumokS93llkK9rcIlGtZYFxXC2ckqhW-4-lfNKZuNcRTHHPxKyPf4F0Kc2';

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
`).catch(err => console.error('Error creating table:', err));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

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

app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 تسجيل خروج: **${req.session.username}** (الدور: ${req.session.role}) في ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

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
        <td>${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</td>
        <td>
          <select id="status-select-${order.id}" onchange="${req.session.role === 'admin' ? `updateStatus(${order.id}, this.value, '${order.phone}', '${order.name}')` : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option value="تم التنفيذ"    ${order.status === 'تم التنفيذ'    ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض"        ${order.status === 'مرفوض'        ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <title>لوحة الإدارة - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet" />
        <style>
          body { font-family: 'Almarai', sans-serif; background: #fafafa; padding: 20px; }
          h1 { color: #3b0a77; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: center; }
          th { background-color: #6a0dad; color: white; }
          select { padding: 5px; font-size: 14px; border-radius: 4px; border: 1px solid #ccc; }
          .logout { float: left; margin-top: -40px; }
          .search { margin-bottom: 15px; }
          input[type="search"] { padding: 8px; font-size: 15px; border-radius: 6px; border: 1px solid #ccc; width: 300px; }
          button { padding: 8px 15px; background: #3b0a77; color: white; border: none; border-radius: 6px; cursor: pointer; }
          button:hover { background: #5a22a1; }
        </style>
      </head>
      <body>
        <a class="logout" href="/logout">تسجيل خروج</a>
        <h1>لوحة الإدارة - مرحباً ${req.session.greeting}</h1>

        <form class="search" method="GET" action="/admin">
          <input type="search" name="q" placeholder="ابحث باسم، جوال أو كود طلب" value="${searchQuery || ''}" />
          <button type="submit">بحث</button>
          <button type="button" onclick="window.location='/admin'">عرض الكل</button>
        </form>

        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الجوال</th>
              <th>الجهاز</th>
              <th>سعر الكاش</th>
              <th>سعر الأقساط</th>
              <th>مدة القسط (شهور)</th>
              <th>كود الطلب</th>
              <th>وقت الطلب</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>

        <script>
          async function updateStatus(id, status, phone, name) {
            if (status === 'تم التنفيذ') {
              const message = \`مرحباً \${name}، تم تنفيذ طلبك بنجاح. شكراً لتعاملك معنا في 4 STORE!\`;
              const encodedMessage = encodeURIComponent(message);
              const whatsappUrl = \`https://wa.me/\${phone.replace(/[0-9]/g, '')}?text=\${encodedMessage}\`;
              window.open(whatsappUrl, '_blank');

              // إعادة تعيين السلكت إلى "قيد التنفيذ" (الحالة السابقة)
              document.querySelector('#status-select-' + id).value = 'قيد التنفيذ';
              return; // لا ترسل تحديث للخادم
            } else {
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
          }
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error loading admin page:', err);
    res.status(500).send('حدث خطأ في الخادم');
  }
});

app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'غير مسموح لك بتغيير الحالة' });
  }
  const { id } = req.params;
  const { status } = req.body;
  if (!['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'].includes(status)) {
    return res.status(400).json({ message: 'حالة غير صحيحة' });
  }
  try {
    await pool.query('UPDATE orders SET status = $1 WHERE id = $2', [status, id]);
    await sendDiscordLog(`🔄 تم تحديث حالة الطلب رقم ${id} إلى: ${status} بواسطة ${req.session.username}`);
    res.json({ message: 'تم تحديث الحالة بنجاح' });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ message: 'حدث خطأ أثناء تحديث الحالة' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});q
