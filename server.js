// ============================================
// Mahindra Showroom AI Auto-Reply Server
// ============================================
// Main server file - Webhook receive + AI reply + Dashboard

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { getAIReply, clearChatHistory, getActiveChatCount } = require("./services/geminiService");
const { getGroqReply } = require("./services/groqService"); // Naya Groq Service
const { sendWhatsAppMessage } = require("./services/elevenZaService");
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ============================================
// Message Logs (for dashboard)
// ============================================
const messageLogs = [];
let stats = {
  totalReceived: 0,
  totalReplied: 0,
  totalErrors: 0,
  aiEnabled: true,        // AI ON/OFF toggle
  startTime: new Date(),
};

// ============================================
// WEBHOOK ENDPOINT
// ============================================
// 11za Inbound Webhook yahan message bhejega
// POST /webhook
app.post("/webhook", async (req, res) => {
  try {
    console.log("\n📩 ====== New Message Received ======");
    console.log("📦 Webhook Data:", JSON.stringify(req.body, null, 2));

    const webhookData = req.body;
    let customerPhone = "";
    let customerMessage = "";
    let customerName = "";
    let messageType = "";

    if (webhookData.phone || webhookData.from) {
      customerPhone = webhookData.phone || webhookData.from;
      customerMessage = webhookData.message || webhookData.text || webhookData.body || "";
      customerName = webhookData.name || webhookData.customerName || "Customer";
      messageType = webhookData.type || "text";
    }

    if (webhookData.data) {
      customerPhone = webhookData.data.phone || webhookData.data.from || customerPhone;
      customerMessage = webhookData.data.message || webhookData.data.text || webhookData.data.body || customerMessage;
      customerName = webhookData.data.name || webhookData.data.customerName || customerName;
      messageType = webhookData.data.type || messageType;
    }

    if (webhookData.message && typeof webhookData.message === "object") {
      customerPhone = webhookData.message.from || customerPhone;
      customerMessage = webhookData.message.text || webhookData.message.body || "";
      messageType = webhookData.message.type || messageType;
    }

    if (webhookData.entry) {
      const entry = webhookData.entry[0];
      if (entry?.changes?.[0]?.value?.messages?.[0]) {
        const msg = entry.changes[0].value.messages[0];
        customerPhone = msg.from || customerPhone;
        customerMessage = msg.text?.body || msg.body || customerMessage;
        messageType = msg.type || messageType;
      }
    }

    stats.totalReceived++;

    if (!customerMessage || messageType === "image" || messageType === "video" || messageType === "audio" || messageType === "document") {
      res.status(200).json({ status: "skipped", reason: "non-text message" });
      messageLogs.unshift({
        time: new Date().toISOString(),
        phone: customerPhone,
        name: customerName,
        incoming: customerMessage || `[${messageType} message]`,
        outgoing: "[Skipped - non-text]",
        status: "skipped",
      });
      return;
    }

    if (!stats.aiEnabled) {
      res.status(200).json({ status: "skipped", reason: "AI disabled" });
      messageLogs.unshift({
        time: new Date().toISOString(),
        phone: customerPhone,
        name: customerName,
        incoming: customerMessage,
        outgoing: "[AI Disabled]",
        status: "disabled",
      });
      return;
    }

    console.log(`👤 Customer: ${customerName} (${customerPhone})`);
    console.log(`💬 Message: "${customerMessage}"`);

    let aiReply = "";
    try {
      aiReply = await getAIReply(customerPhone, customerMessage);
      
      if (aiReply.includes("I'm sorry, I'm having trouble responding right now") && process.env.GROQ_API_KEY) {
        console.log("🔄 Gemini Quota Hit. Switching to Groq AI...");
        const groqReply = await getGroqReply(customerPhone, customerMessage);
        if (groqReply && !groqReply.includes("I'm sorry, I'm having trouble responding right now")) {
           aiReply = groqReply;
        } else {
           aiReply = getLocalFallbackReply(customerMessage);
        }
      }
    } catch (aiErr) {
       console.log("❌ AI Primary & Fallback Failed. Using local keyword logic...");
       aiReply = getLocalFallbackReply(customerMessage);
    }

    const sendResult = await sendWhatsAppMessage(customerPhone, aiReply);

    if (sendResult.success) {
      stats.totalReplied++;
    } else {
      stats.totalErrors++;
    }

    messageLogs.unshift({
      time: new Date().toISOString(),
      phone: customerPhone,
      name: customerName,
      incoming: customerMessage,
      outgoing: aiReply,
      status: sendResult.success ? "sent" : "failed",
    });

    if (messageLogs.length > 200) messageLogs.length = 200;

    res.status(200).json({ status: "success", reply: aiReply });

  } catch (error) {
    console.error("❌ Webhook Error:", error);
    stats.totalErrors++;
    res.status(200).json({ status: "error", message: error.message });
  }
});

// ============================================
// API ENDPOINTS (for Dashboard)
// ============================================

app.get("/api/cars", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "data/cars.json"), "utf8");
    res.json(JSON.parse(data));
  } catch(e) { res.json([]); }
});

app.post("/api/cars", (req, res) => {
  try {
    fs.writeFileSync(path.join(__dirname, "data/cars.json"), JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch(e) { res.json({ success: false, error: e.message }); }
});

app.get("/api/leads", (req, res) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, "data/leads.json"), "utf8");
    res.json(JSON.parse(data));
  } catch(e) { res.json([]); }
});

app.get("/api/stats", (req, res) => {
  res.json({
    ...stats,
    activeChats: getActiveChatCount(),
    uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000),
    logCount: messageLogs.length,
  });
});

app.get("/api/logs", (req, res) => { res.json(messageLogs); });

app.post("/api/toggle-ai", (req, res) => {
  stats.aiEnabled = !stats.aiEnabled;
  res.json({ aiEnabled: stats.aiEnabled });
});

app.post("/api/clear-history", (req, res) => {
  const { phone } = req.body;
  if (phone) {
    clearChatHistory(phone);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

app.post("/api/test-reply", async (req, res) => {
  const { phone, message } = req.body;
  try {
    let aiReply = await getAIReply(phone || "test-user", message);
    
    if (aiReply.includes("I'm sorry, I'm having trouble responding right now") && process.env.GROQ_API_KEY) {
      const groqReply = await getGroqReply(phone || "test-user", message);
      if (groqReply && !groqReply.includes("I'm sorry, I'm having trouble responding right now")) {
        aiReply = groqReply;
      } else {
        aiReply = getLocalFallbackReply(message);
      }
    } else if (aiReply.includes("I'm sorry, I'm having trouble responding right now")) {
      aiReply = getLocalFallbackReply(message);
    }
    
    messageLogs.unshift({
      time: new Date().toISOString(),
      phone: phone || "Live Demo Tab",
      name: "Demo User",
      incoming: message,
      outgoing: aiReply,
      status: "sent",
    });
    res.json({ success: true, reply: aiReply });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// ============================================
// Smart Local Fallback (When AI is down)
// ============================================
function getLocalFallbackReply(message) {
  const msg = message.toLowerCase();
  let cars = [];
  try {
    cars = JSON.parse(fs.readFileSync(path.join(__dirname, "data/cars.json"), "utf8"));
  } catch(e) {}
  
  if (msg.includes("xuv700")) {
    const car = cars.find(c => c.model.includes("XUV700"));
    return `The Mahindra XUV700 is a premium SUV starting from ${car ? car.price : '₹14 Lakh'}. 🚙\n\nWould you like to see its variants or book a test drive?`;
  }
  if (msg.includes("thar")) {
    const car = cars.find(c => c.model.includes("Thar"));
    return `The Mahindra Thar is a legendary offroader starting from ${car ? car.price : '₹11 Lakh'}. ⛰️\n\nWould you like to see its variants or book a test drive?`;
  }
  if (msg.includes("scorpio")) {
    const car = cars.find(c => c.model.includes("Scorpio"));
    return `The Mahindra Scorpio-N is the 'Big Daddy of SUVs' starting from ${car ? car.price : '₹13 Lakh'}. 🦍\n\nWould you like to see its variants or book a test drive?`;
  }
  if (msg.includes("yes") || msg.includes("ok") || msg.includes("sure") || msg.includes("hii") || msg.includes("hi")) {
    return "Great! Which Mahindra car can I help you with today? We have the XUV700, Thar, and Scorpio-N in stock.";
  }
  if (msg.includes("price")) {
    return "Our range starts from ₹11 Lakh onwards. Which specific model's price would you like to know?";
  }
  
  return "I'm sorry, I'm having trouble connecting to my main brain right now. Please try again in a moment! 🙏";
}

app.get("/api/health", (req, res) => { res.json({ status: "running" }); });

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Mahindra AI Server running on port ${PORT}`);
  });
}

module.exports = app;
