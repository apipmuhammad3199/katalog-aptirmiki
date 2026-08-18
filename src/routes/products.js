const express = require("express");
const db = require("../db");
const { CATEGORIES } = require("../products");

const router = express.Router();

router.get("/", async (req, res) => {
  await db.syncWithKV();
  const products = db.getProducts();
  const catSet = new Set(CATEGORIES);
  products.forEach((p) => {
    if (p.category) catSet.add(p.category);
  });
  res.json({ products, categories: Array.from(catSet) });
});

module.exports = router;
