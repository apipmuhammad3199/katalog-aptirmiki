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

// Global memory cache for serverless environments
if (!global.GLOBAL_DB) {
  global.GLOBAL_DB = null;
}

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
  let data = null;
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      data = JSON.parse(raw);
    }
  } catch (e) {
    console.error("readDB error:", e.message);
  }

  if (!data) {
    data = global.GLOBAL_DB || { products: defaultProductsModule.products, orders: [], seq: 8800 };
  }

  let shouldWrite = false;
  if (!Array.isArray(data.products) || data.products.length === 0) {
    data.products = defaultProductsModule.products;
    shouldWrite = true;
  } else {
    // Sync new default products into data.products if missing
    for (const defProd of defaultProductsModule.products) {
      if (!data.products.some((p) => p.id === defProd.id)) {
        data.products.push(defProd);
        shouldWrite = true;
      }
    }
  }
  if (!Array.isArray(data.orders)) {
    data.orders = [];
    shouldWrite = true;
  }

  if (shouldWrite) {
    writeDB(data);
  }

  // Merge with global memory cache if global cache has more orders
  if (global.GLOBAL_DB && Array.isArray(global.GLOBAL_DB.orders)) {
    for (const o of global.GLOBAL_DB.orders) {
      if (o && o.id && !data.orders.some((item) => item.id === o.id)) {
        data.orders.push(o);
      }
    }
  }

  global.GLOBAL_DB = data;
  return data;
}

function writeDB(data) {
  global.GLOBAL_DB = data;
  try {
    ensureDb();
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("writeDB error:", err.message);
  }
}

// ===== Product CRUD =====
function getProducts() {
  const data = readDB();
  return data.products;
}

function saveProduct(product) {
  const data = readDB();
  data.products.push(product);
  writeDB(data);
  return product;
}

function updateProduct(id, updater) {
  const data = readDB();
  const idx = data.products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  if (typeof updater === "function") {
    data.products[idx] = updater({ ...data.products[idx] });
  } else if (updater && typeof updater === "object") {
    data.products[idx] = { ...data.products[idx], ...updater };
  }
  writeDB(data);
  return data.products[idx];
}

function deleteProduct(id) {
  const data = readDB();
  const idx = data.products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const [removed] = data.products.splice(idx, 1);
  writeDB(data);
  return removed;
}

// ===== Order CRUD =====
function getOrders() {
  const data = readDB();
  return data.orders;
}

function saveOrder(order) {
  const data = readDB();
  data.orders.push(order);
  writeDB(data);
  return order;
}

function matchOrderId(o, targetId) {
  if (!o || !o.id) return false;
  const rawTarget = String(targetId || "").toLowerCase().trim();
  const cleanTargetNum = rawTarget.replace(/\D/g, "");
  const itemRaw = String(o.id).toLowerCase();
  const itemNum = itemRaw.replace(/\D/g, "");

  return (
    itemRaw === rawTarget ||
    itemRaw === `apt-${rawTarget}` ||
    `apt-${itemRaw}` === rawTarget ||
    (cleanTargetNum.length > 0 && itemNum === cleanTargetNum)
  );
}

function updateOrder(id, updater) {
  const data = readDB();
  const idx = data.orders.findIndex((o) => matchOrderId(o, id));
  if (idx === -1) return null;
  if (typeof updater === "function") {
    data.orders[idx] = updater({ ...data.orders[idx] });
  } else if (updater && typeof updater === "object") {
    data.orders[idx] = { ...data.orders[idx], ...updater };
  }
  writeDB(data);
  return data.orders[idx];
}

function deleteOrder(id) {
  const data = readDB();
  const idx = data.orders.findIndex((o) => matchOrderId(o, id));
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
  return data.orders.find((o) => matchOrderId(o, id));
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
