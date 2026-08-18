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

function getKVConfig() {
  let url = (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.STORAGE_REST_API_URL ||
    process.env.STORAGE_REST_URL ||
    process.env.UPSTASH_REDIS_REST_API_URL ||
    ""
  ).trim();

  let token = (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.STORAGE_REST_API_TOKEN ||
    process.env.STORAGE_REST_TOKEN ||
    process.env.UPSTASH_REDIS_REST_API_TOKEN ||
    ""
  ).trim();

  if (!url || !token) {
    const urlKey = Object.keys(process.env).find((k) => k.endsWith("_REST_API_URL") || k.endsWith("_REST_URL"));
    const tokenKey = Object.keys(process.env).find((k) => k.endsWith("_REST_API_TOKEN") || k.endsWith("_REST_TOKEN"));
    if (urlKey && process.env[urlKey]) url = String(process.env[urlKey]).trim();
    if (tokenKey && process.env[tokenKey]) token = String(process.env[tokenKey]).trim();
  }

  return { url, token };
}

async function syncWithKV() {
  const { url, token } = getKVConfig();
  if (!url || !token) return;
  try {
    const res = await fetch(`${url}/get/aptirmiki_db`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json && json.result) {
      const parsed = typeof json.result === "string" ? JSON.parse(json.result) : json.result;
      if (parsed && typeof parsed === "object") {
        const local = readDB();
        let shouldSaveLocal = false;

        if (Array.isArray(parsed.orders) && parsed.orders.length > 0) {
          parsed.orders.forEach((remoteOrder) => {
            if (!remoteOrder || !remoteOrder.id) return;
            const localIdx = local.orders.findIndex((l) => matchOrderId(l, remoteOrder.id));
            if (localIdx === -1) {
              local.orders.push(remoteOrder);
              shouldSaveLocal = true;
            } else {
              const remoteTime = new Date(remoteOrder.updatedAt || remoteOrder.createdAt || 0).getTime();
              const localTime = new Date(local.orders[localIdx].updatedAt || local.orders[localIdx].createdAt || 0).getTime();
              if (remoteTime >= localTime) {
                local.orders[localIdx] = remoteOrder;
                shouldSaveLocal = true;
              }
            }
          });
        } else if (local.orders.length > 0) {
          await pushToKV(local);
        }

        if (parsed.seq && parsed.seq > (local.seq || 0)) {
          local.seq = parsed.seq;
          shouldSaveLocal = true;
        }

        if (Array.isArray(parsed.products)) {
          const remoteProdTime = new Date(parsed.productsUpdatedAt || 0).getTime();
          const localProdTime = new Date(local.productsUpdatedAt || 0).getTime();
          if (remoteProdTime > localProdTime) {
            local.products = parsed.products;
            local.productsUpdatedAt = parsed.productsUpdatedAt;
            shouldSaveLocal = true;
          } else if (localProdTime > remoteProdTime) {
            await pushToKV(local);
          } else if (!local.products || local.products.length === 0) {
            local.products = parsed.products;
            local.productsUpdatedAt = parsed.productsUpdatedAt;
            shouldSaveLocal = true;
          }
        }

        if (shouldSaveLocal) {
          global.GLOBAL_DB = local;
          try {
            ensureDb();
            fs.writeFileSync(DB_PATH, JSON.stringify(local, null, 2), "utf-8");
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    console.error("syncWithKV error:", err.message);
  }
}

async function pushToKV(data) {
  const { url, token } = getKVConfig();
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/aptirmiki_db`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error("KV push sync error:", err.message);
  }
}

function writeDB(data) {
  global.GLOBAL_DB = data;
  pushToKV(data).catch(() => {});
  try {
    ensureDb();
    const tempPath = `${DB_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, jsonStr, "utf-8");
    try {
      fs.renameSync(tempPath, DB_PATH);
    } catch (renameErr) {
      // Fallback for Windows if file is temporarily locked
      fs.writeFileSync(DB_PATH, jsonStr, "utf-8");
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
    }
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
  const now = new Date().toISOString();
  product.updatedAt = now;
  data.productsUpdatedAt = now;
  data.products.push(product);
  writeDB(data);
  return product;
}

function updateProduct(id, updater) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase().trim();
  const idx = data.products.findIndex((p) => String(p.id).toLowerCase().trim() === targetId);
  if (idx === -1) return null;
  if (typeof updater === "function") {
    data.products[idx] = updater({ ...data.products[idx] });
  } else if (updater && typeof updater === "object") {
    data.products[idx] = { ...data.products[idx], ...updater };
  }
  if (data.products[idx].price !== undefined) {
    data.products[idx].price = Number(data.products[idx].price) || 0;
  }
  if (data.products[idx].supplierPrice !== undefined) {
    data.products[idx].supplierPrice = Number(data.products[idx].supplierPrice) || 0;
  }
  const now = new Date().toISOString();
  data.products[idx].updatedAt = now;
  data.productsUpdatedAt = now;
  writeDB(data);
  return data.products[idx];
}

function deleteProduct(id) {
  const data = readDB();
  const targetId = String(id || "").toLowerCase().trim();
  const idx = data.products.findIndex((p) => String(p.id).toLowerCase().trim() === targetId);
  if (idx === -1) return null;
  const [removed] = data.products.splice(idx, 1);
  data.productsUpdatedAt = new Date().toISOString();
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
  if (!order.createdAt) order.createdAt = new Date().toISOString();
  order.updatedAt = new Date().toISOString();
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
  data.orders[idx].updatedAt = new Date().toISOString();
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
  syncWithKV,
  pushToKV,
};
