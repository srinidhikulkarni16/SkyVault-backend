const router = require("express").Router();
const trashController = require("../controllers/trashController");
const auth = require("../middleware/authMiddleware");

router.get("/",           auth, trashController.getTrash);
router.post("/restore",   auth, trashController.restoreItem);

// ✅ /empty must be before /:type/:id — otherwise "empty" matches as :type
router.delete("/empty",      auth, trashController.emptyTrash);
router.delete("/:type/:id",  auth, trashController.permanentDelete);

module.exports = router;