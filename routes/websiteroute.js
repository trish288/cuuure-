const express = require("express");
const router = express.Router();

const pool = require("../config/postgres");
const { notifyDoctor } = require("../services/doctorservice");

/* A website request only carries name + phone, so the slot is left for the
   clinic to confirm. These go in the existing TEXT columns (no schema change)
   and, with no time_value, never occupy a slot the bot offers. */
const PENDING_LABEL = "To be confirmed";

/* ===============================
   SIMPLE PER-IP RATE LIMIT
   (public endpoint, so keep spam out)
================================ */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_PER_WINDOW) {
    return res.status(429).json({
      success: false,
      message: "Too many requests. Please try again in a few minutes.",
    });
  }

  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(ip);
  }
}, WINDOW_MS).unref();

/* ===============================
   WEBSITE BOOKING (PUBLIC)
   body: { patient_name, phone }
================================ */
router.post("/", rateLimit, async (req, res) => {
  let { patient_name, phone } = req.body || {};

  patient_name = (patient_name || "").toString().trim().replace(/\s+/g, " ");

  // same normalisation as the admin API
  phone = (phone || "").toString().trim().replace(/\D/g, "").replace(/^91/, "");

  if (!patient_name || patient_name.length > 60 || !/^[a-zA-Z\s]+$/.test(patient_name)) {
    return res.status(400).json({
      success: false,
      message: "Name must contain only letters and spaces",
    });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: "Phone number must be exactly 10 digits",
    });
  }

  // the bot stores WhatsApp numbers with the country code
  const botPhone = `91${phone}`;

  try {
    // double-click / resubmit guard: reuse a request made in the last 10 minutes
    const duplicate = await pool.query(
      `SELECT id FROM appointments
       WHERE phone = $1 AND date = $2
         AND created_at > NOW() - INTERVAL '10 minutes'
       ORDER BY id DESC LIMIT 1`,
      [botPhone, PENDING_LABEL]
    );

    if (duplicate.rows.length) {
      return res.json({ success: true, id: duplicate.rows[0].id });
    }

    // same round-robin doctor assignment the bot uses
    const doctorResult = await pool.query(
      `SELECT id, name, specialization, phone
       FROM doctors
       WHERE is_active = TRUE
       ORDER BY id`
    );
    const doctors = doctorResult.rows;

    let doctor = null;
    if (doctors.length) {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM appointments`
      );
      doctor = doctors[countResult.rows[0].count % doctors.length];
    }

    const result = await pool.query(
      `INSERT INTO appointments (
        phone,
        patient_name,
        date,
        time_label,
        time_value,
        address,
        location_link,
        doctor_name,
        doctor_specialization,
        source
      )
      VALUES ($1, $2, $3, $4, NULL, NULL, NULL, $5, $6, 'website')
      RETURNING id`,
      [
        botPhone,
        patient_name,
        PENDING_LABEL,
        PENDING_LABEL,
        doctor ? doctor.name : null,
        doctor ? doctor.specialization : null,
      ]
    );

    const id = result.rows[0].id;

    if (doctor) {
      notifyDoctor({
        doctor,
        record: {
          id,
          phone: botPhone,
          patient_name,
          date: PENDING_LABEL,
          time_label: PENDING_LABEL,
          address: "Booked from website",
        },
      }).catch((err) => {
        console.error("Website booking notification failed:", err);
      });
    }

    return res.json({ success: true, id });
  } catch (err) {
    console.error("Website booking error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to submit booking. Please try again.",
    });
  }
});

module.exports = router;
