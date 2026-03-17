const router = require("express").Router();
const starController = require("../controllers/starController");
const auth = require("../middleware/authMiddleware");
const { starValidation, validate } = require("../middleware/validation");

// Get all starred items
router.get("/", auth, starController.getStarredItems);

// Star an item
router.post("/", auth, starValidation, validate, starController.starItem);

// Unstar an item
router.delete("/:type/:id", auth, starController.unstarItem);

module.exports = router;