const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const folderController = require("../controllers/folderController");

// CREATE FOLDER
router.post("/", auth, folderController.createFolder);

// GET FOLDERS
router.get("/", auth, folderController.getFolders);

module.exports = router;