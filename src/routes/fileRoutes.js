const express = require("express");
const router = express.Router();

const fileController = require("../controllers/fileController");
const auth = require("../middleware/authMiddleware");
const checkPerm = require("../middleware/permissionMiddleware");
const upload = require("../middleware/upload");
const { moveValidation, validate } = require("../middleware/validation");

router.post("/upload", auth, upload.single("file"), fileController.uploadFile);
router.get("/", auth, fileController.getFiles);
router.get("/recent", auth, fileController.getRecentFiles);

router.patch("/:id/rename", auth, checkPerm('file', 'owner'), fileController.renameFile);
router.patch("/:id/move", auth, checkPerm('file', 'owner'), moveValidation, validate, fileController.moveFile); // ENABLED

router.delete("/:id", auth, checkPerm('file', 'owner'), fileController.deleteFile);
router.get("/:id/download", auth, checkPerm('file', 'viewer'), fileController.downloadFile);

module.exports = router;