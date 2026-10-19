const express = require("express");
const path = require("path");

const router = express.Router();

const ADMINS = [
  {
    username: "Trisha",
    password: process.env.ADMIN_TRISHA_PASSWORD,
  },
  {
    username: "Nikhil",
    password: process.env.ADMIN_NIKHIL_PASSWORD,
  },
  {
    username: "Rohith",
    password: process.env.ADMIN_ROHITH_PASSWORD,
  },
  {
    username: "Sushmitha",
    password: process.env.ADMIN_SUSHMITHA_PASSWORD,
  },
];

// Admin login
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  const isValid = ADMINS.some(
  (admin) =>
    admin.username === username &&
    typeof admin.password === "string" &&
    admin.password.length > 0 &&
    admin.password === password
  );

  if (!isValid) {
    return res.redirect("/admin-login.html?error=1");
  }

  req.session.isAdmin = true;
  req.session.adminUser = username;

  req.session.save((err) => {
    if (err) {
      console.error("Admin session save failed:", err);
      return res.status(500).send("Unable to establish admin session.");
    }

    return res.redirect("/admin/");
  });
});

// Protect the dashboard
function requireDashboardAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  return res.redirect("/admin-login.html");
}

// Dashboard
router.get("/", requireDashboardAdmin, (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "views", "admin.html")
  );
});

module.exports = router;