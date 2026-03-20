const router = require("express").Router();
const shareController = require("../controllers/shareController");
const auth = require("../middleware/authMiddleware");
const { shareValidation, validate } = require("../middleware/validation");

// Static routes MUST come before wildcard /:type/:id
router.post("/",           auth, shareValidation, validate, shareController.shareWithUser);
router.post("/link",       auth, shareController.createPublicLink);
router.get("/public/:token",  shareController.accessPublicLink);
router.post("/public/:token", shareController.accessPublicLink);

// Wildcard routes last
router.get("/:type/:id",   auth, shareController.getShares);
router.delete("/:id",      auth, shareController.revokeShare);
router.delete("/link/:id", auth, shareController.deletePublicLink);

module.exports = router;