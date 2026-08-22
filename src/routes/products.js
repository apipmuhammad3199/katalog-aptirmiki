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

  const products = rawProducts.map((p) => {
    if (p.category) catSet.add(p.category);
    if (typeof p.stock === "number") {
      const pId = String(p.id || "").toLowerCase().trim();
      const booked = bookedMap[pId] || 0;
      const remainingStock = Math.max(0, p.stock - booked);
      return {
        ...p,
        stock: remainingStock,
        initialStock: p.stock,
        isSoldOut: remainingStock <= 0,
      };
    }
    return p;
  });

  res.json({ products, categories: Array.from(catSet) });
});

module.exports = router;
