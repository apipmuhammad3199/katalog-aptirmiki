const express = require("express");
const db = require("../db");
const { CATEGORIES } = require("../products");

const router = express.Router();

router.get("/", async (req, res) => {
  await db.syncWithKV();
  const rawProducts = db.getProducts();
  const catSet = new Set(CATEGORIES);

  const products = rawProducts.map((p) => {
    if (p.category) catSet.add(p.category);
    if (typeof p.stock === "number") {
      return {
        ...p,
        stock: p.stock,
        isSoldOut: p.stock <= 0,
      };
    }
    return p;
  });

  res.json({ products, categories: Array.from(catSet) });
});

module.exports = router;
