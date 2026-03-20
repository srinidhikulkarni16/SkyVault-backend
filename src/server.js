require("dotenv").config();
const express      = require("express");
const path         = require("path");
const cors         = require("cors");
const rateLimit    = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");

const app = express();

//  CORS 
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: false,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

//  Body parsing 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//  Rate limiting 
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
}));

//  Health check 
app.get("/api/health", (req, res) => res.json({ status: "ok", message: "SkyVault API 🚀" }));

//  API Routes 
app.use("/api/auth",    require("./routes/authRoutes"));
app.use("/api/files",   require("./routes/fileRoutes"));
app.use("/api/folders", require("./routes/folderRoutes"));
app.use("/api/shares",  require("./routes/shareRoutes"));
app.use("/api/stars",   require("./routes/starRoutes"));
app.use("/api/trash",   require("./routes/trashRoutes"));
app.use("/api/search",  require("./routes/searchRoutes"));
app.use("/api/utility", require("./routes/utilityRoutes"));

//  Serve frontend 
app.use(express.static(path.join(__dirname, "../frontend/build")));

// SPA fallback: send index.html for any GET request that doesn't start with /api
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build/index.html"));
});

//  Error handler 
app.use(errorHandler);

//  Start server 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ SkyVault running on http://localhost:${PORT}`));