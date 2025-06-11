import express from "express";
import session from "express-session";
import pg from "pg";
import { Webhook, MessageBuilder } from "discord-webhook-node";

const app = express();
const port = process.env.PORT || 3000;

// إعداد قاعدة البيانات PostgreSQL
const pool = new pg.Pool({
  connectionString:
    "postgresql://postgres:OESSTSEDkYaSrecZjjNqVwEVscWxPnZT@interchange.proxy.rlwy.net:34758/railway",
});

// إعداد Discord Webhook
const hook = new Webhook("https://discord.com/api/webhooks/xxxxxxxxxxxxxxxxxxxxxxxxxxxx");

// ميدلوير لتحليل JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// إعدادات الجلسة
app.use(
  session({
    secret: "keyboard cat secret",
    resave: false,
    saveUninitialized: false,
  })
);

// ميدلوير للتحقق من تسجيل الدخول
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "غير مسجل الدخول" });
  }
  next();
}

// ميدلوير للتحقق من صلاحية Admin
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "ليس لديك صلاحية" });
  }
  next();
}

// ميدلوير للتحقق من صلاحية Mod أو Admin (للعرض فقط)
function requireModOrAdmin(req, res, next) {
  if (!req.session.user || (req.session.user.role !== "admin" && req.session.user.role !== "mod")) {
    return res.status(403).json({ error: "ليس لديك صلاحية" });
  }
  next();
}

// صفحة الدخول
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  // تحقق من المستخدم في قاعدة البيانات
  try {
    const result = await pool.query("SELECT id, username, role FROM users WHERE username=$1 AND password=$2", [
      username,
      password,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
    }
    const user = result.rows[0];
    req.session.user = { id: user.id, username: user.username, role: user.role };

    // إرسال إشعار دخول
    const loginMsg = new MessageBuilder()
      .setTitle("تسجيل دخول")
      .addField("المستخدم", user.username, true)
      .addField("الصلاحية", user.role, true)
      .setTimestamp();
    await hook.send(loginMsg);

    res.json({ message: "تم تسجيل الدخول بنجاح", user: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// صفحة تسجيل الخروج
app.post("/logout", requireLogin, async (req, res) => {
  try {
    const username = req.session.user.username;

    req.session.destroy();

    // إرسال إشعار خروج
    const logoutMsg = new MessageBuilder()
      .setTitle("تسجيل خروج")
      .addField("المستخدم", username, true)
      .setTimestamp();
    await hook.send(logoutMsg);

    res.json({ message: "تم تسجيل الخروج بنجاح" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// عرض كل الطلبات (admin + mod)
app.get("/orders", requireModOrAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json({ orders: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// تحديث حالة الطلب (admin فقط)
app.put("/orders/:id/status", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    // تحديث الحالة في قاعدة البيانات
    const result = await pool.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING *", [status, id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    // إرسال إشعار لتحديث الحالة
    const msg = new MessageBuilder()
      .setTitle("تحديث حالة الطلب")
      .addField("رقم الطلب", id, true)
      .addField("الحالة الجديدة", status, true)
      .addField("المستخدم", req.session.user.username, true)
      .setTimestamp();
    await hook.send(msg);

    res.json({ message: "تم تحديث حالة الطلب", order: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// حذف الطلب (admin فقط)
app.delete("/orders/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("DELETE FROM orders WHERE id=$1", [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "الطلب غير موجود" });
    }

    // إرسال إشعار حذف الطلب
    const msg = new MessageBuilder()
      .setTitle("حذف طلب")
      .addField("رقم الطلب", id, true)
      .addField("المستخدم", req.session.user.username, true)
      .setTimestamp();
    await hook.send(msg);

    res.json({ message: "تم حذف الطلب" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "خطأ في الخادم" });
  }
});

// بدء السيرفر
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
