const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { products } = require("../products");
const { STATUS_FLOW, isValidStatus } = require("../status");

const router = express.Router();

router.use(async (req, res, next) => {
  try {
    await db.syncWithKV();
  } catch (e) {}
  next();
});

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 jam

function createSession() {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const hmac = crypto.createHmac("sha256", adminPassword).update(expiresAt.toString()).digest("hex");
  return `${expiresAt}.${hmac}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const [expiresStr, signature] = token.split(".");
  const expiresAt = Number(expiresStr);
  if (!expiresAt || isNaN(expiresAt) || expiresAt < Date.now()) return false;

  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  const expectedSignature = crypto.createHmac("sha256", adminPassword).update(expiresStr).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch (e) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: "Sesi admin tidak valid atau sudah habis. Silakan login kembali." });
  }
  next();
}



router.post("/login", (req, res) => {
  const { password } = req.body || {};
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  if (password !== adminPassword) {
    return res.status(401).json({ error: "Password salah." });
  }
  const token = createSession();
  res.json({ token });
});

router.post("/logout", requireAdmin, (req, res) => {
  res.json({ ok: true });
});

router.get("/orders", requireAdmin, async (req, res) => {
  await db.syncWithKV();
  const orders = db.getOrders().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ orders, statusFlow: STATUS_FLOW });
});

router.put("/orders/:id", requireAdmin, async (req, res) => {
  const { customer, items, status, total } = req.body || {};
  const order = db.findOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });

  const updated = db.updateOrder(req.params.id, (o) => {
    if (customer && typeof customer === "object") {
      o.customer = {
        ...o.customer,
        name: customer.name !== undefined ? String(customer.name).trim() : o.customer.name,
        wa: customer.wa !== undefined ? String(customer.wa).trim() : o.customer.wa,
        instansi: customer.instansi !== undefined ? String(customer.instansi).trim() : o.customer.instansi,
        method: customer.method !== undefined ? String(customer.method).trim() : o.customer.method,
        detail: customer.detail !== undefined ? String(customer.detail).trim() : o.customer.detail,
        targetBank: customer.targetBank !== undefined ? String(customer.targetBank).trim() : o.customer.targetBank,
      };
    }
    if (status && isValidStatus(status)) {
      o.status = status;
    }
    if (Array.isArray(items) && items.length > 0) {
      o.items = items.map((i) => ({
        productId: i.productId || i.id,
        name: i.name,
        brand: i.brand || "Umum",
        price: Number(i.price) || 0,
        unit: i.unit || "pcs",
        qty: Number(i.qty) || 1,
        subtotal: (Number(i.price) || 0) * (Number(i.qty) || 1),
      }));
      o.total = o.items.reduce((s, it) => s + it.subtotal, 0);
    } else if (total !== undefined) {
      o.total = Number(total) || 0;
    }
    o.updatedAt = new Date().toISOString();
    return o;
  });

  if (!updated) return res.status(404).json({ error: "Gagal memperbarui pesanan." });
  await db.pushToKV(db.readDB());
  res.json({ ok: true, order: updated });
});

router.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!isValidStatus(status)) {
    return res.status(400).json({ error: "Status tidak valid." });
  }
  const updated = db.updateOrder(req.params.id, (o) => {
    o.status = status;
    o.updatedAt = new Date().toISOString();
    return o;
  });
  if (!updated) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  await db.pushToKV(db.readDB());
  res.json({ order: updated });
});

router.delete("/orders/:id", requireAdmin, async (req, res) => {
  const deleted = db.deleteOrder(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  res.json({ ok: true, deletedId: deleted.id });
});

router.post("/orders/clear-all", requireAdmin, async (req, res) => {
  db.clearAllOrders();
  await db.pushToKV(db.readDB());
  res.json({ ok: true, message: "Semua data pesanan berhasil dikosongkan." });
});

router.get("/categories", requireAdmin, (req, res) => {
  const products = db.getProducts();
  const catSet = new Set();
  products.forEach((p) => {
    if (p.category) catSet.add(p.category.trim());
  });
  res.json({ categories: Array.from(catSet) });
});

// ===== Product Management Endpoints =====
function convertDriveUrl(url) {
  if (!url || typeof url !== "string") return url || "";
  const trimmed = url.trim();
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
  }
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
  }
  return trimmed;
}

// ===== Product Management Endpoints =====
router.get("/products", requireAdmin, async (req, res) => {
  await db.syncWithKV();
  res.json({ products: db.getProducts() });
});

router.post("/products", requireAdmin, async (req, res) => {
  await db.syncWithKV();
  const { name, brand, category, price, supplierPrice, unit, origin, expiryDetail, description, image, stock } = req.body || {};
  if (!name || !category || !price || !unit) {
    return res.status(400).json({ error: "Nama, kategori, harga, dan satuan produk wajib diisi." });
  }

  const slug = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const id = `${slug}-${Date.now().toString(36)}`;

  const sellingPrice = Number(price) || 0;
  const costPrice = supplierPrice !== undefined && supplierPrice !== "" ? Number(supplierPrice) : Math.round(sellingPrice * 0.7);

  const newProduct = {
    id,
    name: String(name).trim(),
    brand: brand ? String(brand).trim() : "Betawi Asli",
    category: String(category).trim(),
    price: sellingPrice,
    supplierPrice: costPrice,
    unit: String(unit).trim(),
    stock: stock !== undefined && stock !== null && stock !== "" ? Number(stock) : null,
    origin: origin ? String(origin).trim() : "Betawi, Jakarta",
    expiryDetail: expiryDetail ? String(expiryDetail).trim() : "Tahan Lama",
    description: description ? String(description).trim() : "",
    image: image ? convertDriveUrl(String(image)) : "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop&auto=format&q=80",
  };

  db.saveProduct(newProduct);
  await db.pushToKV(db.readDB());
  res.json({ ok: true, product: newProduct });
});

router.put("/products/:id", requireAdmin, async (req, res) => {
  await db.syncWithKV();
  const { name, brand, category, price, supplierPrice, unit, origin, expiryDetail, description, image, stock } = req.body || {};
  const updates = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (brand !== undefined) updates.brand = String(brand).trim();
  if (category !== undefined) updates.category = String(category).trim();
  if (price !== undefined) updates.price = Number(price) || 0;
  if (supplierPrice !== undefined && supplierPrice !== "") updates.supplierPrice = Number(supplierPrice) || 0;
  if (unit !== undefined) updates.unit = String(unit).trim();
  if (stock !== undefined) updates.stock = stock !== null && stock !== "" ? Number(stock) : null;
  if (origin !== undefined) updates.origin = String(origin).trim();
  if (expiryDetail !== undefined) updates.expiryDetail = String(expiryDetail).trim();
  if (description !== undefined) updates.description = String(description).trim();
  if (image !== undefined) updates.image = convertDriveUrl(String(image));

  const updated = db.updateProduct(req.params.id, updates);
  if (!updated) return res.status(404).json({ error: "Produk tidak ditemukan." });
  await db.pushToKV(db.readDB());
  res.json({ ok: true, product: updated });
});

router.delete("/products/:id", requireAdmin, async (req, res) => {
  await db.syncWithKV();
  const deleted = db.deleteProduct(req.params.id);
  if (!deleted) return res.status(404).json({ error: "Produk tidak ditemukan." });
  await db.pushToKV(db.readDB());
  res.json({ ok: true, deletedId: deleted.id });
});

router.get("/summary", requireAdmin, async (req, res) => {
  await db.syncWithKV();
  const orders = db.getOrders();
  const allProducts = db.getProducts();

  const prodMap = {};
  for (const p of allProducts) {
    const sellPrice = Number(p.price) || 0;
    const suppPrice = p.supplierPrice !== undefined ? Number(p.supplierPrice) : Math.round(sellPrice * 0.7);
    prodMap[p.id] = {
      ...p,
      brand: p.brand || "Umum",
      price: sellPrice,
      supplierPrice: suppPrice,
      profitPerUnit: sellPrice - suppPrice,
      totalQty: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalProfit: 0,
    };
  }

  // Bank summary accumulator
  const bankMap = {
    BCA: { count: 0, totalRevenue: 0 },
    BSI: { count: 0, totalRevenue: 0 },
    Mandiri: { count: 0, totalRevenue: 0 },
    Lainnya: { count: 0, totalRevenue: 0 },
  };

  for (const order of orders) {
    // Bank grouping
    const bankKey = (order.customer && order.customer.targetBank) || "BCA";
    if (bankMap[bankKey]) {
      bankMap[bankKey].count += 1;
      bankMap[bankKey].totalRevenue += Number(order.total) || 0;
    } else {
      bankMap.Lainnya.count += 1;
      bankMap.Lainnya.totalRevenue += Number(order.total) || 0;
    }

    for (const item of order.items) {
      if (prodMap[item.productId]) {
        const qty = Number(item.qty) || 0;
        const sellPrice = Number(item.price) || Number(prodMap[item.productId].price) || 0;
        const suppPrice = Number(prodMap[item.productId].supplierPrice) || 0;

        prodMap[item.productId].totalQty += qty;
        prodMap[item.productId].totalRevenue += sellPrice * qty;
        prodMap[item.productId].totalCost += suppPrice * qty;
        prodMap[item.productId].totalProfit += (sellPrice - suppPrice) * qty;
      }
    }
  }

  const summary = Object.values(prodMap).map((p) => ({
    productId: p.id,
    name: p.name,
    brand: p.brand || "Umum",
    category: p.category,
    unit: p.unit,
    price: p.price,
    supplierPrice: p.supplierPrice,
    profitPerUnit: p.profitPerUnit,
    totalQty: p.totalQty,
    totalRevenue: p.totalRevenue,
    totalCost: p.totalCost,
    totalProfit: p.totalProfit,
  }));

  // Brand / Supplier breakdown summary accumulator
  const brandMap = {};
  for (const p of summary) {
    const brandName = p.brand || "Umum";
    if (!brandMap[brandName]) {
      brandMap[brandName] = {
        brand: brandName,
        totalQty: 0,
        totalRevenue: 0,
        totalCost: 0,
        totalProfit: 0,
        itemCount: 0,
      };
    }
    brandMap[brandName].totalQty += p.totalQty;
    brandMap[brandName].totalRevenue += p.totalRevenue;
    brandMap[brandName].totalCost += p.totalCost;
    brandMap[brandName].totalProfit += p.totalProfit;
    brandMap[brandName].itemCount += 1;
  }
  const brandSummary = Object.values(brandMap).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const bankSummary = Object.entries(bankMap).map(([key, data]) => ({
    bank: key,
    count: data.count,
    totalRevenue: data.totalRevenue,
  }));

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const totalCost = summary.reduce((sum, p) => sum + p.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const profitMarginPercent = totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(1)) : 0;

  res.json({
    summary,
    bankSummary,
    brandSummary,
    totalOrders,
    totalRevenue,
    totalCost,
    totalProfit,
    profitMarginPercent,
  });
});

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get("/orders/export.csv", requireAdmin, (req, res) => {
  const { bank, brand, type } = req.query || {};
  let orders = db.getOrders().slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (bank) {
    orders = orders.filter((o) => (o.customer && o.customer.targetBank) === bank);
  }
  if (brand) {
    orders = orders.filter((o) => o.items.some((i) => (i.brand || "Umum").toLowerCase() === brand.toLowerCase()));
  }

  // Type = supplier -> export PO Rekap per Produk
  if (type === "supplier") {
    const allProducts = db.getProducts();
    const prodMap = {};
    for (const p of allProducts) {
      const sellPrice = Number(p.price) || 0;
      const suppPrice = p.supplierPrice !== undefined ? Number(p.supplierPrice) : Math.round(sellPrice * 0.7);
      prodMap[p.id] = {
        name: p.name,
        brand: p.brand || "Umum",
        unit: p.unit || "pcs",
        supplierPrice: suppPrice,
        totalQty: 0,
        totalCost: 0,
      };
    }

    for (const order of orders) {
      for (const item of order.items) {
        if (prodMap[item.productId]) {
          const qty = Number(item.qty) || 0;
          prodMap[item.productId].totalQty += qty;
          prodMap[item.productId].totalCost += prodMap[item.productId].supplierPrice * qty;
        }
      }
    }

    let itemsToExport = Object.values(prodMap).filter((p) => p.totalQty > 0);
    if (brand) {
      itemsToExport = itemsToExport.filter((p) => p.brand.toLowerCase() === brand.toLowerCase());
    }
    itemsToExport.sort((a, b) => a.brand.localeCompare(b.brand) || b.totalQty - a.totalQty);

    const header = ["Brand / Supplier", "Nama Produk", "Satuan", "Total Qty Pesanan", "Harga Modal Supplier (Satuan)", "Total Biaya PO ke Supplier"];
    const rows = itemsToExport.map((p) => [
      p.brand,
      p.name,
      p.unit,
      p.totalQty,
      p.supplierPrice,
      p.totalCost,
    ]);

    const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    const bom = "﻿";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    const filenameBrand = brand ? `-${brand.replace(/[^a-zA-Z0-9]/g, "")}` : "";
    res.setHeader("Content-Disposition", `attachment; filename="rekap-po-supplier${filenameBrand}-${Date.now()}.csv"`);
    return res.send(bom + csv);
  }

  const statusLabel = (key) => STATUS_FLOW.find((s) => s.key === key)?.label || key;

  const header = [
    "ID Pesanan",
    "Waktu",
    "Nama Pemesan",
    "Nomor WhatsApp",
    "Instansi/Asal Daerah",
    "Bank Tujuan",
    "Metode Pengambilan",
    "Detail Lokasi",
    "Detail Barang",
    "Total Harga",
    "Status",
    "Bukti Transfer",
  ];

  const rows = orders.map((o) => [
    o.id,
    new Date(o.createdAt).toLocaleString("id-ID"),
    o.customer.name,
    o.customer.wa,
    o.customer.instansi,
    o.customer.targetBank || "BCA",
    o.customer.method,
    o.customer.detail || "",
    o.items.map((i) => `${i.name} (Brand: ${i.brand || "Betawi Asli"}) x${i.qty}`).join("; "),
    o.total,
    statusLabel(o.status),
    o.proof ? o.proof.filename : "Belum upload",
  ]);

  const csv = [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
  const bom = "﻿";
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  const filenameSuffix = bank ? `-${bank}` : brand ? `-${brand}` : "";
  res.setHeader("Content-Disposition", `attachment; filename="rekap-pesanan-aptirmiki${filenameSuffix}-${Date.now()}.csv"`);
  res.send(bom + csv);
});

module.exports = router;
