const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { products } = require("../products");
const db = require("../db");
const { STATUS_FLOW } = require("../status");

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, db.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const unique = crypto.randomBytes(8).toString("hex");
    cb(null, `${req.params.id}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("File harus berupa gambar (foto bukti transfer)."));
    }
    cb(null, true);
  },
});

const DELIVERY_METHODS = [
  "Ambil di Booth",
  "Antar ke Kamar Hotel",
  "Antar ke Lokasi RTA",
];

// POST /api/orders -> buat pesanan baru
router.post("/", (req, res) => {
  const { customer, items } = req.body || {};

  const name = customer && customer.name ? String(customer.name).trim() : "";
  const wa = customer && customer.wa ? String(customer.wa).trim() : "";
  const instansi = customer && customer.instansi ? String(customer.instansi).trim() : "";
  const method = customer && customer.method ? customer.method : "";
  const detail = customer && customer.detail ? String(customer.detail).trim() : "";

  if (!name || !wa || !instansi || !method) {
    return res.status(400).json({ error: "Data pemesan belum lengkap." });
  }
  if (!DELIVERY_METHODS.includes(method)) {
    return res.status(400).json({ error: "Metode pengambilan tidak valid." });
  }
  if (method !== "Ambil di Booth" && !detail) {
    return res.status(400).json({ error: "Mohon isi detail lokasi pengiriman (nomor kamar / titik lokasi)." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Keranjang masih kosong." });
  }

  const lineItems = [];
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return res.status(400).json({ error: `Produk tidak ditemukan: ${item.productId}` });
    }
    const qty = Number(item.qty);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res.status(400).json({ error: `Jumlah tidak valid untuk ${product.name}` });
    }
    lineItems.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      qty,
      subtotal: product.price * qty,
    });
  }

  const total = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  const id = db.nextOrderId();

  const order = {
    id,
    createdAt: new Date().toISOString(),
    customer: {
      name,
      wa,
      instansi,
      method,
      detail,
    },
    items: lineItems,
    total,
    status: STATUS_FLOW[0].key,
    proof: null,
  };

  db.saveOrder(order);
  res.status(201).json(order);
});

// GET /api/orders/track?query=APT-8821 atau nomor WA
router.get("/track", (req, res) => {
  const query = (req.query.query || "").toString().trim();
  if (!query) return res.status(400).json({ error: "Masukkan ID Pesanan atau Nomor WhatsApp." });

  let results = [];
  const byId = db.findOrderById(query.startsWith("APT-") || query.startsWith("apt-") ? query : `APT-${query}`);
  if (byId) {
    results = [byId];
  } else if (/^\+?\d[\d\s-]{5,}$/.test(query)) {
    results = db.findOrdersByWa(query);
  } else {
    // try exact match by id without APT- prefix
    const tryDirect = db.findOrderById(query);
    if (tryDirect) results = [tryDirect];
  }

  if (results.length === 0) {
    return res.status(404).json({ error: "Pesanan tidak ditemukan. Periksa kembali ID atau Nomor WhatsApp." });
  }

  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ orders: results, statusFlow: STATUS_FLOW });
});

// GET /api/orders/:id -> detail satu pesanan (untuk halaman konfirmasi)
router.get("/:id", (req, res) => {
  const order = db.findOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  res.json({ order, statusFlow: STATUS_FLOW });
});

// POST /api/orders/:id/proof -> upload bukti transfer
router.post("/:id/proof", (req, res, next) => {
  const order = db.findOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan." });
  req.existingOrder = order;
  next();
}, upload.single("proof"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "File bukti transfer wajib diunggah." });
  
  // Cleanup old proof file if exists
  if (req.existingOrder && req.existingOrder.proof && req.existingOrder.proof.filename) {
    const oldPath = path.join(db.UPLOADS_DIR, req.existingOrder.proof.filename);
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch (e) {}
    }
  }

  let dataUrl = "";
  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const mimeType = req.file.mimetype || "image/jpeg";
    dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
  } catch (err) {
    console.error("Base64 proof conversion error:", err);
  }

  const updated = db.updateOrder(req.params.id, (o) => {
    o.proof = {
      filename: req.file.filename,
      dataUrl,
      uploadedAt: new Date().toISOString()
    };
    return o;
  });
  res.json({ order: updated });
});

module.exports = router;
