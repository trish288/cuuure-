const express = require("express");
const router = express.Router();

const { pool, appointmentsCache } = require("../config/db");
const { sendPromo } = require("../meta/sendPromo");
/* A slot is in the past if its date is before today, or it is today and the
   slot's start hour is not after the current hour (same rule the bot uses). */
function isPastSlot(date, time_value) {
  const now = new Date();
  const todayStr =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;

  if (date < todayStr) return true;
  if (date > todayStr) return false;
  return parseInt(time_value, 10) <= now.getHours();
}

/* ===============================
   GET ALL APPOINTMENTS (ADMIN)
================================ */
router.get("/appointments", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        a.id,
        a.patient_name,
        a.phone,
        u.age,
        a.date,
        a.time_label,
        a.time_value,
        a.address,
        a.location_link,
        a.doctor_name,
        a.doctor_specialization,
        COALESCE(a.source, 'whatsapp') AS source,
        'Booked' AS status
      FROM appointments a
      LEFT JOIN users u ON u.phone = a.phone
      ORDER BY a.created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Admin appointments error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch appointments",
    });
  }
});

/* ===============================
   ADD APPOINTMENT MANUALLY (ADMIN)
================================ */
router.post("/appointments", async (req, res) => {
  let {
    phone,
    patient_name,
    age,
    date,
    time_label,
    time_value,
    address,
    location_link,
    doctor_name,
    doctor_specialization,
  } = req.body || {};

  /* ===============================
     VALIDATIONS
  ================================ */

  // normalize phone (remove spaces, country code, non-digits)
  phone = (phone || "")
    .toString()
    .trim()
    .replace(/\D/g, "")
    .replace(/^91/, "");

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: "Phone number must be exactly 10 digits",
    });
  }

  if (!patient_name || !/^[a-zA-Z\s]+$/.test(patient_name)) {
    return res.status(400).json({
      success: false,
      message: "Patient name must contain only letters and spaces",
    });
  }

  if (age !== undefined && age !== null && age !== "") {
    age = Number(age);
    if (Number.isNaN(age) || age < 1 || age > 110) {
      return res.status(400).json({
        success: false,
        message: "Age must be between 1 and 110",
      });
    }
  } else {
    age = null;
  }

  if (!date || !time_value || !doctor_name) {
    return res.status(400).json({
      success: false,
      message: "Missing required appointment fields",
    });
  }

  if (isPastSlot(date, time_value)) {
    return res.status(400).json({
      success: false,
      message: "Cannot book a date or time that has already passed",
    });
  }

  try {
    /* ===============================
       SAVE / UPDATE USER (AGE FIX ✅)
    ================================ */
    if (age !== null) {
      await pool.query(
        `
        INSERT INTO users (phone, name, age)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone)
        DO UPDATE SET
          name = EXCLUDED.name,
          age = EXCLUDED.age
        `,
        [phone, patient_name, age]
      );
    }

    /* ===============================
       SAVE APPOINTMENT
    ================================ */
    const result = await pool.query(
      `
      INSERT INTO appointments (
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'admin')
      RETURNING id
      `,
      [
        phone,
        patient_name,
        date,
        time_label || time_value,
        time_value,
        address || null,
        location_link || null,
        doctor_name,
        doctor_specialization || null,
      ]
    );

    /* ===============================
       KEEP CACHE IN SYNC
    ================================ */
    appointmentsCache.push({
      phone,
      patient_name,
      date,
      time_label: time_label || time_value,
      time_value,
    });

    return res.json({
      success: true,
      id: result.rows[0].id,
    });
  } catch (err) {
    console.error("Admin appointment insert error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to add appointment",
    });
  }
});

/* ===============================
   EDIT APPOINTMENT (ADMIN)
================================ */
router.put("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ success: false, message: "Invalid appointment id" });
  }

  let {
    phone,
    patient_name,
    age,
    date,
    time_label,
    time_value,
    address,
    doctor_name,
    doctor_specialization,
  } = req.body || {};

  phone = (phone || "").toString().trim().replace(/\D/g, "").replace(/^91/, "");

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: "Phone number must be exactly 10 digits",
    });
  }

  if (!patient_name || !/^[a-zA-Z\s]+$/.test(patient_name)) {
    return res.status(400).json({
      success: false,
      message: "Patient name must contain only letters and spaces",
    });
  }

  if (age !== undefined && age !== null && age !== "") {
    age = Number(age);
    if (Number.isNaN(age) || age < 1 || age > 110) {
      return res.status(400).json({
        success: false,
        message: "Age must be between 1 and 110",
      });
    }
  } else {
    age = null;
  }

  if (!date || !time_value || !doctor_name) {
    return res.status(400).json({
      success: false,
      message: "Missing required appointment fields",
    });
  }

  try {
    const existing = await pool.query(
      `SELECT phone, date, time_value FROM appointments WHERE id = $1`,
      [id]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }
    const old = existing.rows[0];

    // block moving onto a slot another appointment already holds; skip when the
    // slot is unchanged so details of an existing (even double-booked) one stay editable
    if (date !== old.date || time_value !== old.time_value) {
      if (isPastSlot(date, time_value)) {
        return res.status(400).json({
          success: false,
          message: "Cannot move an appointment to a date or time that has already passed",
        });
      }

      const clash = await pool.query(
        `SELECT 1 FROM appointments WHERE date = $1 AND time_value = $2 AND id <> $3 LIMIT 1`,
        [date, time_value, id]
      );
      if (clash.rows.length) {
        return res.status(409).json({
          success: false,
          message: "That date and time slot is already booked",
        });
      }
    }

    if (age !== null) {
      await pool.query(
        `
        INSERT INTO users (phone, name, age)
        VALUES ($1, $2, $3)
        ON CONFLICT (phone)
        DO UPDATE SET name = EXCLUDED.name, age = EXCLUDED.age
        `,
        [phone, patient_name, age]
      );
    }

    await pool.query(
      `
      UPDATE appointments SET
        phone = $1,
        patient_name = $2,
        date = $3,
        time_label = $4,
        time_value = $5,
        address = $6,
        doctor_name = $7,
        doctor_specialization = $8
      WHERE id = $9
      `,
      [
        phone,
        patient_name,
        date,
        time_label || time_value,
        time_value,
        address || null,
        doctor_name,
        doctor_specialization || null,
        id,
      ]
    );

    // keep slot-availability caches in sync (old slot freed, new slot taken)
    const updated = {
      phone,
      patient_name,
      date,
      time_label: time_label || time_value,
      time_value,
    };
    for (const cache of [appointmentsCache, require("../db/initDB").appointmentsCache]) {
      const idx = cache.findIndex(
        (a) => a.phone === old.phone && a.date === old.date && a.time_value === old.time_value
      );
      if (idx >= 0) cache[idx] = updated;
      else cache.push(updated);
    }

    return res.json({ success: true, id });
  } catch (err) {
    console.error("Admin appointment update error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update appointment",
    });
  }
});

/* ===============================
   GET PAYMENT REQUESTS (ADMIN)
================================ */
router.get("/payments", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        appointment_id,
        doctor_name,
        patient_name,
        patient_phone,
        amount,
        status,
        payment_link,
        created_at
      FROM payment_requests
      ORDER BY created_at DESC`
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("Admin payments error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment requests",
    });
  }
});

/* ===============================
   CREATE PAYMENT REQUEST (ADMIN)
================================ */
router.post("/payments", async (req, res) => {
  const {
    appointment_id,
    doctor_name,
    patient_name,
    patient_phone,
    amount,
    payment_link,
    status,
  } = req.body || {};

  if (!patient_phone || !amount) {
    return res.status(400).json({
      success: false,
      message: "patient_phone and amount are required",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO payment_requests (
        appointment_id,
        doctor_name,
        patient_name,
        patient_phone,
        amount,
        payment_link,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id`,
      [
        appointment_id || null,
        doctor_name || null,
        patient_name || null,
        patient_phone,
        amount,
        payment_link || null,
        status || "PENDING",
      ]
    );

    res.json({
      success: true,
      id: result.rows[0].id,
    });
  } catch (err) {
    console.error("Failed to create payment request:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to create payment request",
    });
  }
});

/* ===============================
   SEND WHATSAPP PROMOTION
================================ */
router.post("/promotions/send", async (req, res) => {
  const { phones, message, confirmOptIn } = req.body || {};

  if (!confirmOptIn) {
    return res.status(400).json({
      success: false,
      message: "Confirm that the selected recipients opted in to promotions.",
    });
  }

  if (!Array.isArray(phones) || phones.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Select at least one recipient.",
    });
  }

  if (phones.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Select at most 100 recipients per request.",
    });
  }

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.trim().length > 1000
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a promotion between 1 and 1000 characters.",
    });
  }

  const normalizedPhones = phones.map((phone) =>
    String(phone).replace(/\D/g, "").replace(/^91/, "")
  );

  if (normalizedPhones.some((phone) => !/^\d{10}$/.test(phone))) {
    return res.status(400).json({
      success: false,
      message: "One or more phone numbers are invalid.",
    });
  }

  const uniquePhones = [...new Set(normalizedPhones)];

  const results = [];

  for (const phone of uniquePhones) {
    try {
      // Resolve the patient's name from existing appointments.
      const patient = await pool.query(
        `SELECT patient_name
         FROM appointments
         WHERE regexp_replace(phone, '\\D', '', 'g') IN ($1, $2)
         ORDER BY created_at DESC
         LIMIT 1`,
        [phone, `91${phone}`]
      );

      if (!patient.rows.length) {
        results.push({
          phone,
          success: false,
          error: "Patient not found",
        });
        continue;
      }

      const result = await sendPromo(
        `91${phone}`,
        patient.rows[0].patient_name,
        message.trim()
      );

      results.push({
        phone,
        success: result.success,
        messageId: result.messageId || null,
        error: result.error || null,
      });

      // Small delay between messages.
      await new Promise((resolve) => setTimeout(resolve, 150));
    } catch (error) {
      console.error("Campaign recipient error:", error);

      results.push({
        phone,
        success: false,
        error: "Failed to process recipient",
      });
    }
  }

  const sent = results.filter((result) => result.success).length;
  const failed = results.length - sent;

  return res.json({
    success: failed === 0,
    total: results.length,
    sent,
    failed,
    results,
  });
});

module.exports = router;