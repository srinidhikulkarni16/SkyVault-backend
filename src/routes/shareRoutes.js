const router = require("express").Router();
const shareController = require("../controllers/shareController");
const auth = require("../middleware/authMiddleware");
const { shareValidation, validate } = require("../middleware/validation");

// Share with user
router.post("/", auth, shareValidation, validate, shareController.shareWithUser);

// Create public link
router.post("/link", auth, shareController.createPublicLink);

// Get all shares for a resource
router.get("/:type/:id", auth, shareController.getShares);

// Revoke a user share
router.delete("/:id", auth, shareController.revokeShare);

// Delete public link
router.delete("/link/:id", auth, shareController.deletePublicLink);

// Access resource via public link (no auth required)
router.get("/public/:token", shareController.accessPublicLink);
router.post("/public/:token", shareController.accessPublicLink); // For password-protected links

module.exports = router;