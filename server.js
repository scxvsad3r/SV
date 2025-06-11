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
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1380224693490946078/pkVZhjxSuuzB5LhM3AkCQ5nYjTYvssP6JYKabKsDofvSQcljDk7Oh6Hx_joNstjwb_CL';

// دالة لإرسال لوق نصي أو Embedded
async function sendDiscordLog(payload) {
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.content ? { content: payload.content } : payload)
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

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// ===== مسار استقبال الطلب من الـ frontend =====
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

    // إرسال لوج جميل إلى ديسكورد
    await sendDiscordLog({
      embeds: [
        {
          title: "📦 طلب جديد",
          color: 0x00C853,
          fields: [
            { name: "الاسم",        value: name,                         inline: true },
            { name: "رقم الجوال",   value: phone,                        inline: true },
            { name: "الجهاز",       value: device,                       inline: true },
            { name: "كود الطلب",    value: code,                         inline: true },
            {
              name: "الوقت",
              value: new Date(order.created_at)
                       .toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }),
              inline: false
            }
          ]
        }
      ]
    });

    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error('Error in /api/order:', err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});
// =============================================

// صفحة تسجيل الدخول (GET)
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head><meta charset="UTF-8"/><title>تسجيل الدخول</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>/* ... CSS كما في السابق ... */</style>
      </head>
      <body>
        <form method="POST" action="/login" style="font-family:'Almarai',sans-serif;dir:rtl;">
          <h2>تسجيل الدخول</h2>
          ${req.query.error ? '<div style="color:red">بيانات الدخول غير صحيحة</div>' : ''}
          <input name="username" placeholder="اسم المستخدم" required />
          <input type="password" name="password" placeholder="كلمة المرور" required />
          <button>دخول</button>
        </form>
      </body>
    </html>
  `);
});

// التحقق من بيانات الدخول (POST)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const users = {
    admin: { password: 'dev2008', name: 'سامر عبدالله' },
    mod:   { password: 'mod2004', name: 'عبد الرحمن خالد' }
  };

  if (users[username] && users[username].password === password) {
    req.session.authenticated = true;
    req.session.username = users[username].name;
    req.session.role = username;
    const firstName = users[username].name.split(' ')[0];
    req.session.greeting = username === 'admin'
      ? `مربحاً ${firstName}! 😀`
      : `مرحبا ${firstName}! 👋`;

    // سجل الدخول بـ Embed
    await sendDiscordLog({
      embeds: [
        {
          title: "🔐 تسجيل دخول",
          color: 0x6A0DAD,
          fields: [
            { name: "المستخدم", value: users[username].name, inline: true },
            { name: "الدور",      value: username === 'admin' ? 'مشرف رئيسي' : 'مراقب', inline: true },
            { name: "الوقت",      value: new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' }) }
          ]
        }
      ]
    });

    return res.redirect('/admin');
  } else {
    await sendDiscordLog({ content: `🚫 محاولة تسجيل دخول فاشلة باسم: \`${username}\`` });
    return res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', async (req, res) => {
  if (req.session.authenticated) {
    await sendDiscordLog({ content:
      `🔓 تسجيل خروج: **${req.session.username}** (الدور: ${req.session.role})` 
    });
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
    const search = req.query.q
      ? [`%${req.query.q}%`]
      : [];
    const sql = search.length
      ? `SELECT * FROM orders WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1 ORDER BY created_at DESC`
      : `SELECT * FROM orders ORDER BY created_at DESC`;
    const result = await pool.query(sql, search);
    const rows = result.rows.map(o => `
      <tr>
        <td>${o.name}</td><td>${o.phone}</td><td>${o.device}</td>
        <td>${o.cash_price}</td><td>${o.installment_price}</td><td>${o.monthly}</td>
        <td>${o.order_code}</td>
        <td>${new Date(o.created_at).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})}</td>
        <td>
          <select onchange="${req.session.role==='admin'
            ? `updateStatus(${o.id},this.value)`
            : `alert('ليس لديك صلاحية')`}">
            ${['قيد المراجعة','قيد التنفيذ','تم التنفيذ','مرفوض']
              .map(s => `<option value="${s}"${o.status===s?' selected':''}>${s}</option>`)
              .join('')}
          </select>
        </td>
        <td>
          <button onclick="${req.session.role==='admin'
            ? `deleteOrder(${o.id})`
            : `alert('ليس لديك صلاحية')`}"
            style="background:red;color:white;padding:5px;border:none;border-radius:5px;">
            حذف
          </button>
        </td>
      </tr>
    `).join('');

    const greeting = req.session.greeting || 'مرحبا بك!';
    res.send(`
      <html lang="ar" dir="rtl">
        <head><meta charset="UTF-8"/><title>لوحة الإدارة</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
          <style>/* ... CSS كما في السابق ... */</style>
        </head>
        <body>
          <div><a href="/logout">تسجيل خروج</a></div>
          <h1>${greeting}</h1>
          <h2>لوحة إدارة الطلبات (الدور: ${req.session.role})</h2>
          <form method="GET" action="/admin" style="text-align:center;">
            <input name="q" placeholder="بحث" value="${req.query.q||''}" />
            <button>بحث</button>
          </form>
          <table border="1" cellpadding="10" cellspacing="0" style="width:100%;text-align:center;">
            <thead>
              <tr>
                <th>الاسم</th><th>جوال</th><th>جهاز</th><th>سعر كاش</th>
                <th>سعر تقسيط</th><th>شهر</th><th>كود</th><th>تاريخ</th><th>الحالة</th><th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>
            async function updateStatus(id,status){
              const res = await fetch('/order/'+id+'/status',{method:'PUT',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({status})});
              alert((await res.json()).message);
            }
            async function deleteOrder(id){
              if(!confirm('تأكيد الحذف؟'))return;
              const res=await fetch('/order/'+id,{method:'DELETE'});
              alert((await res.json()).message);
              if(res.ok)location.reload();
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('خطأ في السيرفر');
  }
});

// تحديث حالة الطلب
app.put('/order/:id/status', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({message:'ليس لديك صلاحية'});
  const { id } = req.params, { status } = req.body;
  const valid = ['قيد المراجعة','قيد التنفيذ','تم التنفيذ','مرفوض'];
  if (!valid.includes(status)) return res.status(400).json({message:'حالة غير صحيحة'});
  try {
    const result = await pool.query(
      'UPDATE orders SET status=$1 WHERE id=$2 RETURNING *',
      [status, id]
    );
    if (!result.rowCount) return res.status(404).json({message:'الطلب غير موجود'});
    await sendDiscordLog({ content:`✅ تم تغيير الحالة (ID:${id}) إلى "${status}" بواسطة ${req.session.username}` });
    res.json({message:'تم تحديث الحالة'});
  } catch (err) {
    console.error(err);
    res.status(500).json({message:'خطأ في السيرفر'});
  }
});

// حذف الطلب
app.delete('/order/:id', requireAuth, async (req, res) => {
  if (req.session.role !== 'admin') return res.status(403).json({message:'ليس لديك صلاحية'});
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM orders WHERE id=$1', [id]);
    if (!result.rowCount) return res.status(404).json({message:'الطلب غير موجود'});
    await sendDiscordLog({ content:`🗑️ تم حذف الطلب (ID:${id}) بواسطة ${req.session.username}` });
    res.json({message:'تم حذف الطلب'});
  } catch (err) {
    console.error(err);
    res.status(500).json({message:'خطأ في السيرفر'});
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
