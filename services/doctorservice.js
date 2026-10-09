const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const fetch = global.fetch || require("node-fetch");

async function notifyDoctor({ doctor, record }) {
  console.log("📢 Sending appointment notification to doctor...");

  try {
    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
      throw new Error("Missing WHATSAPP_TOKEN or WHATSAPP_PHONE_ID");
    }

    const doctorPhone = String(doctor.phone || "").replace(/\D/g, "");

    if (!doctorPhone) {
      throw new Error("Doctor WhatsApp phone number is missing");
    }

    const parameters = [
      doctor.name || "Doctor", // {{1}} Doctor name
      String(record.id || ""), // {{2}} Appointment ID
      String(record.date || ""), // {{3}} Date
      String(record.time_label || ""), // {{4}} Time
      String(
        doctor.specialization ||
        record.doctor_specialization ||
        "General Physician"
      ), // {{5}} Specialization
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
          to: doctorPhone,
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
      console.error("❌ WhatsApp API error:", result);
      return;
    }

    console.log(
      "✅ Doctor notification accepted by WhatsApp API:",
      result.messages?.[0]?.id
    );
  } catch (error) {
    console.error("❌ Doctor notification failed:", error.message);
  }
}

module.exports = { notifyDoctor };