

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
    'mod':   { password: 'mod2004', name: 'عبد الرحمن خالد' }
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
            <button type="submit" style="padding: 10px 20px; font-size: 15px; background:#3b0a77; color:#fff; border:none; border-radius:6px;">بحث</button>
          </form>

          <table>
            <thead>
              <tr>
                <th>الاسم</th><th>رقم الجوال</th><th>الجهاز</th><th>السعر نقداً</th>
                <th>السعر تقسيط</th><th>شهر</th><th>كود الطلب</th><th>تاريخ الطلب</th>
                <th>الحالة</th><th>حذف</th>
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
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }
    await sendDiscordLog(`✅ تم تحديث حالة الطلب (ID: ${id}) إلى "${status}" بواسطة ${req.session.username}`);
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
    await sendDiscordLog(`🗑️ تم حذف الطلب (ID: ${id}) بواسطة ${req.session.username}`);
    res.json({ message: 'تم حذف الطلب بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في حذف الطلب' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


وبغا صفحة 
tak.js

<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>4 STORE - استعلام عن الطلب</title>
  <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Almarai', sans-serif;
      background: #f9f9fb url('https://www.transparenttextures.com/patterns/symphony.png');
      color: #222; padding: 20px; max-width: 400px; margin: 40px auto; direction: rtl;
    }
    h1 { color: #3b0a77; text-align: center; margin-bottom: 20px; }
    form {
      background: white; padding: 20px; border-radius: 15px;
      box-shadow: 0 6px 20px rgba(140,58,255,0.15);
    }
    label { display: block; margin: 15px 0 5px; font-weight: 700; color: #3b0a77; }
    input[type="text"], input[type="tel"] {
      width: 100%; padding: 10px; border-radius: 8px; border: 2px solid #ddd;
      font-size: 1em; box-sizing: border-box;
    }
    button {
      margin-top: 25px; width: 100%; padding: 15px;
      background: linear-gradient(90deg, #25D366, #128C7E);
      color: white; font-weight: 700; font-size: 1.2em;
      border: none; border-radius: 50px; cursor: pointer;
      transition: box-shadow 0.3s ease;
    }
    button:hover { box-shadow: 0 0 25px #25D366; }

    #trackResult {
      margin-top: 20px; padding: 20px; border-radius: 10px;
      font-weight: 700; text-align: center; display: none;
    }
    #trackResult.success {
      background: #d4edda; color: #155724; border: 1px solid #c3e6cb;
    }
    #trackResult.error {
      background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;
    }

    .loader-container {
      display: flex; flex-direction: column; align-items: center;
    }

    .loader {
      border: 6px solid #f3f3f3;
      border-top: 6px solid #25D366;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin-bottom: 10px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    footer {
      text-align: center; margin-top: 40px;
      color: #888; font-size: 0.9em;
    }

    .success-title {
      font-size: 1.2em;
      color: #155724;
      margin-bottom: 10px;
    }
  </style>
</head>
<body>

  <h1>استعلام عن الطلب</h1>

  <form id="trackForm" aria-label="نموذج استعلام">
    <label for="trackName">الاسم:</label>
    <input type="text" id="trackName" placeholder="ادخل اسمك" required />
    <label for="trackPhone">رقم الجوال:</label>
    <input type="tel" id="trackPhone" placeholder="05xxxxxxxx" required pattern="05[0-9]{8}" />
    <label for="trackCode">كود الطلب:</label>
    <input type="text" id="trackCode" placeholder="ادخل كود الطلب" required />
    <button type="submit">استعلم</button>
  </form>

  <div id="trackResult" role="alert" aria-live="polite">
    <div class="loader-container" id="loadingContainer">
      <div class="loader"></div>
      <div id="loadingText" style="margin-top: 5px;">⏳ جاري التحقق من البيانات المدخلة</div>
    </div>
    <div id="successTitle" class="success-title" style="display:none;">✅ تم الاستعلام بنجاح</div>
    <div id="resultText" style="display:none; white-space: pre-line;"></div>
  </div>

  <footer>
    جميع الحقوق محفوظة &copy; 4STORE - <span dir="ltr">2025</span>
  </footer>

<script>
  const trackForm = document.getElementById('trackForm');
  const trackResult = document.getElementById('trackResult');
  const loadingContainer = document.getElementById('loadingContainer');
  const loadingText = document.getElementById('loadingText');
  const successTitle = document.getElementById('successTitle');
  const resultText = document.getElementById('resultText');

  let dotInterval;

  function startDotsAnimation() {
    let dots = 0;
    dotInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      loadingText.textContent = '⏳ جاري التحقق من البيانات المدخلة' + '.'.repeat(dots);
    }, 500);
  }

  function stopDotsAnimation() {
    clearInterval(dotInterval);
  }

  trackForm.addEventListener('submit', e => {
    e.preventDefault();

    trackResult.style.display = 'block';
    loadingContainer.style.display = 'flex';
    successTitle.style.display = 'none';
    resultText.style.display = 'none';
    trackResult.className = '';
    startDotsAnimation();

    const name = document.getElementById('trackName').value.trim();
    const phone = document.getElementById('trackPhone').value.trim();
    const code = document.getElementById('trackCode').value.trim();

    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, code })
    })
    .then(res => res.json())
    .then(data => {
      stopDotsAnimation();
      loadingContainer.style.display = 'none';
      resultText.style.display = 'block';

      if (data.status === 'success') {
        trackResult.className = 'success';
        successTitle.style.display = 'block';
      } else {
        trackResult.className = 'error';
        successTitle.style.display = 'none';
      }

      resultText.textContent = data.message;
    })
    .catch(err => {
      stopDotsAnimation();
      loadingContainer.style.display = 'none';
      resultText.style.display = 'block';
      resultText.textContent = '❌ فشل الاتصال بالسيرفر';
      trackResult.className = 'error';
    });
  });
</script>

</body>
</html>
