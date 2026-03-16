const router = require("express").Router();

router.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

module.exports = router;