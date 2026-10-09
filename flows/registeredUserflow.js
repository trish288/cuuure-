const pool = require("../config/postgres");

const { users, getSession } = require("../utils/sessions");
const { appointmentsCache } = require("../db/initDB");

const fetch = global.fetch || require("node-fetch");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const { notifyDoctor } = require("../services/doctorservice");

const {
  sendWhatsAppText,
  sendWhatsAppList,
} = require("../services/whatsappservice");

const {
  mainMenu,
  getMainMenuRows,
  getUpcomingDayRows,
  getTimeRowsForDate,
  getAvailableSlots,
} = require("../utils/helpers");

async function showMainMenu(from) {
  const session = getSession(from);
  session.step = "MENU";

  await sendWhatsAppList(from, {
    header: "Cuure.health 🩺",
    body: "Welcome to Cuure.health!\n\nPlease select an option:",
    button: "Select option",
    rows: getMainMenuRows(),
  });
}
/* =========================================
   MAIN REGISTERED USER FLOW
========================================= */

async function handleRegisteredUser(from, text, interactiveId) {

  const session = getSession(from);

  const trimmedText = (text || "").trim();

  const lower = trimmedText.toLowerCase();

  // Normalize numbered menu replies.
  const clean = trimmedText.replace(/[^\d]/g, "");


  console.log("MENU DEBUG:", {
    raw: text,
    interactiveId,
    step: session.step,
  });


 /* =========================================
   1. MAIN MENU COMMAND AND DROPDOWN
========================================= */

if (lower === "menu") {
  await showMainMenu(from);
  return;
}

const menuChoice = {
  menu_book: "1",
  menu_view: "2",
  menu_support: "3",
}[interactiveId] || clean;


  /* =========================================
     2. DATE SELECTION
  ========================================= */

  if (interactiveId && interactiveId.startsWith("date_")) {

    const dateStr = interactiveId.replace("date_", "");

    session.temp.date = dateStr;

    const timeRows = getTimeRowsForDate(dateStr);

    if (!timeRows.length) {

      session.step = "DAY_SELECT";

      await sendWhatsAppText(
        from,
        "All time slots for this day are currently booked.\n\n" +
        "Please select another date."
      );

      await sendWhatsAppList(from, {
        header: "Select Appointment Date",
        body: "Choose a preferred date for your appointment:",
        button: "Select date",
        rows: getUpcomingDayRows(),
      });

      return;
    }

    session.step = "TIME_SELECT";

    await sendWhatsAppList(from, {
      header: `Date: ${dateStr}`,
      body: "Please select a suitable time slot:",
      button: "Select time",
      rows: timeRows,
    });

    return;
  }


  /* =========================================
     3. TIME SELECTION
  ========================================= */

  if (
    interactiveId &&
    interactiveId.startsWith("time_") &&
    session.temp.date
  ) {

    const timeValue = interactiveId.replace("time_", "");

    const slot = getAvailableSlots(session.temp.date).find(
      (item) => item.value === timeValue
    );

    if (!slot) {

      session.step = "TIME_SELECT";

      await sendWhatsAppText(
        from,
        "This time slot is no longer available. Please choose another."
      );

      await sendWhatsAppList(from, {
        header: `Date: ${session.temp.date}`,
        body: "Select an available appointment time:",
        button: "Select time",
        rows: getTimeRowsForDate(session.temp.date),
      });

      return;
    }

    session.temp.slot = slot;

    session.step = "CONFIRM";

    await sendWhatsAppText(
      from,
      "Please review your appointment details:\n\n" +
      `📅 Date: ${session.temp.date}\n` +
      `⏰ Time: ${slot.label}\n\n` +
      "Reply YES to confirm the appointment or NO to cancel."
    );

    return;
  }


  /* =========================================
     4. APPOINTMENT CONFIRMATION
  ========================================= */

  if (session.step === "CONFIRM") {

    if (lower === "yes") {

      session.step = "ADDRESS_CHOICE";

      try {

        const response = await fetch(
          `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            method: "POST",

            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: from,
              type: "interactive",

              interactive: {
                type: "button",

                body: {
                  text: "📍 How would you like to share the visit address?",
                },

                action: {
                  buttons: [
                    {
                      type: "reply",
                      reply: {
                        id: "ADDR_TYPE",
                        title: "Type Address",
                      },
                    },
                    {
                      type: "reply",
                      reply: {
                        id: "ADDR_LOCATION",
                        title: "Send Location",
                      },
                    },
                  ],
                },
              },
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(JSON.stringify(result));
        }

      } catch (err) {

        console.error("Address selection message failed:", err);

        session.step = "CONFIRM";

        await sendWhatsAppText(
          from,
          "We couldn't display the address options. Please reply YES to try again."
        );
      }

      return;
    }


    if (lower === "no") {

      session.step = "MENU";

      session.temp = {};

        await sendWhatsAppText(
          from,
          "Your appointment request has been cancelled."
        );

        await showMainMenu(from);
        return;
    }


    await sendWhatsAppText(
      from,
      "Please reply YES to confirm or NO to cancel."
    );

    return;
  }


  /* =========================================
     5. ADDRESS CHOICE
  ========================================= */

  if (
    session.step === "ADDRESS_CHOICE" &&
    interactiveId
  ) {

    if (interactiveId === "ADDR_TYPE") {

      session.step = "ASK_TYPED_ADDRESS";

      session.temp.address = null;
      session.temp.location = null;
      session.temp.location_link = null;

      await sendWhatsAppText(
        from,
        "✍️ Please type your complete address:\n\n" +
        "• House / Flat No\n" +
        "• Area / Street\n" +
        "• City\n" +
        "• Landmark (optional)"
      );

      return;
    }


    if (interactiveId === "ADDR_LOCATION") {

      session.step = "ASK_LOCATION";

      session.temp.address = null;
      session.temp.location = null;
      session.temp.location_link = null;

      await sendWhatsAppText(
        from,
        "📍 Please share your location using WhatsApp Location.\n\n" +
        "If you cannot share your location, you can type your address instead."
      );

      return;
    }

    return;
  }


  /* =========================================
     6. RECEIVE TYPED ADDRESS
  ========================================= */

  if (session.step === "ASK_TYPED_ADDRESS") {

    if (!trimmedText) {

      await sendWhatsAppText(
        from,
        "Please type your complete address."
      );

      return;
    }

    session.temp.address = trimmedText;

    session.temp.location_link = null;

    session.step = "FINAL_CONFIRM";
  }


  /* =========================================
     7. RECEIVE LOCATION OR ADDRESS FALLBACK
  ========================================= */

  else if (session.step === "ASK_LOCATION") {

    if (session.temp.location) {

      const { lat, lng, address } = session.temp.location;

      session.temp.address =
        address || "Shared via WhatsApp location";

      session.temp.location_link =
        `https://maps.google.com/?q=${lat},${lng}`;

    } else if (
      trimmedText &&
      lower !== "skip"
    ) {

      // Allow the patient to type an address instead.
      session.temp.address = trimmedText;

      session.temp.location_link = null;

    } else if (lower === "skip") {

      session.temp.address = "Address not provided";

      session.temp.location_link = null;

    } else {

      await sendWhatsAppText(
        from,
        "Please share your WhatsApp location, type your address, or reply SKIP."
      );

      return;
    }

    session.step = "FINAL_CONFIRM";
  }


  /* =========================================
     8. SAVE APPOINTMENT
  ========================================= */

  if (
    session.step === "FINAL_CONFIRM" &&
    session.temp.slot
  ) {

    const slot = session.temp.slot;

    const user = users[from] || {};

    const record = {
      phone: from,
      patient_name: user.name || null,
      date: session.temp.date,
      time_label: slot.label,
      time_value: slot.value,
      address: session.temp.address || "Address not provided",
      location_link: session.temp.location_link || null,
    };


    try {

      /* -------------------------------------
         FETCH ACTIVE DOCTORS FROM POSTGRESQL
      ------------------------------------- */

      const doctorResult = await pool.query(
        `SELECT id, name, specialization, phone
         FROM doctors
         WHERE is_active = TRUE
         ORDER BY id`
      );

      const doctors = doctorResult.rows;

      if (!doctors.length) {

        session.step = "MENU";

        await sendWhatsAppText(
          from,
          "Sorry, no doctors are currently available. Please try again later."
        );

        return;
      }


      /* -------------------------------------
         BASIC ROUND-ROBIN ASSIGNMENT
      ------------------------------------- */

      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM appointments`
      );

      const doctorIndex =
        countResult.rows[0].count % doctors.length;

      const doctor = doctors[doctorIndex];


      /* -------------------------------------
         SAVE APPOINTMENT TO POSTGRESQL
      ------------------------------------- */

      const appointmentResult = await pool.query(
        `INSERT INTO appointments (
          phone,
          patient_name,
          date,
          time_label,
          time_value,
          address,
          location_link,
          doctor_name,
          doctor_specialization
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          record.phone,
          record.patient_name,
          record.date,
          record.time_label,
          record.time_value,
          record.address,
          record.location_link,
          doctor.name,
          doctor.specialization,
        ]
      );

      const appointmentId = appointmentResult.rows[0].id;

      console.log(
        "✅ Appointment saved to PostgreSQL. ID:",
        appointmentId
      );


      /* -------------------------------------
         UPDATE LOCAL CACHE AFTER DB SAVE
      ------------------------------------- */

      appointmentsCache.push({
        ...record,
        id: appointmentId,
        doctor_name: doctor.name,
        doctor_specialization: doctor.specialization,
      });


      /* -------------------------------------
         NOTIFY DOCTOR
      ------------------------------------- */

      notifyDoctor({
        doctor,
        record: {
          ...record,
          id: appointmentId,
        },
      }).catch((err) => {
        console.error("Doctor notification failed:", err);
      });


      /* -------------------------------------
         CONFIRM TO PATIENT
      ------------------------------------- */

      session.step = "MENU";

      await sendWhatsAppText(
        from,
        "Health is true wealth! \n\n" +
        "✅ Appointment Confirmed\n\n" +
        `Appointment ID: ${appointmentId}\n` +
        `📅 Date: ${record.date}\n` +
        `⏰ Time: ${record.time_label}\n\n` +
        `📍 Address:\n${record.address}\n\n` +
        (
          record.location_link
            ? `🗺️ ${record.location_link}\n\n`
            : ""
        ) +
        `👨‍⚕️ Doctor: ${doctor.name}\n` +
        `${doctor.specialization}`
      );

      await showMainMenu(from);
      return;

    } catch (err) {

      console.error("❌ Appointment booking failed:", err);

      session.step = "MENU";

      await sendWhatsAppText(
        from,
        "Sorry, we couldn't complete your appointment booking. Please try again later."
      );

      return;
    }
  }


  /* =========================================
     9. MAIN MENU OPTIONS
  ========================================= */

  if (session.step === "MENU") {

    if (menuChoice === "1") {

      session.step = "DAY_SELECT";

      await sendWhatsAppList(from, {
        header: "Select Appointment Date",
        body: "Please choose a preferred date for your appointment:",
        button: "Select date",
        rows: getUpcomingDayRows(),
      });

      return;
    }


    if (menuChoice === "2") {

      try {

        const result = await pool.query(
          `SELECT id, date, time_label, patient_name,
                  doctor_name, doctor_specialization
           FROM appointments
           WHERE phone = $1
           ORDER BY date, time_value`,
          [from]
        );

        const rows = result.rows;

        if (!rows.length) {

          await sendWhatsAppText(
            from,
            "You do not have any appointments scheduled at the moment."
          );

          await showMainMenu(from);
          return;
        }

        const list = rows.map((appointment, index) => {

          return (
            `${index + 1}. Appointment ID: ${appointment.id}\n` +
            `📅 ${appointment.date}\n` +
            `⏰ ${appointment.time_label}\n` +
            `👨‍⚕️ ${appointment.doctor_name || "Not assigned"}\n`
          );

        }).join("\n");

        await sendWhatsAppText(
          from,
          "📋 Your Appointments\n\n" + list
        );

        await showMainMenu(from);

      } catch (err) {

        console.error("Error fetching user appointments:", err);

        await sendWhatsAppText(
          from,
          "Sorry, we couldn't retrieve your appointments. Please try again."
        );
      }

      return;
    }


    if (menuChoice === "3") {

      await sendWhatsAppText(
        from,
        "Cuure.health Support 🩺\n\n" +
        "For help with appointments or other queries:\n\n" +
        "📞 Helpline: 08213156014 / 7483068353\n" +
        "🕒 Support hours: 9:00 AM – 8:00 PM"
      );

      await showMainMenu(from);
      return;
    }


    await sendWhatsAppText(
        from,
        "Sorry, I did not understand that. Please select an option below."
      );

      await showMainMenu(from);
      return;
        }

}


module.exports = handleRegisteredUser;