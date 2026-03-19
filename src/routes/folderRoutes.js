const express = require("express");
const router = express.Router();

const auth = require("../middleware/authMiddleware");
const folderController = require("../controllers/folderController");
const checkPerm = require("../middleware/permissionMiddleware");

//  CREATE FOLDER 
router.post("/", auth, async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized: user missing" });
    await folderController.createFolder(req, res);
  } catch (err) {
    next(err);
  }
});

//  GET FOLDERS 
router.get("/", auth, async (req, res, next) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized: user missing" });
    await folderController.getFolders(req, res);
  } catch (err) {
    next(err);
  }
});

//  RENAME FOLDER 
router.patch("/:id/rename", auth, checkPerm('folder', 'owner'), async (req, res, next) => {
  try {
    await folderController.renameFolder(req, res);
  } catch (err) {
    next(err);
  }
});

//  MOVE FOLDER 
router.patch("/:id/move", auth, checkPerm('folder', 'owner'), async (req, res, next) => {
  try {
    await folderController.moveFolder(req, res);
  } catch (err) {
    next(err);
  }
});

//  DELETE FOLDER 
router.delete("/:id", auth, checkPerm('folder', 'owner'), async (req, res, next) => {
  try {
    await folderController.deleteFolder(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;