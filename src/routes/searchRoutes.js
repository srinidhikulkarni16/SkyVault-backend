const router = require("express").Router();
const searchController = require("../controllers/searchController");
const auth = require("../middleware/authMiddleware");

router.get("/", auth, searchController.search);

module.exports = router;