// ============================================
// Groq AI Service - Fast AI Alternative
// ============================================
// Ye file Groq SDK use karke Llama 3 se smart reply leti hai
// (Gemini ka best free alternative)

const Groq = require("groq-sdk");
const fs = require('fs');
const path = require('path');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ============================================
function getCarsDB() {
  try {
    const data = fs.readFileSync(path.join(__dirname, '../data/cars.json'), 'utf8');
    return JSON.parse(data);
  } catch(e) { return []; }
}

function saveLead(name, phone, car, date) {
  try {
    const file = path.join(__dirname, '../data/leads.json');
    const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    data.push({ id: Date.now(), name, phone, car, date, status: 'New' });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    console.log(`✅ TEST DRIVE BOOKED & SAVED TO DB (Groq Fallback): ${name} (${phone}) - ${car}`);
  } catch(e) { console.error("Lead saving error", e); }
}

function getDynamicPrompt() {
  const cars = getCarsDB();
  let carRules = "";
  cars.forEach(c => {
    let variantsStr = c.variants ? c.variants.join(", ") : "Standard";
    let colorsStr = c.colors ? c.colors.join(", ") : "Standard Colors";
    carRules += `- Model: ${c.model}\n  Variants: ${variantsStr}\n  Colors: ${colorsStr}\n  Price: ${c.price}\n  Features: ${c.features.join(", ")}\n  Image URL: ${c.image}\n\n`;
  });

  return `
You are "Mahindra Mitra", the Official AI Sales Assistant for the Mahindra Auto Showroom. You MUST communicate entirely in English.

**YOUR MAIN GOAL & IDENTITY:**
- You are a knowledgeable car expert working for Mahindra.
- You MUST answer ANY question the user asks about cars.
- If the user asks about ANYTHING ELSE, YOU MUST politely refuse.
- VERY IMPORTANT: YOU MUST COMMUNICATE 100% IN ENGLISH ONLY. NO HINDI. NO HINGLISH.

**DATABASE STRICT RULE (CRITICAL INVENTORY CHECK):**
- You MUST ONLY sell and offer Cars, Variants, and Colors explicitly listed in the "IN-STOCK KNOWLEDGE" database below.
- If a user asks for a car, color, or variant NOT in the database, YOU MUST REJECT IT immediately.

**CRITICAL RULE: VERY SHORT RESPONSES ONLY:**
- NEVER send big paragraphs.
- ONLY answer what the exact current step requires.
- NEVER combine variants, colors, price, or features in the same message. ONE AT A TIME ONLY.
- **SMART SKIP:** If the user ALREADY gave the information (e.g. they named the car 'XUV700'), DO NOT ask "Which car do you want?". Skip to the next step.

**STRICT STEP-BY-STEP FLOW (ONE STEP PER MESSAGE):**
Step 1: If they want a car but HAVEN'T named one, ONLY REPLY: "Which car are you interested in?"
Step 2: If they ask for a category (e.g., bs6), list the models with Image URLs, then ONLY ASK: "Which of these models do you like?"
Step 3: When they name a car (e.g., Thar), YOU MUST ONLY list variants: "Great choice! 🚙 Which specific variant would you like?\n\nWe currently have these in stock:\n- [Variant 1]\n- [Variant 2]"
Step 4: After they name a variant, YOU MUST ONLY list colors: "Awesome! 🎨 Which color do you prefer?\n\nThe exact colors we have for this model are:\n- [Color 1]\n- [Color 2]"
Step 5: Once a color is picked, YOU MUST ONLY REPLY: "Excellent choice! The [Car Name] in [Color] is available. 🚙\n\nWould you like to know its price?"
Step 6: If they ask for price, YOU MUST ONLY REPLY: "🏷️ *Price:* [Price]\n📸 *Image:* [Image URL]\n\nWould you like to know its features?"
Step 7: If they ask for features, YOU MUST ONLY REPLY: "Here are the key features:\n✅ [Feature 1]\n✅ [Feature 2]\n\nWould you like to book a test drive? 📅"
Step 8: If they say yes to a test drive OR ask directly to book one at any point, ask for their Name, Phone number, and preferred Booking Date/Time.
Step 9: Once they provide their details, YOU MUST say: "Thank you, [Name]! 🎉 Your test drive for the [Car] is booked for [Date/Time]. Our sales expert will contact you shortly."

**AVAILABLE IN-STOCK KNOWLEDGE (Use this to verify stock availability):**
${carRules}

**LEAD CAPTURE:**
If the user provides their Name, Phone number, and Date/Time for a test drive, append exactly this line at the VERY END of your reply (on a new line):
||LEAD||<Name>||<Phone>||<Car Model>||<Date/Time>||
`;
}

const chatHistories = new Map();

async function getGroqReply(customerPhone, customerMessage) {
  try {
    console.log(`\n🧠 Groq AI Processing from ${customerPhone}: "${customerMessage}"`);

    const msgLower = customerMessage.trim().toLowerCase();
    let history = chatHistories.get(customerPhone) || [];

    if (msgLower === "hi" || msgLower === "hii" || msgLower === "hello" || msgLower === "start") {
      const welcomeMessage = `*Welcome to Mahindra Auto Showroom!* 🚙✨\n\nI am your AI Assistant 'Mahindra Mitra'. How can I help you today?`;

      history.push(
        { role: "user", content: customerMessage },
        { role: "assistant", content: welcomeMessage }
      );
      if (history.length > 10) history = history.slice(-10);
      chatHistories.set(customerPhone, history);

      console.log(`✅ Standard Welcome Sent (Bypassed AI)`);
      return welcomeMessage;
    }

    const dynamicKnowledge = getDynamicPrompt();

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: dynamicKnowledge },
        ...history,
        { role: "user", content: customerMessage }
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 2048,
    });

    let aiReply = completion.choices[0]?.message?.content || "I'm sorry, I'm having trouble responding right now.";

    // 🏆 MAGIC STEP: Parse the hidden LEAD booking tag sent by AI
    const leadMatch = aiReply.match(/\|\|LEAD\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|/i);
    if (leadMatch) {
      const [_, lName, lPhone, lCar, lDate] = leadMatch;
      saveLead(lName.trim(), lPhone.trim(), lCar.trim(), lDate.trim());
      // Remove hidden tag so customer doesn't see it on WhatsApp!
      aiReply = aiReply.replace(/\|\|LEAD\|\|.*/gi, '').trim();
    }

    history.push(
      { role: "user", content: customerMessage },
      { role: "assistant", content: aiReply }
    );
    if (history.length > 10) history = history.slice(-10);
    chatHistories.set(customerPhone, history);

    console.log(`✅ Groq AI Reply: "${aiReply}"`);
    return aiReply;

  } catch (error) {
    console.error("❌ Groq Error:", error.message);
    return "I'm sorry, I'm having trouble responding right now. Please try again in a moment! 🙏";
  }
}

module.exports = { getGroqReply };

