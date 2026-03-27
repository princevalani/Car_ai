// ============================================
// 11za API Service - WhatsApp Message Sender
// ============================================
// Ye file 11za API se connect karti hai
// AI ka reply customer ko WhatsApp pe bhejti hai

const axios = require("axios");

const API_BASE = process.env.ELEVEN_ZA_API_BASE;
const AUTH_TOKEN = process.env.ELEVEN_ZA_AUTH_TOKEN;

// ============================================
// Function: Send Text Message via 11za API (User Custom Format)
// ============================================
async function sendWhatsAppMessage(customerPhone, message) {
  try {
    console.log(`📤 Sending reply to ${customerPhone} via 11za...`);

    // Ensure phone number has country code (Assuming Indian numbers for this project)
    let sendToNumber = customerPhone.toString();
    if (sendToNumber.length === 10) {
        sendToNumber = "91" + sendToNumber;
    }

    const payload = {
        sendto: sendToNumber,
        authToken: AUTH_TOKEN,
        originWebsite: "https://engees.in",
        contentType: "text",
        text: message
    };

    const response = await axios.post(
      "https://internal.11za.in/apis/sendMessage/sendMessages",
      payload,
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ Message sent successfully to ${sendToNumber}`);
    return { success: true, data: response.data };

  } catch (error) {
    console.error(`❌ 11za Send Message Error:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendWhatsAppMessage };
