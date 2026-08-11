const express = require("express");
const db = require("../db");
const { CATEGORIES } = require("../products");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ products: db.getProducts(), categories: CATEGORIES });
});

module.exports = router;
