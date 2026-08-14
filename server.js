require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

// เสิร์ฟหน้าเว็บ (public/index.html) จากเซิร์ฟเวอร์เดียวกัน — ไม่ต้องมีเว็บแยก
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  },
}));

// อนุญาตให้หน้าเว็บ (คนละโดเมนกับเซิร์ฟเวอร์นี้) เรียก API ได้
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-passcode');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const ORDERS_FILE = path.join(__dirname, 'orders.json');
const CATALOG_FILE = path.join(__dirname, 'catalog.json');
const ADMIN_USER_ID = process.env.ADMIN_LINE_USER_ID; // ดูวิธีหา userId ใน README
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '1234';
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DEFAULT_CATALOG = [
  {
    id: 'khrok',
    name: 'ขนมครกสิงคโปร์',
    tagline: 'ทำจากใบเตยแท้คั้นสด100% หอมนุ่ม หวานน้อย ทำสดใหม่ทุกวัน',
    image: 'https://raw.githubusercontent.com/heartrakangthong-maker/khanom-khrok-line/main/public/pandan.jfif',
    soldOut: false,
    emoji: '🥥',
    variants: [
      { id: 'khrok-8', label: '8 ชิ้น', price: 30 },
      { id: 'khrok-11', label: '11 ชิ้น', price: 40 },
      { id: 'khrok-15', label: '15 ชิ้น', price: 50 },
    ],
  },
  {
    id: 'khrok-pumpkin',
    name: 'ขนมครกสิงคโปร์ฟักทอง',
    tagline: 'ฟักทองอุดมไปด้วยวิตามิน และมีใยอาหารสูง',
    image: 'https://raw.githubusercontent.com/heartrakangthong-maker/khanom-khrok-line/main/public/pumpkin.jpg',
    soldOut: false,
    emoji: '🎃',
    variants: [
      { id: 'khrok-pumpkin-8', label: '8 ชิ้น', price: 30 },
      { id: 'khrok-pumpkin-11', label: '11 ชิ้น', price: 40 },
      { id: 'khrok-pumpkin-15', label: '15 ชิ้น', price: 50 },
    ],
  },
  {
    id: 'babin',
    name: 'ขนมบ้าบิ่นมะพร้าวน้ำหอม',
    tagline: 'บ้าบิ่นที่จริงใจ มะพร้าวน้ำหอมแน่นๆทุกคำ',
    image: 'https://raw.githubusercontent.com/heartrakangthong-maker/khanom-khrok-line/main/public/babin.jfif',
    soldOut: false,
    emoji: '🍥',
    variants: [{ id: 'babin-1', label: '1 กล่อง', price: 50 }],
  },
  {
    id: 'combo',
    name: 'รวมขนมครกสิงคโปร์ + บ้าบิ่น',
    tagline: 'อยากกินสองอย่างในกล่องเดียว จบในออเดอร์เดียว',
    image: 'https://raw.githubusercontent.com/heartrakangthong-maker/khanom-khrok-line/main/public/mixbabin.jfif',
    soldOut: false,
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
  faqs: [
    { keywords: ['เวลา', 'เปิด', 'ปิด', 'กี่โมง'], answer: 'ร้านเปิดทุกวัน 07:30 - 15:00 น. ครับ 😊 หากมาแล้วไม่เจอสงสัยขายดีแน่ๆ😆 ลูกค้ากดสั่งขนมไว้ก่อนเข้ามาใช้บริการได้เลยนะครับ 🩵' },
    { keywords: ['ที่อยู่', 'อยู่ที่ไหน', 'แผนที่', 'ร้านอยู่'], answer: '📌กดปุ่ม โลเคชั่น ตรงริชเมนูได้เลยคร้าบ' },
    { keywords: ['ค่าส่ง', 'จัดส่ง', 'ส่งถึง', 'delivery'], answer: '🛵 จัดส่งผ่าน Grab Express และผู้ให้บริการเจ้าอื่นๆครับ คิดค่าส่งตามระยะทางจริง แอดมินจะแจ้งราคาก่อนเรียกไรเดอร์ทุกครั้งครับ และแอดมินจะหาผู้ให้บริการที่ราคาถูกกกที่สุดให้ลูกค้าเลยครับ' },
    { keywords: ['โอนเงิน', 'จ่ายเงิน', 'ชำระเงิน', 'พร้อมเพย์', 'บัญชี'], answer: 'ชำระผ่าน QR พร้อมเพย์ได้เลยครับ ระบบจะโชว์ QR ให้อัตโนมัติหลังยืนยันออเดอร์ในหน้าสั่งซื้อครับ ' },
    { keywords: ['เก็บได้กี่วัน', 'อยู่ได้นาน', 'หมดอายุ', 'เก็บนาน'], answer: 'เก็บได้เป็นปีเลยครับ แต่ยังทานได้ไหมไม่รู้ อ๊ะหยอกก 😊 แนะนำเก็บในตู้เย็นไม่เกิน 5 วันเพื่อความสดใหม่ของขนมนะครับ' },
    { keywords: ['แพ้', 'อาการ'], answer: '✅ ขนมเรามีส่วนผสมของแป้งสาลี หากลูกค้ามีอาการแพ้ (Wheat Allergy) ควรหลีกเลี่ยงนะครับ 🥹 \n*****แต่ทานขนมบ้าบิ่นได้น๊าาา' },
    { keywords: ['ทำไร', 'ทำอะไรอยู่', 'ทำไรคะ', 'ทำอะไรอยู่ครับ', 'ทำไรอยู่วะ'], answer: 'กำลังแชทกับลูกค้าอยู่ไงคร้าบ 🩵🫶🏻' },
    { keywords: ['อยากได้กำลังใจ', 'เหนื่อย', 'เหนื่อยอะ', 'เหนื่อยจัง', 'เหนื่อยว่ะ', 'หมดแรง', 'หมดกำลังใจ', 'อ่อนเพลีย'], answer: '🩵 คุณเติบโตมาอย่างดีแล้วนะ ที่ผ่านมาได้ตั้งไกลขนาดนี้ คุณเก่งและอดทนมากๆแล้ว อย่าลืมใจดีกับตัวเองให้เหมือนที่ใจดีกับคนอื่นนะครับ ' },
    { keywords: ['หิว'], answer: 'แอดมินก็หิววว !! 🤩 กดสั่งกันเลยมั้ยยย' },
  ],
  lottery: [
    { label: 'ลด 5% ครั้งหน้า', weight: 5 },
    { label: 'ลุ้นใหม่ครั้งหน้านะ', weight: 56 },
    { label: 'อาหารพิเศษให้มาสคอต 1 ชิ้น', weight: 36, type: 'mascotFood', amount: 1 },
    { label: 'อาหารพิเศษให้มาสคอต 2 ชิ้น', weight: 3, type: 'mascotFood', amount: 2 },
  ],
  pointsPerFood: 1,
};

function pickWeighted(items) {
  const total = items.reduce((s, it) => s + (Number(it.weight) || 0), 0);
  if (total <= 0) return items[Math.floor(Math.random() * items.length)];
  let r = Math.random() * total;
  for (const it of items) {
    r -= Number(it.weight) || 0;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
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

/* -------------------------------------------------------------
   1) หน้าสั่งซื้อ (LIFF) เรียก endpoint นี้ตอนลูกค้ากด "ยืนยันสั่งซื้อ"
      body: { userId, name, lineDisplayName, items, total, fulfil, note }
      userId ได้จาก liff.getProfile() ฝั่งหน้าเว็บ — ต้องรันอยู่ใน LIFF เท่านั้น
------------------------------------------------------------- */
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

/* -------------------------------------------------------------
   เมนู/ราคา — หน้าเว็บดึงมาแสดงตอนเปิดหน้า, แอดมินแก้ไขผ่าน /api/catalog (PUT)
------------------------------------------------------------- */
app.get('/api/catalog', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readCatalog());
});

app.put('/api/catalog', express.json({ limit: '10mb' }), requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'catalog must be an array' });
  writeCatalog(req.body);
  res.json({ ok: true });
});

app.post('/api/notify-soldout', express.json(), requireAdmin, async (req, res) => {
  try {
    const { productName } = req.body;
    if (!productName) return res.status(400).json({ error: 'missing productName' });
    await client.broadcast({
      type: 'text',
      text: `📢 แจ้งให้ทราบครับ\n"${productName}" หมดแล้วสำหรับวันนี้\nขออภัยในความไม่สะดวกครับ 🙏`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('broadcast error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

/* -------------------------------------------------------------
   ออเดอร์ — สำหรับหน้าแดชบอร์ดแอดมิน (ต้องส่ง header x-admin-passcode)
------------------------------------------------------------- */
app.get('/api/settings', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readSettings());
});

const MASCOT_IMAGES = {
  egg: 'data:image/png;base64,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',
  sprout: 'REPLACE_THIS_WITH_YOUR_SPROUT_IMAGE_FROM_ORIGINAL_FILE',
  young: 'data:image/png;base64,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',
  adult: 'data:image/png;base64,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',
  legend: 'data:image/png;base64,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',
};
// cumulative "food" thresholds — food items needed to LEAVE each stage
const MASCOT_STAGES = [
  { threshold: 0, key: 'egg', name: 'ไข่ขนมใบเตย' },
  { threshold: 5, key: 'sprout', name: 'ตัวอ่อนเริ่มฟัก' },
  { threshold: 10, key: 'young', name: 'วัยหัดเดิน' },
  { threshold: 20, key: 'adult', name: 'ตัวโตวัยเรียนรู้' },
  { threshold: 40, key: 'legend', name: 'ตัวเต็มวัย (เชฟใบเตย)' },
];
function getMascotStage(foodGiven) {
  let current = MASCOT_STAGES[0];
  for (const s of MASCOT_STAGES) {
    if (foodGiven >= s.threshold) current = s;
    else break;
  }
  return current;
}
// แต้มนับเฉพาะออเดอร์ที่แอดมินกดยืนยันว่า "เสร็จแล้ว" เท่านั้น
// (แอดมินจะเห็นรูปสลิป+ยอดที่ต้องได้รับก่อนตัดสินใจกดเสมอ ถือเป็นจุดตรวจสอบยอดจริง)
function calcTotalPoints(orders, userId) {
  return orders
    .filter((o) => o.userId === userId && o.status === 'เสร็จแล้ว')
    .reduce((sum, o) => sum + Math.floor((Number(o.total) || 0) / 100), 0);
}

const MASCOT_FED_FILE = path.join(__dirname, 'mascot-fed.json');
function readMascotFed() {
  if (!fs.existsSync(MASCOT_FED_FILE)) return {};
  return JSON.parse(fs.readFileSync(MASCOT_FED_FILE, 'utf8'));
}
function writeMascotFed(data) {
  fs.writeFileSync(MASCOT_FED_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/mascot/:userId', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const orders = readOrders();
  const totalPoints = calcTotalPoints(orders, req.params.userId);
  const fedData = readMascotFed();
  let rec = fedData[req.params.userId];
  let changed = false;
  if (!rec) {
    rec = { redeemedPoints: 0, foodInventory: 0, foodGiven: 0, lastBathAt: Date.now() };
    changed = true;
  }
  if (rec.foodInventory === undefined) { rec.foodInventory = 0; changed = true; }
  if (rec.lastBathAt === undefined) { rec.lastBathAt = Date.now(); changed = true; }
  if (changed) {
    fedData[req.params.userId] = rec;
    writeMascotFed(fedData);
  }

  const availablePoints = Math.max(0, totalPoints - rec.redeemedPoints);
  const stage = getMascotStage(rec.foodGiven);
  const stageIdx = MASCOT_STAGES.indexOf(stage);
  const next = MASCOT_STAGES[stageIdx + 1];
  const settings = readSettings();
  const pointsPerFood = Number(settings.pointsPerFood) || 1;
  const isDirty = Date.now() - rec.lastBathAt >= 3 * 60 * 60 * 1000;

  res.json({
    totalPoints,
    availablePoints,
    foodInventory: rec.foodInventory,
    foodGiven: rec.foodGiven,
    stage: stage.key,
    stageName: stage.name,
    image: MASCOT_IMAGES[stage.key],
    pointsPerFood,
    stageStart: stage.threshold,
    nextThreshold: next ? next.threshold : null,
    foodNeeded: next ? next.threshold - rec.foodGiven : null,
    canRedeem: !!next && availablePoints >= pointsPerFood,
    canFeed: !!next && rec.foodInventory > 0,
    isDirty,
  });
});

app.post('/api/mascot/:userId/redeem', express.json(), (req, res) => {
  const orders = readOrders();
  const totalPoints = calcTotalPoints(orders, req.params.userId);
  const fedData = readMascotFed();
  const rec = fedData[req.params.userId] || { redeemedPoints: 0, foodInventory: 0, foodGiven: 0, lastBathAt: Date.now() };
  const availablePoints = Math.max(0, totalPoints - rec.redeemedPoints);
  const settings = readSettings();
  const pointsPerFood = Number(settings.pointsPerFood) || 1;
  if (availablePoints >= pointsPerFood) {
    rec.redeemedPoints += pointsPerFood;
    rec.foodInventory = (rec.foodInventory || 0) + 1;
    fedData[req.params.userId] = rec;
    writeMascotFed(fedData);
  }
  res.json({ ok: true });
});

app.post('/api/mascot/:userId/feed', express.json(), (req, res) => {
  const fedData = readMascotFed();
  const rec = fedData[req.params.userId] || { redeemedPoints: 0, foodInventory: 0, foodGiven: 0, lastBathAt: Date.now() };
  const stage = getMascotStage(rec.foodGiven);
  const stageIdx = MASCOT_STAGES.indexOf(stage);
  const next = MASCOT_STAGES[stageIdx + 1];
  if (next && (rec.foodInventory || 0) > 0) {
    rec.foodInventory -= 1;
    rec.foodGiven += 1;
    fedData[req.params.userId] = rec;
    writeMascotFed(fedData);
  }
  res.json({ ok: true });
});

app.post('/api/mascot/:userId/bath', express.json(), (req, res) => {
  const fedData = readMascotFed();
  const rec = fedData[req.params.userId] || { redeemedPoints: 0, foodInventory: 0, foodGiven: 0, lastBathAt: Date.now() };
  rec.lastBathAt = Date.now();
  fedData[req.params.userId] = rec;
  writeMascotFed(fedData);
  res.json({ ok: true });
});

app.post('/api/mascot/:userId/grant', express.json(), requireAdmin, (req, res) => {
  const fedData = readMascotFed();
  const rec = fedData[req.params.userId] || { redeemedPoints: 0, foodInventory: 0, foodGiven: 0, lastBathAt: Date.now() };
  const amount = Number(req.body.amount) || 1;
  rec.foodInventory = (rec.foodInventory || 0) + amount;
  fedData[req.params.userId] = rec;
  writeMascotFed(fedData);
  res.json({ ok: true, foodInventory: rec.foodInventory });
});

app.post('/api/lottery/:code', express.json(), async (req, res) => {
  try {
    const orders = readOrders();
    const order = orders.find((o) => o.code === req.params.code);
    if (!order) return res.status(404).json({ error: 'order not found' });

    if (order.lotteryResult) {
      return res.json({ prize: order.lotteryResult });
    }

    const settings = readSettings();
    const items = (settings.lottery || []).filter((it) => it.label);
    if (items.length === 0) return res.status(400).json({ error: 'no prizes configured' });

    const winner = pickWeighted(items);
    order.lotteryResult = winner.label;
    order.lotteryUsed = false;
    writeOrders(orders);

    if (winner.type === 'mascotFood' && order.userId) {
      const fedData = readMascotFed();
      const rec = fedData[order.userId] || { redeemedPoints: 0, foodInventory: 0, foodGiven: 0, lastBathAt: Date.now() };
      rec.foodInventory = (rec.foodInventory || 0) + (winner.amount || 1);
      fedData[order.userId] = rec;
      writeMascotFed(fedData);
    }

    if (ADMIN_USER_ID) {
      await client.pushMessage(ADMIN_USER_ID, {
        type: 'text',
        text: `🎰 ออเดอร์ ${order.code} จับสลากได้รางวัล: ${winner.label}`,
      });
    }

    res.json({ prize: winner.label });
  } catch (err) {
    console.error('lottery error:', err);
    res.status(500).json({ error: 'internal error' });
  }
});
app.put('/api/settings', express.json(), requireAdmin, (req, res) => {
  writeSettings(req.body);
  res.json({ ok: true });
});

app.get('/api/orders', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readOrders());
});

app.put('/api/orders/:code', express.json(), requireAdmin, (req, res) => {
  const orders = readOrders();
  const order = orders.find((o) => o.code === req.params.code);
  if (!order) return res.status(404).json({ error: 'not found' });
  if (req.body.status !== undefined) order.status = req.body.status;
  if (req.body.lotteryUsed !== undefined) order.lotteryUsed = req.body.lotteryUsed;
  writeOrders(orders);
  res.json({ ok: true });
});

/* -------------------------------------------------------------
   2) LINE เรียก endpoint นี้ทุกครั้งที่มี event
      (ข้อความจากลูกค้า, ปุ่ม postback ที่แอดมินกดเปลี่ยนสถานะ)
      line.middleware ตรวจลายเซ็น X-Line-Signature ให้อัตโนมัติ
      ต้องตั้งค่า Webhook URL ใน console เป็น .../webhook
------------------------------------------------------------- */
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
    const slipHash = crypto.createHash('sha256').update(data).digest('hex');
    const duplicate = orders.find((o) => o.code !== code && o.slipHash === slipHash);

    order.slipImage = slipUrl;
    order.slipHash = slipHash;
    if (duplicate) order.slipDuplicateOf = duplicate.code;
    order.status = 'กำลังทำ';
    writeOrders(orders);

    if (ADMIN_USER_ID) {
      await client.pushMessage(ADMIN_USER_ID, {
        type: 'image',
        originalContentUrl: slipUrl,
        previewImageUrl: slipUrl,
      });
      let adminText = `สลิปโอนเงินออเดอร์ ${code} ครับ ↑\nยอดที่ต้องได้รับ: ${order.total}฿\nระบบอัปเดตสถานะเป็น "กำลังทำ" ให้อัตโนมัติแล้ว`;
      if (duplicate) {
        adminText += `\n\n⚠️ คำเตือน: สลิปนี้ตรงกับสลิปของออเดอร์ ${duplicate.code} เป๊ะ กรุณาตรวจสอบก่อนว่าไม่ใช่สลิปซ้ำ`;
      }
      await client.pushMessage(ADMIN_USER_ID, { type: 'text', text: adminText });
    }

    if (order.userId) {
      await client.pushMessage(order.userId, [
        {
          type: 'text',
          text: `ได้รับสลิปโอนเงินแล้วครับ ✅\nออเดอร์ ${code} อัปเดตสถานะเป็น "กำลังทำ"`,
        },
        buildReceiptFlex(order),
      ]);
    }

    // ตั้งเวลาไว้ 10 นาที เปลี่ยนเป็น "เสร็จแล้ว" อัตโนมัติ
    // (ถ้าแอดมินเปลี่ยนสถานะเองก่อนหน้านั้นแล้ว จะไม่ทับสถานะที่แอดมินตั้ง)
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

function matchFaq(text, faqs) {
  const lower = text.toLowerCase();
  for (const f of faqs || []) {
    if ((f.keywords || []).some((k) => k && lower.includes(k.toLowerCase()))) return f.answer;
  }
  return null;
}

async function handleEvent(event) {
  // แอดมินกดปุ่มในการ์ดแจ้งเตือนออเดอร์ เพื่อเปลี่ยนสถานะ
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

  // ลูกค้าพิมพ์ข้อความมาในแชท OA เอง — ตอบลิงก์เข้า LIFF ให้สั่งของ
  if (event.type === 'message' && event.message.type === 'text') {
    const text = event.message.text.trim();
    if (text === 'เมนู' || text === 'สั่งของ' || text === 'order') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: `สั่งขนมครกสิงคโปร์ได้ที่นี่เลยครับ 🍯\n${process.env.LIFF_URL || '(ยังไม่ได้ตั้งค่า LIFF_URL)'}`,
      });
    }

    const settings = readSettings();
    const faqAnswer = matchFaq(text, settings.faqs);
    if (faqAnswer) {
      return client.replyMessage(event.replyToken, { type: 'text', text: faqAnswer });
    }

    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: 'ขอบคุณที่ทักมานะครับ 😊 แอดมินเห็นข้อความแล้วจะรีบตอบกลับ\nระหว่างนี้เลือกหัวข้อด้านล่างได้เลยครับ',
      quickReply: {
        items: [
          { type: 'action', action: { type: 'message', label: '📋 ดูเมนู', text: 'เมนู' } },
          { type: 'action', action: { type: 'message', label: '⏰ เวลาทำการ', text: 'เวลาเปิดกี่โมง' } },
          { type: 'action', action: { type: 'message', label: '🛵 ค่าจัดส่ง', text: 'ค่าส่งเท่าไหร่' } },
          { type: 'action', action: { type: 'message', label: '💰 วิธีชำระเงิน', text: 'ชำระเงินยังไง' } },
        ],
      },
    });

    if (ADMIN_USER_ID) {
      await client.pushMessage(ADMIN_USER_ID, {
        type: 'text',
        text: `💬 ลูกค้าทักมา: "${text}"\n(บอทตอบเองไม่ได้ กรุณาตอบด้วยครับ)`,
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

function buildReceiptFlex(order) {
  const itemRows = order.items.map((it) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: `${it.productName} (${it.variantLabel}) x${it.qty}`, size: 'xs', color: '#3A2E22', flex: 4, wrap: true },
      { type: 'text', text: `${it.price * it.qty}฿`, size: 'xs', color: '#3A2E22', flex: 1, align: 'end' },
    ],
  }));
  const dateStr = new Date(order.createdAt || Date.now()).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return {
    type: 'flex',
    altText: `ใบเสร็จออเดอร์ ${order.code}`,
    contents: {
      type: 'bubble',
      styles: {
        header: { backgroundColor: '#3A542A' },
        body: { backgroundColor: '#FBF4E4' },
        footer: { backgroundColor: '#FBF4E4' },
      },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#3A542A',
        paddingAll: 'lg',
        contents: [
          { type: 'text', text: '🧾 ใบเสร็จรับเงิน', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: 'ขนมครกสิงคโปร์OK  ·  Wanglang Pandan', color: '#FFECBE', size: 'xs', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        backgroundColor: '#FBF4E4',
        contents: [
          { type: 'text', text: `เลขที่ออเดอร์: ${order.code}`, size: 'xs', color: '#8C7C64' },
          { type: 'text', text: dateStr, size: 'xs', color: '#8C7C64' },
          { type: 'separator', margin: 'md', color: '#E0CB96' },
          ...itemRows,
          { type: 'separator', margin: 'md', color: '#E0CB96' },
          {
            type: 'box',
            layout: 'horizontal',
            margin: 'md',
            paddingAll: 'md',
            backgroundColor: '#E9EED6',
            cornerRadius: 'xl',
            contents: [
              { type: 'text', text: 'รวมทั้งหมด', weight: 'bold', size: 'sm', color: '#3A542A' },
              { type: 'text', text: `${order.total}฿`, weight: 'bold', size: 'md', align: 'end', color: '#BF5719' },
            ],
          },
          { type: 'text', text: `รับสินค้า: ${order.fulfil}`, size: 'xs', color: '#8C7C64', margin: 'md' },
          { type: 'text', text: 'สถานะการชำระเงิน: ชำระเงินแล้ว ✅', size: 'xs', color: '#679234', weight: 'bold', margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FBF4E4',
        contents: [{ type: 'text', text: 'ขอบคุณที่อุดหนุนนะครับ 🙏', size: 'xs', color: '#8C7C64', align: 'center' }],
      },
    },
  };
}

/* -------------------------------------------------------------
   รีเซ็ตสถานะ "หมด" ของทุกเมนูกลับเป็นมีสินค้า อัตโนมัติทุกวัน 06:00 น. (เวลาไทย)
------------------------------------------------------------- */
function resetSoldOut() {
  try {
    const catalog = readCatalog();
    const updated = catalog.map((p) => ({ ...p, soldOut: false }));
    writeCatalog(updated);
    console.log('Auto-reset sold-out status at', new Date().toISOString());
  } catch (err) {
    console.error('reset sold-out error:', err);
  }
}
function msUntilNextBangkok6AM() {
  const now = new Date();
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const target = new Date(Date.UTC(bangkokNow.getUTCFullYear(), bangkokNow.getUTCMonth(), bangkokNow.getUTCDate(), 6, 0, 0));
  if (target <= bangkokNow) target.setUTCDate(target.getUTCDate() + 1);
  const targetReal = new Date(target.getTime() - 7 * 60 * 60 * 1000);
  return targetReal.getTime() - now.getTime();
}
function scheduleDailyReset() {
  const delay = msUntilNextBangkok6AM();
  console.log(`Next auto-reset in ${Math.round(delay / 60000)} minutes`);
  setTimeout(() => {
    resetSoldOut();
    setInterval(resetSoldOut, 24 * 60 * 60 * 1000);
  }, delay);
}
scheduleDailyReset();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LINE webhook server running on port ${PORT}`));
