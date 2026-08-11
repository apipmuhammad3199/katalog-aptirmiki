// Lapisan penyimpanan data sederhana berbasis file JSON.
// Cukup untuk skala acara (ratusan-ribuan pesanan) tanpa perlu setup database server.

const fs = require("fs");
const path = require("path");
const defaultProductsModule = require("./products");

const isVercel = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const DB_PATH = isVercel
  ? path.join("/tmp", "db.json")
  : path.join(__dirname, "..", "data", "db.json");
const UPLOADS_DIR = isVercel
  ? path.join("/tmp", "uploads")
  : path.join(__dirname, "..", "data", "uploads");

function ensureDb() {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(
        DB_PATH,
        JSON.stringify({ products: defaultProductsModule.products, orders: [], seq: 8800 }, null, 2)
      );
    }
  } catch (err) {
    console.error("ensureDb error:", err.message);
  }
}

function readDB() {
  ensureDb();
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const data = JSON.parse(raw);
      if (!Array.isArray(data.products) || data.products.length === 0) {
        data.products = defaultProductsModule.products;
      }
      if (!Array.isArray(data.orders)) {
        data.orders = [];
      }
      return data;
    }
  } catch (e) {
    console.error("readDB error:", e.message);
  }
  return { products: defaultProductsModule.products, orders: [], seq: 8800 };
}

function writeDB(data) {
  try {
    ensureDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("writeDB error:", err.message);
  }
}

// ===== Product CRUD =====
function getProducts() {
  return readDB().products;
}

function saveProduct(product) {
  const data = readDB();
  data.products.push(product);
  writeDB(data);
  return product;
}

function updateProduct(id, updates) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase();
  const idx = data.products.findIndex((p) => p && p.id && p.id.toLowerCase() === targetId);
  if (idx === -1) return null;
  data.products[idx] = { ...data.products[idx], ...updates, id: data.products[idx].id };
  writeDB(data);
  return data.products[idx];
}

function deleteProduct(id) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase();
  const idx = data.products.findIndex((p) => p && p.id && p.id.toLowerCase() === targetId);
  if (idx === -1) return null;
  const [removed] = data.products.splice(idx, 1);
  writeDB(data);
  return removed;
}

// ===== Orders CRUD =====
function getOrders() {
  return readDB().orders;
}

function saveOrder(order) {
  const data = readDB();
  data.orders.push(order);
  writeDB(data);
  return order;
}

function updateOrder(id, updater) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase();
  const idx = data.orders.findIndex((o) => o && o.id && o.id.toLowerCase() === targetId);
  if (idx === -1) return null;
  data.orders[idx] = updater({ ...data.orders[idx] });
  writeDB(data);
  return data.orders[idx];
}

function deleteOrder(id) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase();
  const idx = data.orders.findIndex((o) => o && o.id && o.id.toLowerCase() === targetId);
  if (idx === -1) return null;
  const [removed] = data.orders.splice(idx, 1);
  if (removed.proof && removed.proof.filename) {
    const proofPath = path.join(UPLOADS_DIR, removed.proof.filename);
    if (fs.existsSync(proofPath)) {
      try {
        fs.unlinkSync(proofPath);
      } catch (e) {}
    }
  }
  writeDB(data);
  return removed;
}

function findOrderById(id) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase();
  return data.orders.find((o) => o && o.id && o.id.toLowerCase() === targetId);
}

function findOrdersByWa(wa) {
  const normalized = String(wa || "").replace(/\D/g, "");
  if (!normalized) return [];
  const data = readDB();
  const suffix = normalized.length >= 9 ? normalized.slice(-9) : normalized;
  return data.orders.filter((o) => {
    if (!o || !o.customer || !o.customer.wa) return false;
    const itemWa = String(o.customer.wa).replace(/\D/g, "");
    return itemWa.endsWith(suffix) || itemWa === normalized;
  });
}

function nextOrderId() {
  const data = readDB();
  let maxSeq = data.seq || 8800;
  if (Array.isArray(data.orders)) {
    data.orders.forEach((o) => {
      if (o && o.id) {
        const num = parseInt(String(o.id).replace(/\D/g, ""), 10);
        if (!isNaN(num) && num > maxSeq) maxSeq = num;
      }
    });
  }
  data.seq = maxSeq + 1;
  writeDB(data);
  return `APT-${data.seq}`;
}

module.exports = {
  DB_PATH,
  UPLOADS_DIR,
  ensureDb,
  readDB,
  writeDB,
  getProducts,
  saveProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  saveOrder,
  updateOrder,
  deleteOrder,
  findOrderById,
  findOrdersByWa,
  nextOrderId,
};
