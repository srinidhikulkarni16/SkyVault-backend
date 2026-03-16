const router = require("express").Router();
const starController = require("../controllers/starController");
const auth = require("../middleware/authMiddleware");
const { starValidation, validate } = require("../middleware/validation");

router.post("/", auth, starValidation, validate, starController.starItem);
router.delete("/:type/:id", auth, starController.unstarItem);

module.exports = router;