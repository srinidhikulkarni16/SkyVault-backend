const multer = require("multer");

// Use memory storage so we can upload buffer directly to Supabase Storage
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100 MB default
  },
  fileFilter: (req, file, cb) => {
    // Block only truly dangerous executables — allow everything else
    const BLOCKED = [
      'application/x-msdownload',       // .exe
      'application/x-executable',
      'application/x-sh',               // shell scripts
      'application/x-bat',
      'application/x-msdos-program',
    ];

    if (BLOCKED.includes(file.mimetype)) {
      return cb(new Error(`File type "${file.mimetype}" is not allowed for security reasons`), false);
    }

    cb(null, true); // Allow all other types
  },
});

module.exports = upload;