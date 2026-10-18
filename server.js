const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const requireAdmin = require("./middleware/requireadmin");
const webhookRoute = require("./routes/webhookroute");
const adminRoute = require("./routes/adminroute");
const adminApiRoute = require("./routes/adminApiroute");
const websiteRoute = require("./routes/websiteroute");

const app = express();

// behind Railway's proxy: needed so req.ip is the visitor, not the proxy
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:3039",
  "http://localhost:5173",
  "https://www.homeclinic24.com",
  "https://homeclinic24.com",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "Homeclinic24-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 15 * 60 * 1000 }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.use("/webhook", webhookRoute);
app.use("/admin", adminRoute);
app.use("/api/website-booking", websiteRoute);
app.use("/api/admin", requireAdmin, adminApiRoute);

app.get("/", (req, res) => {
  res.send("Homeclinic24 Healthcare Bot is live ✅");
});

module.exports = app;