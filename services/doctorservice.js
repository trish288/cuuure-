const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER;

const fetch = global.fetch || require("node-fetch");

async function notifyDoctor({ doctor, record }) {
  console.log("📢 Sending appointment notification to admin...");

  try {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      throw new Error("Missing WhatsApp environment variables");
    }

    if (!ADMIN_WHATSAPP_NUMBER) {
      throw new Error("ADMIN_WHATSAPP_NUMBER is missing");
    }

    const adminPhone = ADMIN_WHATSAPP_NUMBER.replace(/\D/g, "");

    const message =
      `🏥 New Appointment Booked - Cuure.health\n\n` +
      `🆔 Appointment ID: ${record.id || "N/A"}\n` +
      `👤 Patient: ${record.patient_name || "Not specified"}\n` +
      `📱 Patient Phone: ${record.phone || "N/A"}\n` +
      `📅 Date: ${record.date || "N/A"}\n` +
      `⏰ Time: ${record.time_label || "N/A"}\n` +
      `📍 Address: ${record.address || "Not provided"}\n` +
      (record.location_link
        ? `🗺️ Location: ${record.location_link}\n`
        : "") +
      `\n📌 Status: Booked`;

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
          recipient_type: "individual",
          to: adminPhone,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Admin notification failed:", result);
      return;
    }

    console.log(
      "✅ Admin notification accepted by WhatsApp API:",
      result.messages?.[0]?.id
    );
  } catch (err) {
    console.error("❌ Admin notification error:", err.message);
  }
}

module.exports = { notifyDoctor };