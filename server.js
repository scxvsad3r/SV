const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// إعداد الجلسة
app.use(session({
  secret: 'storeSecretKey',
  resave: false,
  saveUninitialized: true,
}));

app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// الاتصال بقاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:ZhuZBHzJYgVhabsZuiMtColWRqCoiybU@turntable.proxy.rlwy.net:27311/railway',
  ssl: { rejectUnauthorized: false }
});

// إنشاء جدول الطلبات
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

// عرض صفحة تسجيل الدخول
app.get('/admin/login', (req, res) => {
  res.send(`
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <title>تسجيل الدخول - 4 STORE</title>
      <link href="https://fonts.googleapis.com/css2?family=Almarai&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Almarai', sans-serif;
          background: #f5f5f5;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }
        .login-box {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 0 15px rgba(0,0,0,0.1);
          width: 350px;
          text-align: center;
        }
        h2 {
          margin-bottom: 20px;
          color: #3b0a77;
        }
        input {
          width: 100%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ccc;
          border-radius: 6px;
        }
        button {
          background: #3b0a77;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          width: 100%;
        }

    @import url('https://fonts.googleapis.com/css2?family=Almarai:wght@800&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Almarai', sans-serif;
      background: linear-gradient(135deg, #2c003e, #1a002f);
      color: #fff8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 30px;
    }
    .login-container {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid #a478ff50;
      border-radius: 24px;
      padding: 50px 40px;
      width: 100%;
      max-width: 450px;
      box-shadow: 0 0 40px #b58cff44;
      text-align: center;
      animation: fadeIn 1.2s ease-in;
    }
    @keyframes fadeIn {
      from {opacity: 0; transform: translateY(30px);}
      to {opacity: 1; transform: translateY(0);}
    }
    .login-container h2 {
      font-size: 2.2rem;
      margin-bottom: 30px;
      color: gold;
    }
    .input-group {
      position: relative;
      margin-bottom: 30px;
    }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 15px 50px 15px 20px;
      border: 1px solid gold;
      background-color: rgba(255, 255, 255, 0.1);
      color: #fff;
      font-size: 1rem;
      border-radius: 12px;
      outline: none;
      transition: 0.3s;
    }
    input[type="text"]:focus, input[type="password"]:focus {
      border-color: #ffd700;
      background-color: rgba(255, 255, 255, 0.15);
    }
    .toggle-password {
      position: absolute;
      top: 50%;
      left: 15px;
      transform: translateY(-50%);
      cursor: pointer;
      width: 26px;
      height: 26px;
      fill: gold;
      transition: fill 0.3s ease;
    }
    .toggle-password:hover {
      fill: #fff4c4;
    }
    button {
      background-color: gold;
      color: #2e003b;
      border: none;
      padding: 15px;
      width: 100%;
      font-size: 1.1rem;
      font-weight: bold;
      border-radius: 12px;
      cursor: pointer;
      transition: 0.3s ease;
      box-shadow: 0 0 20px #ffdd88aa;
    }
    button:hover {
      background-color: #fff4c4;
      box-shadow: 0 0 30px #ffeaa8;
    }
    .error {
      margin-top: 10px;
      color: #ffaaaa;
      font-weight: bold;
      font-size: 0.95rem;
      min-height: 24px;
    }


        
      </style>
    </head>
    <body>
      <form class="login-box" method="POST" action="/admin/login">
        <h2>تسجيل دخول الإدارة</h2>
        <input type="text" name="username" placeholder="اسم المستخدم" required />
        <input type="password" name="password" placeholder="كلمة المرور" required />
        <button type="submit">دخول</button>
      </form>
    </body>
    </html>
  `);
});

// استقبال بيانات تسجيل الدخول
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '123456') {
    req.session.loggedIn = true;
    return res.redirect('/admin');
  } else {
    return res.send('<script>alert("بيانات غير صحيحة"); window.location="/admin/login";</script>');
  }
});

// التحقق قبل دخول لوحة الإدارة
app.get('/admin', async (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect('/admin/login');
  }

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
        <td>${new Date(order.created_at).toLocaleString('ar-EG')}</td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة الإدارة - 4 STORE</title>
          <style>
            body {
              font-family: 'Almarai', sans-serif;
              background: #f9f9f9;
              padding: 20px;
            }
            h1 {
              text-align: center;
              color: #3b0a77;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              background: white;
              box-shadow: 0 0 10px #ccc;
              margin-top: 20px;
            }
            th, td {
              padding: 10px;
              border: 1px solid #ddd;
              text-align: center;
            }
            th {
              background: #3b0a77;
              color: white;
            }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone</h1>
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
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('حدث خطأ أثناء جلب الطلبات');
  }
});

// المسار الرئيسي
app.get('/', (req, res) => {
  res.send('<h2>أهلاً بك في لوحة 4 STORE، انتقل إلى <a href="/admin/login">تسجيل الدخول</a></h2>');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
