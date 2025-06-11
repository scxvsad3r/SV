const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const port = process.env.PORT || 3000;

// ✅ رابط Webhook خاص بديسكورد
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/xxxxxxxxxxxxxxxx';

// ✅ إعداد الاتصال بقاعدة PostgreSQL (Railway)
const pool = new Pool({
  connectionString: 'postgresql://postgres:xxx@xxx.rwlwy.net:xxxxx/railway',
  ssl: { rejectUnauthorized: false }
});

// ✅ إنشاء جدول الطلبات إذا لم يكن موجودًا
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
`).catch(console.error);

// ✅ وسطيات
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// ✅ دالة إرسال إلى Discord
async function sendDiscordLog(message) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('Discord error:', err);
  }
}

// ✅ إرسال Embed Log
async function sendEmbed(embed) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });
  } catch (err) {
    console.error('Discord Embed Error:', err);
  }
}

// ✅ استقبال الطلب من الواجهة
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code)
    return res.status(400).json({ message: 'بيانات الطلب ناقصة' });

  try {
    const result = await pool.query(`
      INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at
    `, [name, phone, device, cashPrice, installmentPrice, monthly, code]);

    await sendDiscordLog(`📦 طلب جديد:
• الاسم: **${name}**
• الجوال: **${phone}**
• الجهاز: **${device}**
• كود الطلب: **${code}**`);

    res.status(201).json({ message: 'تم إرسال الطلب بنجاح', orderId: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ داخلي في السيرفر' });
  }
});

// ✅ استعلام عن الطلب
app.post('/api/track', async (req, res) => {
  const { name, phone, code } = req.body;
  if (!name || !phone || !code)
    return res.status(400).json({ message: 'البيانات ناقصة' });

  try {
    const result = await pool.query(
      'SELECT created_at, status FROM orders WHERE name=$1 AND phone=$2 AND order_code=$3',
      [name.trim(), phone.trim(), code.trim()]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ message: '🚫 لا يوجد طلب مطابق للمعلومات المدخلة.' });

    const order = result.rows[0];
    const elapsed = Date.now() - new Date(order.created_at).getTime();
    let status = order.status;

    if (status === 'قيد المراجعة') {
      if (elapsed >= 4 * 3600000) status = 'تم التنفيذ';
      else if (elapsed >= 3 * 3600000) status = 'تم فتح الطلب';
      else if (elapsed >= 2 * 3600000) status = 'قيد التنفيذ';
    }

    res.json({ message: `مرحباً: ${name}،\n\nحالة طلبك : ${status}`, status: 'success' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'حدث خطأ أثناء الاستعلام' });
  }
});

// ✅ صفحة تسجيل الدخول (GET)
app.get('/login', (req, res) => {
  res.send(/* صفحة تسجيل دخول HTML كما في الكود السابق */);
});

// ✅ POST لتسجيل الدخول
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = {
    admin: { password: 'dev2008', name: 'سامر عبدالله' },
    mod: { password: 'mod2004', name: 'عبد الرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;

    const embed = {
      embeds: [
        {
          title: "🔐 تسجيل دخول",
          color: 0x6A0DAD,
          fields: [
            { name: "المستخدم", value: users[username].name, inline: true },
            { name: "الدور", value: username, inline: true },
            { name: "الوقت", value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }) }
          ]
        }
      ]
    };
    await sendEmbed(embed);
    return res.redirect('/admin');
  }

  await sendDiscordLog(`🚫 محاولة دخول فاشلة باسم: \`${username}\``);
  res.redirect('/login?error=1');
});

// ✅ تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog(`🔓 خروج: ${req.session.username}`);
  }
  req.session.destroy(() => res.redirect('/login'));
});

// ✅ حماية المسارات
function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.redirect('/login');
}

// ✅ لوحة الإدارة
app.get('/admin', requireAuth, async (req, res) => {
  // كما في كودك الأصلي تمامًا (عرض الطلبات + البحث + صلاحيات)
});

// ✅ تحديث حالة الطلب
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ message: 'لا تملك صلاحية' });

  const { status } = req.body;
  const valid = ['قيد المراجعة', 'قيد التنفيذ', 'تم التنفيذ', 'مرفوض'];
  if (!valid.includes(status))
    return res.status(400).json({ message: 'حالة غير صالحة' });

  try {
    const result = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
    if (result.rowCount === 0)
      return res.status(404).json({ message: 'الطلب غير موجود' });

    await sendDiscordLog(`📝 تم تغيير حالة الطلب ${req.params.id} إلى ${status}`);
    res.json({ message: 'تم التحديث بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'خطأ في التحديث' });
  }
});

// ✅ حذف الطلب
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin')
    return res.status(403).json({ message: 'لا تملك صلاحية' });

  try {
    const result = await pool.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    if (result.rowCount === 0)
      return res.status(404).json({ message: 'الطلب غير موجود' });

    await sendDiscordLog(`🗑️ تم حذف الطلب ${req.params.id}`);
    res.json({ message: 'تم الحذف بنجاح' });
  } catch (err) {
    res.status(500).json({ message: 'فشل الحذف' });
  }
});

// ✅ تشغيل السيرفر
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
