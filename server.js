// ============================================
// Mahindra Showroom AI Auto-Reply Server
// ============================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { connectDB, Car, Lead } = require("./services/dbService");
const { getAIReply, clearChatHistory, getActiveChatCount } = require("./services/geminiService");
const { getMistralReply } = require("./services/mistralService");
const { sendWhatsAppMessage } = require("./services/elevenZaService");
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to Real Database
connectDB();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Stats Memory (Reset on restart)
let stats = {
  totalReceived: 0,
  totalReplied: 0,
  totalErrors: 0,
  aiEnabled: true,
  startTime: new Date(),
};
const messageLogs = [];

// ============================================
// WEBHOOK ENDPOINT
// ============================================
app.post("/webhook", async (req, res) => {
  try {
    const webhookData = req.body;
    let customerPhone = webhookData.phone || webhookData.from || "";
    let customerMessage = webhookData.message || webhookData.text || "";
    let customerName = webhookData.name || "Customer";

    stats.totalReceived++;

    if (!customerMessage) {
        return res.status(200).json({ status: "skipped" });
    }

    let aiReply = "";
    try {
      aiReply = await getAIReply(customerPhone, customerMessage);
      
      // AI Fallback
      if (aiReply.includes("I'm sorry, I'm having trouble") && process.env.MISTRAL_API_KEY) {
        const mistralReply = await getMistralReply(customerPhone, customerMessage);
        if (mistralReply && !mistralReply.includes("I'm sorry, I'm having trouble")) {
            aiReply = mistralReply;
        } else {
            aiReply = getLocalFallbackReply(customerMessage);
        }
      }
    } catch (aiErr) {
       aiReply = getLocalFallbackReply(customerMessage);
    }

    const sendResult = await sendWhatsAppMessage(customerPhone, aiReply);
    if (sendResult.success) stats.totalReplied++;

    messageLogs.unshift({
      time: new Date().toISOString(),
      phone: customerPhone,
      name: customerName,
      incoming: customerMessage,
      outgoing: aiReply,
      status: sendResult.success ? "sent" : "failed",
    });

    res.status(200).json({ status: "success", reply: aiReply });

  } catch (error) {
    res.status(200).json({ status: "error" });
  }
});

// ============================================
// REAL DATABASE API ENDPOINTS
// ============================================

app.get("/api/cars", async (req, res) => {
  try {
    const cars = await Car.find().sort({ createdAt: -1 });
    res.json(cars);
  } catch(e) { res.json([]); }
});

app.post("/api/cars", async (req, res) => {
  try {
    const newCar = new Car(req.body);
    await newCar.save();
    res.json({ success: true, car: newCar });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

app.delete("/api/cars/:id", async (req, res) => {
  try {
    await Car.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

app.get("/api/leads", async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json(leads);
  } catch(e) { res.json([]); }
});

app.get("/api/stats", (req, res) => {
  res.json({
    ...stats,
    activeChats: getActiveChatCount(),
    uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000),
  });
});

app.get("/api/logs", (req, res) => { res.json(messageLogs); });

app.post("/api/toggle-ai", (req, res) => {
  stats.aiEnabled = !stats.aiEnabled;
  res.json({ aiEnabled: stats.aiEnabled });
});

app.post("/api/test-reply", async (req, res) => {
  const { phone, message } = req.body;
  try {
    let aiReply = await getAIReply(phone || "test-user", message);
    
    // AI Fallback for Tests
    if (aiReply.includes("I'm sorry, I'm having trouble") && process.env.MISTRAL_API_KEY) {
        const mistralReply = await getMistralReply(phone || "test-user", message);
        if (mistralReply && !mistralReply.includes("I'm sorry, I'm having trouble")) {
            aiReply = mistralReply;
        } else {
            console.log("⚠️ Mistral also failed in test-reply. Using local fallback...");
            aiReply = getLocalFallbackReply(message);
        }
    } else if (aiReply.includes("I'm sorry, I'm having trouble")) {
        // If no Mistral API Key or bypassed
        aiReply = getLocalFallbackReply(message);
    }
    
    res.json({ success: true, reply: aiReply });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// SMART FALLBACK
// ============================================
function getLocalFallbackReply(message) {
  const msg = message.toLowerCase();
  if (msg.includes("xuv700")) return "Mahindra XUV700 🚙. AX5/AX7 variants. Starts from ₹14L. ADAS & Skyroof.";
  if (msg.includes("thar")) return "Mahindra Thar ⛰️. Legendary 4x4. Starts from ₹11L.";
  if (msg.includes("scorpio")) return "Scorpio-N 🦍. Big Daddy of SUVs. Starts from ₹13L.";
  return "Choose a car you like: XUV700, Thar, or Scorpio-N. I'm here to help!";
}

app.get("/api/health", (req, res) => { res.json({ status: "running" }); });

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => console.log(`🚀 Mahindra AI Server running on port ${PORT}`));
}

module.exports = app;
