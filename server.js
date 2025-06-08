const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// PostgreSQL
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// إعداد الجلسة: تنتهي عند إغلاق المتصفح
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // true إذا كان HTTPS
    httpOnly: true
  }
}));

// صفحة تسجيل الدخول
app.get('/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تسجيل الدخول - 4 STORE</title>
        <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
        <style>
          body {
            font-family: 'Almarai', sans-serif;
            background: linear-gradient(to right, #3b0a77, #845ec2);
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .login-box {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            text-align: center;
            width: 350px;
          }
          h2 {
            margin-bottom: 25px;
            color: #3b0a77;
          }
          input {
            width: 100%;
            padding: 12px;
            margin-bottom: 15px;
            border: 1px solid #ccc;
            border-radius: 6px;
            font-size: 15px;
          }
          button {
            width: 100%;
            padding: 12px;
            background: #3b0a77;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
          }
          button:hover {
            background: #5a22a1;
          }
          .error {
            color: red;
            margin-bottom: 10px;
            font-size: 14px;
          }
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

// التحقق من تسجيل الدخول
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

// صفحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.authenticated) return res.redirect('/login');

  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price}</td>
        <td>${order.installment_price}</td>
        <td>${order.monthly}</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString()}</td>
        <td>
          <button onclick="deleteOrder(${order.id})" style="background:red; color:white; border:none; padding:5px 10px; border-radius:5px;">حذف</button>
        </td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Almarai', sans-serif;
              margin: 0;
              padding: 30px;
              background: #f5f7fa;
              color: #333;
              direction: rtl;
            }
            h1 {
              text-align: center;
              color: #3b0a77;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background: #fff;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
            }
            th, td {
              padding: 15px;
              text-align: center;
              border-bottom: 1px solid #eee;
              font-size: 15px;
            }
            th {
              background-color: #3b0a77;
              color: white;
              font-size: 16px;
            }
            tr:hover {
              background-color: #f0f0f0;
            }
            button {
              padding: 5px 10px;
              font-size: 14px;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            }
            .refresh-btn {
              display: block;
              margin: 0 auto 20px;
              padding: 10px 25px;
              background-color: #3b0a77;
              color: white;
              font-size: 15px;
            }
            .logout-link {
              text-align: center;
              margin-bottom: 15px;
            }
            .logout-link a {
              color: #3b0a77;
              font-size: 15px;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone</h1>
          <h2 style="text-align:center; color:#5a22a1;">مرحبًا ${req.session.username || ''}</h2>
          <div class="logout-link">
            <a href="/logout">🔓 تسجيل الخروج</a>
          </div>
          <button class="refresh-btn" onclick="location.reload()">🔄 تحديث الطلبات</button>
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الجوال</th>
                <th>الجهاز</th>
                <th>السعر كاش</th>
                <th>السعر تقسيط</th>
                <th>القسط الشهري</th>
                <th>كود الطلب</th>
                <th>الوقت</th>
                <th>حذف</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <script>
            function deleteOrder(id) {
              if (confirm('هل أنت متأكد أنك تريد حذف هذا الطلب؟')) {
                fetch('/api/delete/' + id, { method: 'DELETE' })
                  .then(res => {
                    if (res.ok) {
                      alert('تم حذف الطلب بنجاح');
                      location.reload();
                    } else {
                      alert('حدث خطأ أثناء الحذف');
                    }
                  });
              }
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Admin page error:', err);
    res.status(500).send('حدث خطأ أثناء جلب الطلبات');
  }
});

// استقبال الطلب من صفحة HTML
app.post('/api/order', async (req, res) => {
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;

  try {
    await pool.query(
      `INSERT INTO orders (name, phone, device, cash_price, installment_price, monthly, order_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, phone, device, cashPrice, installmentPrice, monthly, code]
    );
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

// حذف الطلب
app.delete('/api/delete/:id', async (req, res) => {
  const id = req.params.id;
  try {
    await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'خطأ في حذف الطلب' });
  }
});

// تشغيل السيرفر
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
