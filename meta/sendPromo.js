const fetch = require("node-fetch");

const {
  META_TOKEN,
  PHONE_NUMBER_ID,
  META_API_VERSION,
} = require("./config");

async function sendPromo(phone, name, promoText) {
  const url =
    `https://graph.facebook.com/${META_API_VERSION}/` +
    `${PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: "homeclinic24_promotion",
      language: {
        code: "en",
      },
      components: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: name || "there",
            },
            {
              type: "text",
              text: promoText,
            },
            {
              type: "text",
              text: "https://wa.me/917483068353",
            },
          ],
        },
      ],
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "WhatsApp promotion failed:",
        JSON.stringify(data)
      );

      return {
        success: false,
        error: data.error?.message || "WhatsApp message failed",
      };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id || null,
    };
  } catch (error) {
    console.error(
      "WhatsApp promotion error:",
      error.message
    );

    return {
      success: false,
      error: error.message || "Network error",
    };
  }
}

module.exports = { sendPromo };