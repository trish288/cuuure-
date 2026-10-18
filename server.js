const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");

const webhookRoute = require("./routes/webhookroute");
const adminRoute = require("./routes/adminroute");
const adminApiRoute = require("./routes/adminApiroute");

const app = express();

const allowedOrigins = [
  "http://localhost:3039",
  "http://localhost:5173",
  "https://www.homeclinic24.com",
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
app.use("/api/admin", adminApiRoute);

app.get("/", (req, res) => {
  res.send("Homeclinic24 Healthcare Bot is live ✅");
});

module.exports = app;