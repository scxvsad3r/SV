app.get('/admin', async (req, res) => {
  res.set('Cache-Control', 'no-store'); // يمنع المتصفح من تذكر الجلسة

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
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #f8f8f8; direction: rtl; }
            h1 { color: #3b0a77; }
            table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 0 10px #ccc; }
            th, td { padding: 10px; border: 1px solid #ddd; text-align: center; }
            th { background: #3b0a77; color: white; }
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
