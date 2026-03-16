require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Security Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100 
}));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/files", require("./routes/fileRoutes"));
app.use("/api/folders", require("./routes/folderRoutes"));
app.use("/api/shares", require("./routes/shareRoutes"));
app.use("/api/trash", require("./routes/trashRoutes"));
app.use("/api/stars", require("./routes/starRoutes"));
app.use("/api/utility", require("./routes/utilityRoutes"));

// Error Handling
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server optimized and running on port ${PORT}`);
});

app.get("/", (req, res) => {
  res.send("SkyVault Backend is running 🚀");
});