// ============================================
// 11za API Service - WhatsApp Message Sender
// ============================================
// Ye file 11za API se connect karti hai
// AI ka reply customer ko WhatsApp pe bhejti hai

const axios = require("axios");

const API_BASE = process.env.ELEVEN_ZA_API_BASE;
const AUTH_TOKEN = process.env.ELEVEN_ZA_AUTH_TOKEN;

// ============================================
// Function: Send Text Message via 11za API
// ============================================
async function sendWhatsAppMessage(customerPhone, message) {
  try {
    console.log(`📤 Sending reply to ${customerPhone}...`);

    const response = await axios.post(
      `${API_BASE}/sendText`,
      {
        to: customerPhone,
        message: message,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "authToken": AUTH_TOKEN,
        },
      }
    );

    console.log(`✅ Message sent successfully to ${customerPhone}`);
    return { success: true, data: response.data };

  } catch (error) {
    console.error(`❌ 11za API Error:`, error.response?.data || error.message);

    // Agar 11za API ka format different ho, try alternate format
    try {
      const response = await axios.post(
        `${API_BASE}/send-text`,
        {
          phone: customerPhone,
          text: message,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "authToken": AUTH_TOKEN,
          },
        }
      );

      console.log(`✅ Message sent (alternate format) to ${customerPhone}`);
      return { success: true, data: response.data };

    } catch (altError) {
      console.error(`❌ Alternate format also failed:`, altError.response?.data || altError.message);
      return { success: false, error: altError.message };
    }
  }
}

module.exports = { sendWhatsAppMessage };
