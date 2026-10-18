const express = require("express");
const path = require("path");

const router = express.Router();

const ADMINS = [
  { username: "Benaka", password: "Benaka@123" },
  { username: "Trisha", password: "Trisha@123" },
  { username: "Nikhil", password: "Nikhil@123" },
  { username: "Rohith", password: "Rohith@123" },
  { username: "Shreyas", password: "Shreyas@123" },
];

// Admin login
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  const isValid = ADMINS.some(
    (admin) =>
      admin.username === username &&
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