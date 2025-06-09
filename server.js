const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// إعداد CORS لدعم preflight وإرسال الكوكيز
const corsOptions = {
  origin: true,               // أو حدد الدومين الأساسي بدل true
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
};
app.use(cors(corsOptions));

// إعداد تحليل الجسم
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// إعداد جلسات المستخدم
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// إعداد اتصال PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إذا لم يكن موجودًا
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
`).catch(err => console.error('Table creation error:', err));


// ======= مسارات المصادقة =======

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head> … تصميم الصفحة … </head>
      <body>
        <form method="POST" action="/login"> … </form>
      </body>
    </html>
  `);
});

// معالجة تسجيل الدخول
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'dev2008') {
    req.session.authenticated = true;
    req.session.username = 'سامر عبدالله';
    res.redirect('/admin');
  } else {
    res.redirect('/login?error=1');
  }
});

// تسجيل الخروج
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});


// ======= لوحة الإدارة =======

app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  
  try {
    const q = req.query.q;
    let result;
    if (q) {
      const search = `%${q}%`;
      result = await pool.query(
        `SELECT * FROM orders
         WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1
         ORDER BY created_at DESC`,
        [search]
      );
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }
    
    // بناء صفوف الجدول
    const rowsHtml = result.rows.map(o => `
      <tr>
        <td>${o.name}</td><td>${o.phone}</td><td>${o.device}</td>
        <td>${o.cash_price}</td><td>${o.installment_price}</td><td>${o.monthly}</td>
        <td>${o.order_code}</td>
        <td>${new Date(o.created_at).toLocaleString()}</td>
        <td>
          <select onchange="updateStatus(${o.id}, this.value)">
            <option value="قيد المراجعة" ${o.status==='قيد المراجعة'?'selected':''}>قيد المراجعة</option>
            <option value="قيد التنفيذ"  ${o.status==='قيد التنفيذ'?'selected':''}>قيد التنفيذ</option>
            <option value="تم التنفيذ"    ${o.status==='تم التنفيذ'?'selected':''}>تم التنفيذ</option>
            <option value="مرفوض"        ${o.status==='مرفوض'?'selected':''}>مرفوض</option>
          </select>
        </td>
        <td>
          <button onclick="deleteOrder(${o.id})">حذف</button>
        </td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head> … ربط الخطوط وأنماط CSS … </head>
        <body>
          <h1>طلبات iPhone</h1>
          <a href="/logout">تسجيل خروج</a>
          <form method="GET" action="/admin">
            <input name="q" placeholder="بحث…" value="${q||''}">
            <button>بحث</button>
          </form>
          <table>
            <thead> … رؤوس الأعمدة … </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <script>
            // حذف
            function deleteOrder(id) {
              if (!confirm('تأكيد الحذف؟')) return;
              fetch('/api/delete/' + id, {
                method: 'DELETE',
                credentials: 'same-origin'
              }).then(r => r.ok ? location.reload() : alert('فشل الحذف'));
            }
            // تحديث الحالة
            function updateStatus(id, status) {
              fetch('/api/status/' + id, {
                method: 'PUT',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
              })
              .then(res => {
                if (res.status === 401) {
                  alert('⚠️ الرجاء تسجيل الدخول');
                  location.href = '/login';
                } else if (!res.ok) {
                  alert('❌ فشل في تحديث الحالة');
                }
              });
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Admin error:', err);
    res.status(500).send('خطأ في جلب الطلبات');
  }
});


// ======= مسارات الـ API =======

// إضافة طلب جديد
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !code) {
    return res.status(400).json({ error: 'بيانات ناقصة' });
  }
  try {
    const exist = await pool.query(
      `SELECT 1 FROM orders WHERE phone=$1 AND order_code=$2`,
      [phone, code]
    );
    if (exist.rows.length) {
      return res.status(400).json({ error: 'الطلب موجود مسبقاً' });
    }
    await pool.query(
      `INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [name, phone, device, cashPrice, installmentPrice, monthly, code]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('Order insert error:', e);
    res.status(500).json({ error: 'خطأ في معالجة الطلب' });
  }
});

// استعلام حالة الطلب
app.post('/api/track-order', async (req, res) => {
  const { name, phone, code } = req.body;
  if (!name || !phone || !code) {
    return res.status(400).json({ success: false, error: 'بيانات ناقصة' });
  }
  try {
    const result = await pool.query(
      `SELECT status FROM orders WHERE name=$1 AND phone=$2 AND order_code=$3`,
      [name, phone, code]
    );
    if (result.rows.length) {
      return res.json({ success: true, status: result.rows[0].status });
    } else {
      return res.json({ success: false });
    }
  } catch (e) {
    console.error('Track-order error:', e);
    res.status(500).json({ success: false, error: 'خطأ في الاستعلام' });
  }
});

// حذف طلب
app.delete('/api/delete/:id', async (req, res) => {
  if (!req.session.authenticated) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await pool.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error: 'فشل في الحذف' });
  }
});

// تحديث حالة الطلب (محمي بالجلسة)
app.put('/api/status/:id', (req, res, next) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ success: true });
  } catch (e) {
    console.error('Status update error:', e);
    res.status(500).json({ error: 'فشل تحديث الحالة' });
  }
});


// تشغيل السيرفر
app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
