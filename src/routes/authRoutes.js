const router = require("express").Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");
const { registerValidation, loginValidation, validate } = require("../middleware/validation");

router.post("/register", registerValidation, validate, authController.register);
router.post("/login", loginValidation, validate, authController.login);
router.get("/me", auth, authController.getProfile);

module.exports = router;