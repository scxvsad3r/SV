import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import { Pool } from 'pg';

const app = express();
const port = process.env.PORT || 3000;

// إعدادات PostgreSQL (غيرها لرابطك)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://...'
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'keyboard cat secret 4store',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // ساعة
}));

// صفحة تسجيل دخول الأدمن (GET)
app.get('/admin/login', (req, res) => {
  res.send(`
    <h2>تسجيل دخول الأدمن</h2>
    <form method="POST" action="/admin/login">
      <input name="username" placeholder="اسم المستخدم" /><br/>
      <input type="password" name="password" placeholder="كلمة المرور" /><br/>
      <button>دخول</button>
    </form>
  `);
});

// تسجيل دخول الأدمن (POST)
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;

  // غير هذا حسب بياناتك الحقيقية
  const ADMIN_USER = 'admin';
  const ADMIN_PASS = '123456';

  if(username === ADMIN_USER && password === ADMIN_PASS){
    req.session.admin = true;
    res.redirect('/admin/support');
  } else {
    res.send('فشل في تسجيل الدخول');
  }
});

// Middleware حماية صفحة الأدمن
function requireAdmin(req, res, next) {
  if(req.session.admin) return next();
  res.redirect('/admin/login');
}

// تسجيل خروج الأدمن
app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

// صفحة الأدمن للدردشة مع العملاء (محمية)
app.get('/admin/support', requireAdmin, (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>لوحة الدعم الفني - الأدمن</title>
      <style>
        body { font-family: 'Almarai', sans-serif; max-width: 700px; margin: 30px auto; background: #f1f1f1; padding: 20px; border-radius: 8px; }
        h1 { color: #3b0a77; text-align: center; }
        #orderCodeInput { width: 100%; padding: 10px; font-size: 16px; margin-bottom: 10px; }
        #chat { border: 1px solid #ccc; height: 400px; overflow-y: auto; padding: 10px; background: white; margin-bottom: 10px; }
        .message { margin-bottom: 10px; padding: 8px; border-radius: 6px; max-width: 80%; }
        .client { background: #d1ecf1; text-align: right; margin-left: auto; }
        .admin { background: #f8d7da; text-align: left; margin-right: auto; }
        form { display: flex; }
        input[type="text"] { flex: 1; padding: 10px; font-size: 16px; border-radius: 6px; border: 1px solid #ccc; }
        button { background: #3b0a77; color: white; border: none; padding: 10px 20px; border-radius: 6px; margin-left: 10px; cursor: pointer; }
        a { color: #3b0a77; text-decoration: none; float: left; margin-bottom: 10px; }
      </style>
    </head>
    <body>
      <a href="/admin/logout">تسجيل خروج</a>
      <h1>لوحة الدعم الفني - الأدمن</h1>
      <input type="text" id="orderCodeInput" placeholder="أدخل كود الطلب" />
      <button onclick="loadChat()">تحميل المحادثة</button>

      <div id="chat"></div>

      <form id="chatForm" style="display:none;" onsubmit="sendMessage(event)">
        <input type="text" id="messageInput" placeholder="اكتب ردك هنا..." autocomplete="off" />
        <button type="submit">إرسال</button>
      </form>

      <script>
        let orderCode = '';
        const chatDiv = document.getElementById('chat');
        const chatForm = document.getElementById('chatForm');
        const messageInput = document.getElementById('messageInput');

        function loadChat() {
          orderCode = document.getElementById('orderCodeInput').value.trim();
          if (!orderCode) {
            alert('يرجى إدخال كود الطلب');
            return;
          }
          chatForm.style.display = 'flex';
          fetchMessages();
          setInterval(fetchMessages, 3000);
        }

        async function fetchMessages() {
          const res = await fetch('/api/support/messages/' + encodeURIComponent(orderCode));
          if(!res.ok){
            alert('حدث خطأ في جلب الرسائل');
            return;
          }
          const messages = await res.json();
          chatDiv.innerHTML = messages.map(msg => {
            const cls = msg.sender === 'client' ? 'client' : 'admin';
            return '<div class="message ' + cls + '">' + msg.message + '</div>';
          }).join('');
          chatDiv.scrollTop = chatDiv.scrollHeight;
        }

        async function sendMessage(e) {
          e.preventDefault();
          const message = messageInput.value.trim();
          if (!message) return;

          const res = await fetch('/api/support/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_code: orderCode, sender: 'admin', message })
          });
          if(!res.ok){
            alert('فشل في إرسال الرسالة');
            return;
          }
          messageInput.value = '';
          fetchMessages();
        }
      </script>
    </body>
    </html>
  `);
});

// API إرسال رسالة دعم فني (client/admin)
app.post('/api/support/message', async (req, res) => {
  const { order_code, sender, message } = req.body;
  if (!order_code || !sender || !message) {
    return res.status(400).json({ message: 'بيانات غير كاملة' });
  }

  try {
    await pool.query(
      `INSERT INTO support_messages (order_code, sender, message) VALUES ($1, $2, $3)`,
      [order_code, sender, message]
    );
    res.json({ message: 'تم إرسال الرسالة' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// API جلب رسائل الدعم الفني حسب كود الطلب
app.get('/api/support/messages/:order_code', async (req, res) => {
  const { order_code } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM support_messages WHERE order_code = $1 ORDER BY created_at ASC`,
      [order_code]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
