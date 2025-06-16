// server.js
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// رابط ويب هوك ديسكورد (غيّره إلى الرابط عندك)
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/…';

// دالة لإرسال لوق إلى ديسكورد
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

// إعداد قاعدة البيانات
const pool = new Pool({
  connectionString: 'postgresql://postgres:password@host:port/db',
  ssl: { rejectUnauthorized: false }
});

// تأكد وجود جدول الطلبات
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

// ### 1) تقديم ملفات الواجهة
app.use(express.static(path.join(__dirname, 'public')));

// ### 2) CORS و body parsing
app.use(cors());  
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ### 3) API لإنشاء طلب جديد
app.post('/api/order', async (req, res) => {
  console.log('>> POST /api/order:', req.body);
  const { name, phone, device, cashPrice, installmentPrice, monthly, code } = req.body;
  if (!name || !phone || !device || !cashPrice || !installmentPrice || !monthly || !code) {
    return res.status(400).json({ message: 'بيانات الطلب غير كاملة' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO orders
         (name, phone, device, cash_price, installment_price, monthly, order_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, created_at`,
      [name, phone, device, cashPrice, installmentPrice, monthly, code]
    );
    const order = result.rows[0];
    await sendDiscordLog(`📦 طلب جديد
• الاسم: **${name}**
• جوال: **${phone}**
• جهاز: **${device}**
• كود: **${code}**
• وقت الإنشاء: ${new Date(order.created_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}`);
    res.status(201).json({ message: 'تم استلام الطلب بنجاح', orderId: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر أثناء معالجة الطلب' });
  }
});

// ### 4) API لاستعلام حالة الطلب
app.post('/api/track', async (req, res) => {
  console.log('>> POST /api/track:', req.body);
  const { name, phone, code } = req.body;
  if (!name || !phone || !code) {
    return res.status(400).json({ message: 'بيانات ناقصة' });
  }
  try {
    const result = await pool.query(
      `SELECT status, created_at
       FROM orders
       WHERE name=$1 AND phone=$2 AND order_code=$3
       ORDER BY created_at DESC
       LIMIT 1`,
      [name, phone, code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'لم يُعثر على طلب' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// ### 5) تشغيل السيرفر
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
