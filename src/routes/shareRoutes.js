const router = require("express").Router();
const shareController = require("../controllers/shareController");
const auth = require("../middleware/authMiddleware");
const { shareValidation, validate } = require("../middleware/validation");

router.post("/", auth, shareValidation, validate, shareController.shareWithUser);
router.post("/link", auth, shareController.createPublicLink);

module.exports = router;