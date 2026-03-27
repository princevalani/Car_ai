// ============================================
// Gemini AI Service - Mahindra Expert Brain (DB Edition)
// ============================================
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Car, Lead } = require("./dbService"); // Real DB Models

// Gemini AI initialize
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
  model: "gemini-2.0-flash",
  generationConfig: { maxOutputTokens: 2048 }
});

// Read cars from Real DB
async function getCarsDB() {
    try {
        return await Car.find();
    } catch(e) { return []; }
}

// Write lead to Real DB
async function saveLead(name, phone, car, date) {
    try {
        const newLead = new Lead({ name, phone, car, date });
        await newLead.save();
        console.log(`✅ TEST DRIVE BOOKED IN REAL DB: ${name} (${phone}) - ${car}`);
    } catch(e) { console.error("Lead saving error", e); }
}

async function getSystemPrompt() {
  const cars = await getCarsDB();
  let carInventory = "";
  cars.forEach(c => {
    const v = c.variants ? c.variants.join(", ") : "Standard";
    const co = c.colors ? c.colors.join(", ") : "Standard";
    const f = c.features ? c.features.join(", ") : "Standard";
    carInventory += `- Model: ${c.model} | Price: ${c.price} | Variants: ${v} | Colors: ${co} | Features: ${f} | Image: ${c.image}\n`;
  });

  return `
You are "Mahindra Mitra", the Expert Sales Assistant for Mahindra Auto.
Your goal is to guide the customer through a step-by-step sales flow.

STRICT RULES:
1. ALWAYS reply in the SAME LANGUAGE as the user (Hindi/English/Hinglish).
2. ONLY one step per message. Do not give all info at once.
3. ONLY recommend cars from the inventory below.

INVENTORY DATA (FROM LIVE DATABASE):
${carInventory || "Inventory currently updating..."}

STRICT CONVERSATION FLOW:
- Step 1: If user is interested but hasn't picked a car, ask: "Which Mahindra car are you interested in?"
- Step 2: Once they pick a car, list ONLY the variants and ask which one they like.
- Step 3: Once a variant is picked, list ONLY the available colors.
- Step 4: Once a color is picked, provide the Price 🏷️ and ask if they want to know the Features.
- Step 5: After features, ask if they want to book a Test Drive 📅.
- Step 6: For a Test Drive, ask for their Name, Phone, and preferred Date/Time.

LEAD CAPTURE FORMAT:
If a user provides their Name, Phone, and Date/Time for a test drive, you MUST add this line at the VERY BOTTOM of your reply:
||LEAD||<Name>||<Phone>||<Car Model>||<Date/Time>||
`;
}

const chatHistories = new Map();

async function getAIReply(customerPhone, customerMessage, retryCount = 0) {
  try {
    const msgLower = customerMessage.toLowerCase();
    let history = chatHistories.get(customerPhone) || [];

    // Fast Welcome Menu
    if (["hi", "hii", "hello", "start"].includes(msgLower)) {
      const welcome = `*Welcome to Mahindra Auto Showroom!* 🚙✨\n\nI am your AI Assistant 'Mahindra Mitra'. How can I help you today?`;
      history.push({ role: "user", parts: [{ text: customerMessage }] }, { role: "model", parts: [{ text: welcome }] });
      chatHistories.set(customerPhone, history.slice(-20));
      return welcome;
    }

    const systemPrompt = await getSystemPrompt();

    const chat = model.startChat({
      history: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Understood! I am Mahindra Mitra. I am using the Real-time Database for inventory." }] },
        ...history,
      ],
    });

    const result = await chat.sendMessage(customerMessage);
    let aiReply = result.response.text();

    // Parse Lead
    const leadMatch = aiReply.match(/\|\|LEAD\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|/i);
    if (leadMatch) {
      const [_, lName, lPhone, lCar, lDate] = leadMatch;
      await saveLead(lName.trim(), lPhone.trim(), lCar.trim(), lDate.trim());
      aiReply = aiReply.replace(/\|\|LEAD\|\|.*/gi, '').trim();
    }

    // Clean up unnecessary stars/markdown
    aiReply = aiReply.replace(/\*/g, '').trim();

    history.push({ role: "user", parts: [{ text: customerMessage }] }, { role: "model", parts: [{ text: aiReply }] });
    chatHistories.set(customerPhone, history.slice(-20));

    return aiReply;

  } catch (error) {
    if (retryCount < 3 && (error.status === 429 || error.message?.includes("quota"))) {
      await new Promise(r => setTimeout(r, 2000));
      return getAIReply(customerPhone, customerMessage, retryCount + 1);
    }
    console.error("Gemini Error:", error);
    return "I'm sorry, I'm having trouble responding right now. Please try again! 🙏";
  }
}

function clearChatHistory(phone) { chatHistories.delete(phone); }
function getActiveChatCount() { return chatHistories.size; }

module.exports = { getAIReply, clearChatHistory, getActiveChatCount };
