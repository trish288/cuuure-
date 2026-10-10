const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const ADMIN_WHATSAPP_NUMBER = process.env.ADMIN_WHATSAPP_NUMBER;

const fetch = global.fetch || require("node-fetch");

async function notifyDoctor({ doctor, record }) {
  console.log("📢 Sending appointment template to admin...");

  try {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      throw new Error("Missing WhatsApp environment variables");
    }

    if (!ADMIN_WHATSAPP_NUMBER) {
      throw new Error("ADMIN_WHATSAPP_NUMBER is missing");
    }

    const adminPhone = ADMIN_WHATSAPP_NUMBER.replace(/\D/g, "");

    const parameters = [
      doctor?.name || "Admin", // {{1}}
      String(record.id || "N/A"), // {{2}}
      String(record.date || "N/A"), // {{3}}
      String(record.time_label || "N/A"), // {{4}}
      String(
        doctor?.specialization ||
        record.doctor_specialization ||
        "Not assigned"
      ), // {{5}}
    ];

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
          type: "template",
          template: {
            name: "doctor_appointment_assigned",
            language: {
              code: "en",
            },
            components: [
              {
                type: "body",
                parameters: parameters.map((value) => ({
                  type: "text",
                  text: value,
                })),
              },
            ],
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ Admin template notification failed:", result);
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