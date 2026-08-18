const express = require("express");
const db = require("../db");
const { CATEGORIES } = require("../products");

const router = express.Router();

router.get("/", async (req, res) => {
  await db.syncWithKV();
  res.json({ products: db.getProducts(), categories: CATEGORIES });
});

module.exports = router;
