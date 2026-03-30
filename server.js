// ============================================
// Mahindra Showroom AI Auto-Reply Server
// ============================================
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { connectDB, Car, Lead } = require("./services/dbService");
const { getMistralReply } = require("./services/mistralService");
const { sendWhatsAppMessage } = require("./services/elevenZaService");
const fs = require('fs');
const PDFDocument = require('pdfkit');

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
// WEBHOOK ENDPOINT (Advanced Payload Support)
// ============================================
app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    
    // Ensure DB is connected before processing
    await connectDB();
    
    // Ignore status updates
    if (payload.event && payload.event !== "MoMessage") {
      return res.status(200).json({ status: "skipped", reason: "Not an incoming message" });
    }

    // Advanced Parsing based on the provided payload structure
    let customerPhone = payload.from || payload.phone || "";
    let customerName = payload.whatsapp?.senderName || payload.name || "Customer";
    let customerMessage = null;

    if (payload.content && payload.content.contentType === "text") {
        customerMessage = payload.content.text?.trim() || null;
    } else if (payload.content && payload.content.contentType === "media") {
        // Here you would normally handle Voice/STT logic
        console.log("🎤 Media/Voice message received, text extraction needed.");
        customerMessage = payload.content.text?.trim() || "audio message"; // Fallback
    } else {
        // Fallback for simple flat JSON payloads
        customerMessage = payload.text || payload.message || "";
    }

    stats.totalReceived++;

    if (!customerMessage) {
        return res.status(200).json({ status: "skipped", reason: "No text content found" });
    }

    let aiReply = "";
    try {
      console.log(`🤖 Processing message for ${customerPhone}: "${customerMessage}"`);
      // Mistral is the ONLY Primary AI 🦍
      if (process.env.MISTRAL_API_KEY) {
        aiReply = await getMistralReply(customerPhone, customerMessage);
        console.log(`✨ AI Result: "${aiReply.substring(0, 50)}..."`);
      }

      // Final Local Fallback if AI fails or returns empty
      if (!aiReply || aiReply.includes("I'm sorry, I'm having trouble")) {
        console.log("⚠️ Falling back to Local AI logic!");
        aiReply = getLocalFallbackReply(customerMessage);
      }
    } catch (aiErr) {
       console.error(`❌ AI Processing Error: ${aiErr.message}`);
       aiReply = getLocalFallbackReply(customerMessage);
    }

    const sendResult = await sendWhatsAppMessage(customerPhone, aiReply);
    if (sendResult.success) {
        stats.totalReplied++;
        console.log(`✅ Message sent to ${customerPhone}`);
    } else {
        console.log(`❌ Failed to send message to ${customerPhone}: ${sendResult.error || "Unknown Error"}`);
    }

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
    activeChats: 0, // Gemini history count removed
    uptime: Math.floor((Date.now() - stats.startTime.getTime()) / 1000),
  });
});

app.get("/api/logs", (req, res) => { res.json(messageLogs); });

// ============================================
// PDF RECEIPT GENERATOR 📄
// ============================================
app.get("/api/receipt/:id", async (req, res) => {
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).send("Lead not found");

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Mahindra_Receipt_${lead.name.replace(/\s/g, '_')}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('MAHINDRA AUTO SHOWROOM', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('Virtual Sales Receipt', { align: 'center' });
        doc.moveDown(2);

        // Content Box
        doc.rect(50, 150, 500, 200).stroke();
        doc.fontSize(14).font('Helvetica-Bold').text('BOOKING DETAILS', 70, 170);
        doc.moveDown();

        doc.fontSize(12).font('Helvetica');
        doc.text(`Customer Name: ${lead.name}`, 70);
        doc.text(`Phone Number: ${lead.phone}`, 70);
        doc.text(`Car Interest: ${lead.car}`, 70);
        doc.text(`Appointment: ${lead.date}`, 70);
        doc.moveDown();

        doc.fontSize(10).text(`Generated On: ${new Date().toLocaleString()}`, 70);

        // Footer
        doc.moveDown(5);
        doc.fontSize(12).font('Helvetica-Oblique').text('Experience the Mahindra Power!', { align: 'center' });
        doc.fontSize(8).text('Note: This is a system-generated receipt and for reference only.', { align: 'center' });

        doc.end();

    } catch (err) {
        res.status(500).send("Error generating PDF: " + err.message);
    }
});

app.post("/api/toggle-ai", (req, res) => {
  stats.aiEnabled = !stats.aiEnabled;
  res.json({ aiEnabled: stats.aiEnabled });
});

app.post("/api/test-reply", async (req, res) => {
  const { phone, message } = req.body;
  try {
    let aiReply = "";

    // 1️⃣ Mistral is now ONLY AI 🦍
    if (process.env.MISTRAL_API_KEY) {
        const mistralReply = await getMistralReply(phone || "test-user", message);
        if (mistralReply && !mistralReply.includes("I'm sorry, I'm having trouble")) {
            aiReply = mistralReply;
        }
    }
    
    // 2️⃣ Final Local Fallback
    if (!aiReply || aiReply.includes("I'm sorry, I'm having trouble")) {
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
