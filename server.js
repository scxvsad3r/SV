const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// إعداد CORS لدعم preflight وإرسال الكوكيز
const corsOptions = {
  origin: true,                // أو استبدل true بدومين الواجهة الأمامية
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));  // يعالج جميع طلبات preflight

// تحليل جسم الطلبات
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// إعداد الجلسات مع sameSite
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,     // في production وHTTPS جعلها true
    httpOnly: true,
    sameSite: 'lax'    // مهم لإرسال الكوكي
  }
}));

// إعداد الاتصال بقاعدة PostgreSQL
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات إن لم يكن موجوداً
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
`).catch(e => console.error('Table creation error:', e));


// ===== مسارات المصادقة =====

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
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


// ===== لوحة الإدارة =====

app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');
  try {
    const q = req.query.q || '';
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await pool.query(
        `SELECT * FROM orders
         WHERE name ILIKE $1 OR phone ILIKE $1 OR order_code ILIKE $1
         ORDER BY created_at DESC`, [like]
      );
    } else {
      result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    }

    const rowsHtml = result.rows.map(o => `
      <tr>
        <td>${o.name}</td>
        <td>${o.phone}</td>
        <td>${o.device}</td>
        <td>${o.cash_price}</td>
        <td>${o.installment_price}</td>
        <td>${o.monthly}</td>
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
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>لوحة إدارة الطلبات - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Almarai', sans-serif; margin:0; padding:30px; background:#f5f7fa; color:#333; direction:rtl; }
          h1 { text-align:center; color:#3b0a77; margin-bottom:20px; }
          .logout-link { text-align:center; margin-bottom:15px; }
          .logout-link a { color:#3b0a77; text-decoration:none; font-size:15px; }
          form.search { text-align:center; margin-bottom:20px; }
          form.search input { padding:10px; width:300px; border-radius:6px; border:1px solid #ccc; }
          form.search button { padding:10px 20px; background:#3b0a77; color:#fff; border:none; border-radius:6px; cursor:pointer; }
          .refresh-btn { display:block; margin:0 auto 20px; padding:10px 25px; background:#3b0a77; color:#fff; border:none; border-radius:6px; cursor:pointer; }
          table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; box-shadow:0 5px 20px rgba(0,0,0,0.1); }
          th, td { padding:15px; text-align:center; border-bottom:1px solid #eee; font-size:15px; }
          th { background:#3b0a77; color:#fff; }
          button { padding:5px 10px; font-size:14px; border:none; border-radius:6px; cursor:pointer; }
        </style>
      </head>
      <body>
        <h1>طلبات iPhone</h1>
        <h2 style="text-align:center; color:#5a22a1;">مرحبًا ${req.session.username}</h2>
        <div class="logout-link"><a href="/logout">🔓 تسجيل الخروج</a></div>
        <form class="search" method="GET" action="/admin">
          <input type="text" name="q" placeholder="ابحث بالاسم أو الجوال أو كود الطلب" value="${q}" />
          <button type="submit">🔍 بحث</button>
        </form>
        <button class="refresh-btn" onclick="location.href='/admin'">🔄 تحديث الطلبات</button>
        <table>
          <thead>
            <tr>
              <th>الاسم</th><th>الجوال</th><th>الجهاز</th><th>السعر كاش</th>
              <th>السعر تقسيط</th><th>القسط الشهري</th><th>كود الطلب</th>
              <th>الوقت</th><th>الحالة</th><th>حذف</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <script>
          function deleteOrder(id) {
            if (!confirm('تأكيد الحذف؟')) return;
            fetch('/api/delete/' + id, {
              method: 'DELETE',
              credentials: 'include'
            })
            .then(r => r.ok ? location.reload() : alert('❌ فشل الحذف'));
          }
          function updateStatus(id, status) {
            fetch('/api/status/' + id, {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            })
            .then(async res => {
              if (res.status === 401) {
                alert('⚠️ الرجاء تسجيل الدخول');
                return location.href = '/login';
              }
              if (!res.ok) {
                const text = await res.text();
                console.error('Server error:', res.status, text);
                throw new Error('فشل التحديث');
              }
              console.log('✅ تم تحديث الحالة');
            })
            .catch(err => {
              console.error(err);
              alert('❌ فشل في تحديث الحالة، راجع الكونسول.');
            });
          }
        </script>
      </body>
      </html>
    `);
  } catch (e) {
    console.error('Admin error:', e);
    res.status(500).send('خطأ في جلب الطلبات');
  }
});


// ===== مسارات الـ API =====

// إضافة طلب جديد
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name||!phone||!device||!code) {
    return res.status(400).json({ error:'بيانات ناقصة' });
  }
  try {
    const exist = await pool.query(
      `SELECT 1 FROM orders WHERE phone=$1 AND order_code=$2`,
      [phone, code]
    );
    if (exist.rows.length) {
      return res.status(400).json({ error:'الطلب موجود مسبقاً' });
    }
    await pool.query(
      `INSERT INTO orders (name,phone,device,cash_price,installment_price,monthly,order_code)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [name,phone,device,cashPrice,installmentPrice,monthly,code]
    );
    res.json({ success:true });
  } catch (e) {
    console.error('Order insert error:', e);
    res.status(500).json({ error:'خطأ في معالجة الطلب' });
  }
});

// استعلام حالة الطلب
app.post('/api/track-order', async (req, res) => {
  const { name, phone, code } = req.body;
  if (!name||!phone||!code) {
    return res.status(400).json({ success:false, error:'بيانات ناقصة' });
  }
  try {
    const result = await pool.query(
      `SELECT status FROM orders WHERE name=$1 AND phone=$2 AND order_code=$3`,
      [name, phone, code]
    );
    if (result.rows.length) {
      return res.json({ success:true, status:result.rows[0].status });
    } else {
      return res.json({ success:false });
    }
  } catch (e) {
    console.error('Track-order error:', e);
    res.status(500).json({ success:false, error:'خطأ في الاستعلام' });
  }
});

// حذف طلب
app.delete('/api/delete/:id', async (req, res) => {
  if (!req.session.authenticated) return res.status(401).json({ error:'Unauthorized' });
  try {
    await pool.query('DELETE FROM orders WHERE id=$1', [req.params.id]);
    res.json({ success:true });
  } catch (e) {
    console.error('Delete error:', e);
    res.status(500).json({ error:'فشل في الحذف' });
  }
});

// تحديث حالة الطلب (محمي بالجلسة)
app.put('/api/status/:id', (req, res, next) => {
  if (!req.session.authenticated) {
    return res.status(401).json({ error:'Unauthorized' });
  }
  next();
}, async (req, res) => {
  const { status } = req.body;
  try {
    await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [status, req.params.id]);
    res.json({ success:true });
  } catch (e) {
    console.error('Status update error:', e);
    res.status(500).json({ error:'فشل تحديث الحالة' });
  }
});

// تشغيل السيرفر
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
