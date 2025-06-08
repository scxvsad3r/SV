// باقي الكود نفسه (import, DB, routes)...

app.get('/admin', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    const rows = result.rows.map(order => `
      <tr>
        <td>${order.name}</td>
        <td>${order.phone}</td>
        <td>${order.device}</td>
        <td>${order.cash_price} ريال</td>
        <td>${order.installment_price} ريال</td>
        <td>${order.monthly} ريال</td>
        <td>${order.order_code}</td>
        <td>${new Date(order.created_at).toLocaleString('ar-EG')}</td>
      </tr>
    `).join('');

    res.send(`
      <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>لوحة إدارة الطلبات - 4 STORE</title>
          <link href="https://fonts.googleapis.com/css2?family=Almarai:wght@400;700&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Almarai', sans-serif;
              margin: 0;
              background: #f4f4f9;
              color: #333;
              padding: 30px;
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
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
            }
            th, td {
              padding: 14px 10px;
              text-align: center;
              border-bottom: 1px solid #eee;
            }
            th {
              background-color: #3b0a77;
              color: white;
            }
            tr:hover {
              background-color: #f1f1f1;
            }
            @media (max-width: 768px) {
              table, thead, tbody, th, td, tr {
                display: block;
              }
              th {
                position: sticky;
                top: 0;
                z-index: 2;
              }
              td {
                text-align: right;
                padding-right: 50%;
              }
              td::before {
                content: attr(data-label);
                float: right;
                font-weight: bold;
              }
            }
          </style>
        </head>
        <body>
          <h1>طلبات iPhone - 4 STORE</h1>
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
    console.error(err);
    res.status(500).send('حدث خطأ أثناء جلب الطلبات');
  }
});
