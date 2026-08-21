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
  return clean || "6287714001013";
}

// Konfigurasi publik (nomor WA admin, info bank/QRIS, nama acara) untuk frontend.
app.get("/api/config", (req, res) => {
  const bcaNumber = (process.env.BCA_ACCOUNT_NUMBER || process.env.BANK_ACCOUNT_NUMBER || "").trim();
  const bcaName = (process.env.BCA_ACCOUNT_NAME || process.env.BANK_ACCOUNT_NAME || "").trim();
  const bsiNumber = (process.env.BSI_ACCOUNT_NUMBER || "").trim();
  const bsiName = (process.env.BSI_ACCOUNT_NAME || "").trim();
  const mandiriNumber = (process.env.MANDIRI_ACCOUNT_NUMBER || "").trim();
  const mandiriName = (process.env.MANDIRI_ACCOUNT_NAME || "").trim();

  const finalBcaNumber = bcaNumber && bcaNumber !== "1234567890" ? bcaNumber : "7235088592";
  const finalBcaName = bcaName && bcaName !== "Panitia APTIRMIKI" ? bcaName : "AMIK Panitia APTIRMIKI";
  const finalBsiNumber = bsiNumber && bsiNumber !== "7700123456" ? bsiNumber : "7360123728";
  const finalBsiName = bsiName && bsiName !== "Panitia APTIRMIKI (BSI)" ? bsiName : "APTIRMIKI KORWIL 3 (BSI)";
  const finalMandiriNumber = mandiriNumber && mandiriNumber !== "137001234567" ? mandiriNumber : "1110021969031";
  const finalMandiriName = mandiriName && mandiriName !== "Panitia APTIRMIKI (Mandiri)" ? mandiriName : "Puteri Fannya (Panitia APTIRMIKI)";

  const defaultBank = {
    name: process.env.BANK_NAME || "Bank Central Asia (BCA)",
    accountNumber: finalBcaNumber,
    accountName: finalBcaName,
  };

  const banks = [
    {
      key: "BCA",
      name: process.env.BCA_NAME || process.env.BANK_NAME || "Bank Central Asia (BCA)",
      accountNumber: finalBcaNumber,
      accountName: finalBcaName,
    },
    {
      key: "BSI",
      name: process.env.BSI_NAME || "Bank Syariah Indonesia (BSI)",
      accountNumber: finalBsiNumber,
      accountName: finalBsiName,
    },
    {
      key: "Mandiri",
      name: process.env.MANDIRI_NAME || "Bank Mandiri",
      accountNumber: finalMandiriNumber,
      accountName: finalMandiriName,
    },
  ];

  res.json({
    eventName: process.env.EVENT_NAME || "APTIRMIKI",
    adminWaNumber: formatWaNumber(process.env.ADMIN_WA_NUMBER || "6287714001013"),
    bank: defaultBank,
    banks,
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
