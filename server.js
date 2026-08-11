require("dotenv").config();

const express = require("express");
const path = require("path");
const db = require("./src/db");

const productsRouter = require("./src/routes/products");
const ordersRouter = require("./src/routes/orders");
const adminRouter = require("./src/routes/admin");

db.ensureDb();

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.resolve(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));
app.use("/uploads", express.static(db.UPLOADS_DIR));

function formatWaNumber(num) {
  let clean = String(num || "").replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "62" + clean.slice(1);
  }
  return clean || "6281234567890";
}

// Konfigurasi publik (nomor WA admin, info bank/QRIS, nama acara) untuk frontend.
app.get("/api/config", (req, res) => {
  res.json({
    eventName: process.env.EVENT_NAME || "APTIRMIKI",
    adminWaNumber: formatWaNumber(process.env.ADMIN_WA_NUMBER || "6281234567890"),
    bank: {
      name: process.env.BANK_NAME || "Bank Central Asia (BCA)",
      accountNumber: process.env.BANK_ACCOUNT_NUMBER || "1234567890",
      accountName: process.env.BANK_ACCOUNT_NAME || "Panitia APTIRMIKI",
    },
    qrisImageUrl: process.env.QRIS_IMAGE_URL || "",
  });
});

app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/admin", adminRouter);

app.get("/admin", (req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use("/api/*", (req, res) => {
  res.status(404).json({ error: "Endpoint API tidak ditemukan." });
});

// Error handler (termasuk error dari multer, mis. file terlalu besar / bukan gambar)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || "Terjadi kesalahan pada server." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Katalog APTIRMIKI berjalan di http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
