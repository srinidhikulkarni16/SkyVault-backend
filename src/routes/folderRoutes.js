const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const folderController = require("../controllers/folderController");
const checkPerm = require("../middleware/permissionMiddleware");

// CREATE FOLDER
router.post("/", auth, folderController.createFolder);

// GET FOLDERS
router.get("/", auth, folderController.getFolders);

// RENAME FOLDER
router.patch("/:id/rename", auth, checkPerm('folder', 'owner'), folderController.renameFolder);

// MOVE FOLDER
router.patch("/:id/move", auth, checkPerm('folder', 'owner'), folderController.moveFolder);

//  DELETE FOLDER
router.delete("/:id", auth, checkPerm('folder', 'owner'), folderController.deleteFolder);

module.exports = router;