require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-passcode');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const ORDERS_FILE = path.join(__dirname, 'orders.json');
const CATALOG_FILE = path.join(__dirname, 'catalog.json');
const ADMIN_USER_ID = process.env.ADMIN_LINE_USER_ID;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '1234';
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DEFAULT_CATALOG = [
  {
    id: 'khrok',
    name: 'ขนมครกสิงคโปร์',
    tagline: 'หอมกะทิ กรอบนอกนุ่มใน สูตรสิงคโปร์',
    image: '',
    emoji: '🥥',
    variants: [
      { id: 'khrok-8', label: '8 ชิ้น', price: 30 },
      { id: 'khrok-11', label: '11 ชิ้น', price: 40 },
      { id: 'khrok-15', label: '15 ชิ้น', price: 50 },
    ],
  },
  {
    id: 'babin',
    name: 'ขนมบ้าบิ่นมะพร้าวน้ำหอม',
    tagline: 'เนื้อนุ่ม หอมมะพร้าวอ่อนแท้ทั้งกล่อง',
    image: '',
    emoji: '🍥',
    variants: [{ id: 'babin-1', label: '1 กล่อง', price: 50 }],
  },
  {
    id: 'combo',
    name: 'รวมขนมครกสิงคโปร์ + บ้าบิ่น',
    tagline: 'อยากกินสองอย่างในกล่องเดียว จบในออเดอร์เดียว',
    image: '',
    emoji: '🎁',
    variants: [
      { id: 'combo-s', label: 'กล่องเล็ก', price: 40 },
      { id: 'combo-l', label: 'กล่องใหญ่', price: 60 },
    ],
  },
];

function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}
function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}
function readCatalog() {
  if (!fs.existsSync(CATALOG_FILE)) {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(DEFAULT_CATALOG, null, 2));
    return DEFAULT_CATALOG;
  }
  return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
}
function writeCatalog(catalog) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2));
}
const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const DEFAULT_SETTINGS = {
  qrImage: 'https://raw.githubusercontent.com/heartrakangthong-maker/khanom-khrok-line/main/public/qr.jpg',
  accountName: 'สุวัจนะ เกียรติพันธุ์สดใส · พร้อมเพย์ 095-812-9919',
};
function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return DEFAULT_SETTINGS;
  }
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
}
function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-passcode'] !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: 'wrong passcode' });
  }
  next();
}
function makeOrderCode() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `SK${y}${m}${day}-${rand}`;
}

app.post('/api/order', express.json(), async (req, res) => {
  try {
    const { userId, name, lineDisplayName, items, total, fulfil, note } = req.body;
    if (!userId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'missing order data' });
    }

    const order = {
      code: makeOrderCode(),
      userId,
      name,
      lineDisplayName,
      items,
      total,
      fulfil,
      note,
      status: 'ใหม่',
      createdAt: new Date().toISOString(),
    };

    const orders = readOrders();
    orders.push(order);
    writeOrders(orders);

    await client.pushMessage(userId, buildCustomerMessage(order));
    if (ADMIN_USER_ID) {
      await client.pushMessage(ADMIN_USER_ID, buildAdminFlex(order));
    }

    res.json({ ok: true, code: order.code });
  } catch (err) {
    console.error('order error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.get('/api/catalog', (req, res) => {
  res.json(readCatalog());
});

app.put('/api/catalog', express.json(), requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'catalog must be an array' });
  writeCatalog(req.body);
  res.json({ ok: true });
});

app.get('/api/settings', (req, res) => res.json(readSettings()));
app.put('/api/settings', express.json(), requireAdmin, (req, res) => {
  writeSettings(req.body);
  res.json({ ok: true });
});

app.get('/api/orders', requireAdmin, (req, res) => {
  res.json(readOrders());
});

app.put('/api/orders/:code', express.json(), requireAdmin, (req, res) => {
  const orders = readOrders();
  const order = orders.find((o) => o.code === req.params.code);
  if (!order) return res.status(404).json({ error: 'not found' });
  order.status = req.body.status || order.status;
  writeOrders(orders);
  res.json({ ok: true });
});

app.post('/api/upload-slip', express.json({ limit: '8mb' }), async (req, res) => {
  try {
    const { code, imageBase64 } = req.body;
    if (!code || !imageBase64) return res.status(400).json({ error: 'missing data' });
    const orders = readOrders();
    const order = orders.find((o) => o.code === code);
    if (!order) return res.status(404).json({ error: 'order not found' });

    const matches = imageBase64.match(/^data:image\/(\w+);base64,(.+)$/);
    const ext = matches ? matches[1] : 'jpg';
    const data = matches ? matches[2] : imageBase64;
    const filename = `slip-${code}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(data, 'base64'));

    const slipUrl = `https://${req.get('host')}/uploads/${filename}`;
    order.slipImage = slipUrl;
    order.status = 'กำลังทำ';
    writeOrders(orders);

    if (ADMIN_USER_ID) {
      await client.pushMessage(ADMIN_USER_ID, {
        type: 'image',
        originalContentUrl: slipUrl,
        previewImageUrl: slipUrl,
      });
      await client.pushMessage(ADMIN_USER_ID, {
        type: 'text',
        text: `สลิปโอนเงินออเดอร์ ${code} ครับ ↑\nระบบอัปเดตสถานะเป็น "กำลังทำ" ให้อัตโนมัติแล้ว`,
      });
    }

    if (order.userId) {
      await client.pushMessage(order.userId, {
        type: 'text',
        text: `ได้รับสลิปโอนเงินแล้วครับ ✅\nออเดอร์ ${code} อัปเดตสถานะเป็น "กำลังทำ"`,
      });
    }

    setTimeout(async () => {
      try {
        const latestOrders = readOrders();
        const latestOrder = latestOrders.find((o) => o.code === code);
        if (!latestOrder || latestOrder.status !== 'กำลังทำ') return;
        latestOrder.status = 'เสร็จแล้ว';
        writeOrders(latestOrders);
        if (latestOrder.userId) {
          await client.pushMessage(latestOrder.userId, {
            type: 'text',
            text: `ออเดอร์ ${code} ของคุณเสร็จแล้วครับ พร้อมรับ/จัดส่งแล้ว 🎉`,
          });
        }
      } catch (e) {
        console.error('auto-complete error:', e);
      }
    }, 10 * 60 * 1000);

    res.json({ ok: true, slipUrl });
  } catch (err) {
    console.error('upload-slip error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

app.post('/webhook', line.middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.sendStatus(200);
  } catch (err) {
    console.error('webhook error:', err);
    res.sendStatus(500);
  }
});

async function handleEvent(event) {
  if (event.type === 'postback') {
    const data = new URLSearchParams(event.postback.data);
    if (data.get('action') !== 'set_status') return;

    const code = data.get('code');
    const status = data.get('status');
    const orders = readOrders();
    const order = orders.find((o) => o.code === code);
    if (!order) return;

    order.status = status;
    writeOrders(orders);

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: `อัปเดตออเดอร์ ${code} เป็น "${status}" แล้ว`,
    });

    if (order.userId) {
      await client.pushMessage(order.userId, {
        type: 'text',
        text: `ออเดอร์ ${code} ของคุณอัปเดตสถานะเป็น "${status}" แล้วนะครับ 🙏`,
      });
    }
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    if (text === 'เมนู' || text === 'สั่งของ' || text === 'order') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `สั่งขนมครกสิงคโปร์ได้ที่นี่เลยครับ 🍯\n${process.env.LIFF_URL || '(ยังไม่ได้ตั้งค่า LIFF_URL)'}`,
      });
    }
  }
}

function buildCustomerMessage(order) {
  const lines = order.items
    .map((it) => `• ${it.productName} (${it.variantLabel}) × ${it.qty} = ${it.price * it.qty}฿`)
    .join('\n');
  return {
    type: 'text',
    text: `รับออเดอร์แล้วครับ ✅\nเลขที่: ${order.code}\n${lines}\nรวม ${order.total}฿\nรับสินค้า: ${order.fulfil}\nสถานะ: ${order.status}`,
  };
}

function buildAdminFlex(order) {
  const itemsText = order.items.map((it) => `${it.productName} (${it.variantLabel}) ×${it.qty}`).join('\n');
  return {
    type: 'flex',
    altText: `ออเดอร์ใหม่ ${order.code} — ${order.total}฿`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: `ออเดอร์ใหม่ ${order.code}`, weight: 'bold', size: 'md', color: '#146B6E' },
          { type: 'text', text: `${order.name || ''} ${order.lineDisplayName ? `(${order.lineDisplayName})` : ''}`, size: 'sm', wrap: true },
          { type: 'text', text: itemsText, size: 'sm', wrap: true, margin: 'md' },
          { type: 'text', text: `รวม ${order.total}฿ · ${order.fulfil}`, weight: 'bold', margin: 'md' },
          order.note ? { type: 'text', text: `หมายเหตุ: ${order.note}`, size: 'xs', color: '#7A6A5C', wrap: true } : null,
        ].filter(Boolean),
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: '#146B6E',
            action: { type: 'postback', label: 'กำลังทำ', data: `action=set_status&code=${order.code}&status=กำลังทำ` },
          },
          {
            type: 'button',
            style: 'primary',
            color: '#527A54',
            action: { type: 'postback', label: 'เสร็จแล้ว', data: `action=set_status&code=${order.code}&status=เสร็จแล้ว` },
          },
        ],
      },
    },
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LINE webhook server running on port ${PORT}`));
