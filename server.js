const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const fetch = require('node-fetch');

const app = express();
const port = 3000;

// PostgreSQL connection
const pool = new Pool({
  connectionString: 'postgresql://postgres:OESSTSEDkYaSrecZjjNqVwEVscWxPnZT@interchange.proxy.rlwy.net:34758/railway',
});

// Webhook Discord
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/xxxx/xxxxxxxxxx'; // ضع رابط الويب هوك هنا

async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.error('فشل إرسال إشعار إلى Discord:', err);
  }
}

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
}));

// التحقق من الجلسة
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/login" style="text-align:center; margin-top:100px;">
      <h2>تسجيل الدخول</h2>
      <input type="text" name="username" placeholder="اسم المستخدم" required/><br/>
      <input type="password" name="password" placeholder="كلمة المرور" required/><br/>
      <button type="submit">دخول</button>
    </form>
  `);
});

// التحقق من بيانات تسجيل الدخول
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const users = {
    admin: { password: 'admin123', role: 'admin' },
    mod: { password: 'mod123', role: 'mod' },
  };

  const user = users[username];

  if (user && user.password === password) {
    req.session.loggedIn = true;
    req.session.username = username;
    req.session.role = user.role;

    await sendDiscordLog(`🔐 تم تسجيل دخول **${username}** (الصلاحية: ${user.role})`);
    res.redirect('/admin');
  } else {
    res.send('بيانات الدخول غير صحيحة');
  }
});

// تسجيل الخروج
app.get('/logout', requireAuth, async (req, res) => {
  const username = req.session.username;
  await sendDiscordLog(`🚪 تم تسجيل خروج **${username}**`);
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// لوحة الإدارة (عرض الطلبات)
app.get('/admin', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM orders ORDER BY id DESC');
  const orders = result.rows;

  let html = `<h2>مرحبا ${req.session.username} (${req.session.role})</h2>`;
  html += `<a href="/logout">تسجيل الخروج</a><br><br>`;

  html += `
    <table border="1" cellspacing="0" cellpadding="8">
      <tr>
        <th>ID</th>
        <th>الاسم</th>
        <th>رقم الجوال</th>
        <th>الحالة</th>
        <th>تغيير الحالة</th>
      </tr>
  `;

  for (const order of orders) {
    html += `
      <tr>
        <td>${order.id}</td>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.status}</td>
        <td>
          ${
            req.session.role === 'admin'
              ? `
            <select onchange="updateStatus(${order.id}, this.value)">
              <option value="">اختر</option>
              <option value="قيد المراجعة">قيد المراجعة</option>
              <option value="قيد التنفيذ">قيد التنفيذ</option>
              <option value="تم التنفيذ">تم التنفيذ</option>
              <option value="مرفوض">مرفوض</option>
            </select>
          `
              : `<button onclick="alert('ليس لديك صلاحية')">تغيير</button>`
          }
        </td>
      </tr>
    `;
  }

  html += `</table>`;

  html += `
    <script>
      async function updateStatus(id, status) {
        if (!status) return;
        const res = await fetch('/order/' + id + '/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
        });
        const data = await res.json();
        alert(data.message);
        location.reload();
      }
    </script>
  `;

  res.send(html);
});

// ✅ تحديث حالة الطلب (ADMIN فقط)
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ message: 'ليس لديك صلاحية لتغيير الحالة' });
  }

  const id = parseInt(req.params.id);
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

    await sendDiscordLog(`✅ تم تحديث حالة الطلب  
• ID: ${id}  
• الحالة الجديدة: **${status}**  
• بواسطة: **${req.session.username}**  
• الوقت: ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);

    res.json({ message: 'تم تحديث حالة الطلب بنجاح' });
  } catch (err) {
    console.error('❌ خطأ أثناء تحديث الحالة:', err);
    res.status(500).json({ message: 'خطأ في تحديث الحالة' });
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
