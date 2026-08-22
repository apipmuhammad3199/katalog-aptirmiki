const express = require("express");
const db = require("../db");
const { CATEGORIES } = require("../products");

const router = express.Router();

router.get("/", async (req, res) => {
  await db.syncWithKV();
  const rawProducts = db.getProducts();
  const orders = db.getOrders() || [];
  const catSet = new Set(CATEGORIES);

  // Calculate booked quantities for products with stock
  const bookedMap = {};
  orders
    .filter((o) => o && o.status !== "dibatalkan")
    .forEach((o) => {
      (o.items || []).forEach((it) => {
        const pId = String(it.productId || it.id || "").toLowerCase().trim();
        bookedMap[pId] = (bookedMap[pId] || 0) + (Number(it.qty) || 0);
      });
    });

  const defaultProducts = require("../products").products || [];
  const defaultMap = new Map();
  defaultProducts.forEach((dp) => { if (dp && dp.id) defaultMap.set(String(dp.id).toLowerCase().trim(), dp); });

  const products = rawProducts.map((p) => {
    if (p.category) catSet.add(p.category);
    const pId = String(p.id || "").toLowerCase().trim();
    const def = defaultMap.get(pId);
    const baseStock = typeof p.stock === "number" ? p.stock : (def && typeof def.stock === "number" ? def.stock : null);

    if (baseStock !== null) {
      const booked = bookedMap[pId] || 0;
      const remainingStock = Math.max(0, baseStock - booked);
      return {
        ...p,
        stock: remainingStock,
        initialStock: baseStock,
        isSoldOut: remainingStock <= 0,
      };
    }
    return p;
  });

  res.json({ products, categories: Array.from(catSet) });
});

module.exports = router;
