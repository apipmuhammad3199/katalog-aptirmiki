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
  if (!Array.isArray(data.products)) {
    data.products = Array.isArray(defaultProductsModule.products) ? [...defaultProductsModule.products] : [];
    data.productsUpdatedAt = new Date().toISOString();
    shouldWrite = true;
  } else {
    // Auto-merge new default products from products.js if not yet in data.products and not explicitly deleted
    const deletedProdSet = new Set(data.deletedProductIds || []);
    let added = false;
    if (Array.isArray(defaultProductsModule.products)) {
      for (const defProd of defaultProductsModule.products) {
        if (!defProd || !defProd.id || deletedProdSet.has(defProd.id)) continue;
        const existsIdx = data.products.findIndex(
          (p) => String(p.id).toLowerCase().trim() === String(defProd.id).toLowerCase().trim()
        );
        if (existsIdx === -1) {
          data.products.push({ ...defProd });
          added = true;
        } else {
          // Upgrade external/broken URLs to local high-res webp/jpg if available
          if (defProd.image && defProd.image.startsWith("/images/") && !String(data.products[existsIdx].image || "").startsWith("/images/")) {
            data.products[existsIdx].image = defProd.image;
            added = true;
          }
        }
      }
    }
    if (added) {
      data.productsUpdatedAt = new Date().toISOString();
      shouldWrite = true;
    }
  }

  if (!Array.isArray(data.orders)) {
    data.orders = [];
    shouldWrite = true;
  }

  if (!Array.isArray(data.deletedOrderIds)) {
    data.deletedOrderIds = [];
  }

  if (!Array.isArray(data.deletedProductIds)) {
    data.deletedProductIds = [];
  }

  if (shouldWrite) {
    writeDB(data);
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

function hasPersistentStorage() {
  const { url, token } = getKVConfig();
  return Boolean(url && token);
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

        // Sync deleted order IDs from remote
        if (Array.isArray(parsed.deletedOrderIds)) {
          if (!Array.isArray(local.deletedOrderIds)) local.deletedOrderIds = [];
          parsed.deletedOrderIds.forEach((delId) => {
            if (!local.deletedOrderIds.includes(delId)) {
              local.deletedOrderIds.push(delId);
            }
            const lIdx = local.orders.findIndex((l) => matchOrderId(l, delId));
            if (lIdx !== -1) {
              local.orders.splice(lIdx, 1);
              shouldSaveLocal = true;
            }
          });
        }

        // Sync orders
        const deletedOrderSet = new Set(local.deletedOrderIds || []);
        if (Array.isArray(parsed.orders) && parsed.orders.length > 0) {
          parsed.orders.forEach((remoteOrder) => {
            if (!remoteOrder || !remoteOrder.id) return;
            if (deletedOrderSet.has(remoteOrder.id)) return; // Don't re-add deleted orders
            const localIdx = local.orders.findIndex((l) => matchOrderId(l, remoteOrder.id));
            if (localIdx === -1) {
              local.orders.push(remoteOrder);
              shouldSaveLocal = true;
            } else {
              const remoteTime = new Date(remoteOrder.updatedAt || remoteOrder.createdAt || 0).getTime();
              const localTime = new Date(local.orders[localIdx].updatedAt || local.orders[localIdx].createdAt || 0).getTime();
              if (remoteTime > localTime) {
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

        // Sync deleted product IDs
        if (Array.isArray(parsed.deletedProductIds)) {
          if (!Array.isArray(local.deletedProductIds)) local.deletedProductIds = [];
          parsed.deletedProductIds.forEach((delId) => {
            if (!local.deletedProductIds.includes(delId)) local.deletedProductIds.push(delId);
            const pIdx = local.products.findIndex((p) => String(p.id).toLowerCase().trim() === String(delId).toLowerCase().trim());
            if (pIdx !== -1) {
              local.products.splice(pIdx, 1);
              shouldSaveLocal = true;
            }
          });
        }

        // Sync products
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
  if (!url || !token) {
    if (isVercel) {
      throw new Error("Penyimpanan permanen belum dikonfigurasi. Tambahkan KV_REST_API_URL dan KV_REST_API_TOKEN di Vercel.");
    }
    return;
  }
  try {
    const res = await fetch(`${url}/set/aptirmiki_db`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Penyimpanan data gagal (${res.status}).`);
    }
  } catch (err) {
    console.error("KV push sync error:", err.message);
    throw err;
  }
}

function writeDB(data) {
  global.GLOBAL_DB = data;
  pushToKV(data).catch((err) => console.error("writeDB KV sync error:", err.message));
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
  if (!Array.isArray(data.deletedProductIds)) data.deletedProductIds = [];
  if (!data.deletedProductIds.includes(removed.id)) {
    data.deletedProductIds.push(removed.id);
  }
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
  const itemRaw = String(o.id).toLowerCase().trim();
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
  if (!Array.isArray(data.deletedOrderIds)) data.deletedOrderIds = [];
  if (!data.deletedOrderIds.includes(removed.id)) {
    data.deletedOrderIds.push(removed.id);
  }
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
  hasPersistentStorage,
};
