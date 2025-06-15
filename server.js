// server.js
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
// --- بعد app.use(session(...)) ---

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

    // تحقق سريع من البيانات
    if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
      return res.status(400).json({ message: 'بيانات الطلب غير كاملة' });
    }

    // إدخال الطلب في جدول orders
    const insertQuery = `
      INSERT INTO orders
        (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `;
    const values = [name, phone, device, cashPrice, installmentPrice, monthly, code];

    const result = await pool.query(insertQuery, values);
    const order = result.rows[0];

    // إرسال لوج إلى ديسكورد
    await sendDiscordLog(`📦 طلب جديد  
• الاسم: **${name}**  
• جوال: **${phone}**  
• جهاز: **${device}**  
• كود الطلب: **${code}**  
• الوقت: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

    // إرجاع نجاح
    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error('Error in /api/order:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});

// --- بعدها تبقى باقي تعريفات المسارات (login, admin, order/:id, الخ.) ---
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
    // مصادقة ناجحة
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;

    // إنشاء رسالة الترحيب حسب الدور
    const firstName = users[username].name.split(' ')[0];
    req.session.greeting = username === 'admin'
      ? `مربحاً ${firstName}! 😀`
      : `مرحبا ${firstName}! 👋`;

    // إرسال Embed Log إلى ديسكورد
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
    // محاولة فاشلة
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

    // بناء صفوف الجدول
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
          <select onchange="${req.session.role === 'admin' ? `updateStatus(${order.id}, this.value)` : `alert('ليس لديك صلاحية لتغيير الحالة')`}">
            <option value="قيد المراجعة" ${order.status === 'قيد المراجعة' ? 'selected' : ''}>قيد المراجعة</option>
            <option value="قيد التنفيذ" ${order.status === 'قيد التنفيذ' ? 'selected' : ''}>قيد التنفيذ</option>
            <option value="تم التنفيذ"    ${order.status === 'تم التنفيذ'    ? 'selected' : ''}>تم التنفيذ</option>
            <option value="مرفوض"        ${order.status === 'مرفوض'        ? 'selected' : ''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="${req.session.role === 'admin' ? `deleteOrder(${order.id})` : `alert('ليس لديك صلاحية لحذف الطلب')`}"
                  style="background:red; color:white; border:none; padding:5px 10px; border-radius:5px;">
            حذف
          </button>
        </td>
      </tr>
    `).join('');

    // قراءة رسالة الترحيب من الجلسة
    const greeting = req.session.greeting || 'مرحبا بك في لوحة الإدارة!';

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Almarai', sans-serif; margin: 0; padding: 30px; background: #f5f7fa; color: #333; direction: rtl; }
            h1 { text-align: center; color: #3b0a77; margin-bottom: 10px; }
            h2 { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1); }
            th, td { padding: 15px; text-align: center; border-bottom: 1px solid #eee; font-size: 15px; }
            th { background-color: #3b0a77; color: white; }
            button { padding: 5px 10px; font-size: 14px; border: none; border-radius: 6px; cursor: pointer; }
            .logout-link { text-align: center; margin-bottom: 15px; }
            .logout-link a { color: #3b0a77; text-decoration: none; font-size: 15px; }
          </style>
        </head>
        <body>
          <div class="logout-link"><a href="/logout">تسجيل خروج</a></div>
          <h1>${greeting}</h1>
          <h2>لوحة إدارة الطلبات (الدور: ${req.session.role})</h2>

          <form method="GET" action="/admin" style="text-align:center; margin-bottom: 20px;">
            <input type="text" name="q" placeholder="بحث باسم، جوال أو كود الطلب"
                   style="padding: 10px; width: 300px; font-size: 15px;" value="${searchQuery || ''}" />
            <button type="submit" style="padding: 10px 20px; background: #3b0a77; color: white; border: none; border-radius: 6px;">بحث</button>
            <button type="button" onclick="window.location='/admin'" style="padding: 10px 20px; margin-right:10px; border-radius:6px;">عرض الكل</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>جوال</th><th>الجهاز</th><th>سعر الكاش</th><th>سعر التقسيط</th><th>الشهرية</th><th>كود الطلب</th><th>تاريخ الطلب</th><th>الحالة</th><th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <script>
            async function updateStatus(orderId, newStatus) {
              if (!confirm('هل أنت متأكد من تغيير حالة الطلب؟')) return;

              const res = await fetch('/api/order/' + orderId + '/status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
              });
              const data = await res.json();
              if (res.ok) {
                alert('تم تحديث الحالة بنجاح');
                location.reload();
              } else {
                alert('فشل تحديث الحالة: ' + data.message);
              }
            }

            async function deleteOrder(orderId) {
              if (!confirm('هل أنت متأكد من حذف الطلب؟ هذا الإجراء لا يمكن التراجع عنه!')) return;

              const res = await fetch('/api/order/' + orderId, {
                method: 'DELETE'
              });
              const data = await res.json();
              if (res.ok) {
                alert('تم حذف الطلب بنجاح');
                location.reload();
              } else {
                alert('فشل حذف الطلب: ' + data.message);
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error in /admin:', err);
    res.status(500).send('حدث خطأ أثناء جلب الطلبات');
  }
});

// تحديث حالة الطلب (تغيير الحالة) - فقط للـ admin
app.put('/api/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لتغيير حالة الطلب' });
  }

  const orderId = req.params.id;
  const { status } = req.body;

  const validStatuses = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ message: 'حالة غير صحيحة' });
  }

  try {
    const updateResult = await pool.query('UPDATE orders SET status = $1 WHERE id = $2 RETURNING *', [status, orderId]);
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    // إرسال لوج إلى ديسكورد
    await sendDiscordLog(`✏️ تم تغيير حالة الطلب رقم #${orderId} إلى "${status}" بواسطة ${req.session.username}`);

    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء تحديث الحالة' });
  }
});

// حذف طلب - فقط admin
app.delete('/api/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لحذف الطلب' });
  }

  const orderId = req.params.id;
  try {
    const deleteResult = await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    // إرسال لوج إلى ديسكورد
    await sendDiscordLog(`🗑️ تم حذف الطلب رقم #${orderId} بواسطة ${req.session.username}`);

    res.json({ message: 'تم حذف الطلب بنجاح' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء حذف الطلب' });
  }
});

// استعراض تفاصيل طلب حسب رقم
app.get('/order/:id', requireAuth, async (req, res) => {
  const orderId = req.params.id;

  try {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (result.rows.length === 0) {
      return res.status(404).send('الطلب غير موجود');
    }

    const order = result.rows[0];

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>تفاصيل الطلب #${orderId}</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet" />
          <style>
            body { font-family: 'Almarai', sans-serif; margin: 40px; background: #f9f9f9; color: #333; }
            .container { background: white; padding: 30px; border-radius: 12px; max-width: 600px; margin: auto; box-shadow: 0 10px 30px rgba(0,0,0,0.1);}
            h1 { color: #3b0a77; margin-bottom: 20px; }
            p { font-size: 18px; margin: 8px 0; }
            a { display: inline-block; margin-top: 20px; text-decoration: none; color: #3b0a77; font-weight: bold; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>تفاصيل الطلب رقم #${orderId}</h1>
            <p><strong>الاسم:</strong> ${order.name}</p>
            <p><strong>جوال:</strong> ${order.phone}</p>
            <p><strong>الجهاز:</strong> ${order.device}</p>
            <p><strong>سعر الكاش:</strong> ${order.cash_price} ريال</p>
            <p><strong>سعر التقسيط:</strong> ${order.installment_price} ريال</p>
            <p><strong>الشهرية:</strong> ${order.monthly} ريال</p>
            <p><strong>كود الطلب:</strong> ${order.order_code}</p>
            <p><strong>الحالة:</strong> ${order.status}</p>
            <p><strong>تاريخ الطلب:</strong> ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}</p>

            <a href="/admin">العودة للوحة الإدارة</a>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error fetching order:', err);
    res.status(500).send('حدث خطأ أثناء جلب تفاصيل الطلب');
  }
});

// بداية تشغيل السيرفر
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
