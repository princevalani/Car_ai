// ============================================
// Mistral AI Service - Fast AI Alternative (DB Edition)
// ============================================
const { Car, Lead } = require("./dbService"); // Real DB Models

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
        const saved = await newLead.save();
        console.log(`✅ TEST DRIVE BOOKED IN REAL DB (Mistral): ${name} (${phone}) - ${car}`);
        return saved;
    } catch(e) { console.error("Lead saving error", e); return null; }
}

async function getDynamicPrompt() {
    const cars = await getCarsDB();
    let carRules = "";
    cars.forEach(c => {
        let v = c.variants ? c.variants.join(", ") : "Standard";
        let co = c.colors ? c.colors.join(", ") : "Standard";
        let f = c.features ? c.features.join(", ") : "Standard";
        carRules += `- Model: ${c.model} | Price: ${c.price} | Variants: ${v} | Colors: ${co} | Features: ${f}\n`;
    });

    return `
You are "Mahindra Mitra", the Expert Sales Manager for Mahindra Auto Showroom.
Your objective is to provide a premium, luxury experience to the customer and GUIDE them to book a Test Drive.

💎 TONE & STYLE:
- Professional yet friendly (Hinglish/English/Hindi).
- Use relevant emojis (🚙, ✨, 💰, 📍).
- Keep responses concise and easy to read on WhatsApp.

🚀 SMART CONVERSATION LOGIC:
1. **Context Awareness**: If the user mentions a car model (e.g., "Thar details"), SKIP initial questions and give details immediately.
2. **Comparison**: If a user asks to compare models, provide a quick bullet-point comparison.
3. **Finance & EMI Advisor**: 
   - If user asks about EMI/Finance:
     * Assume a standard **9% p.a. Interest Rate**.
     * Ask for **Down Payment** amount.
     * Ask for **Tenure** (e.g., 3, 5, or 7 years).
     * Calculate and provide a *tentative* Monthly EMI figure.
4. **Sales Flow**:
   - PHASE A: Information (Variants, Colors, Features, Price).
   - PHASE B: Finance (EMI calculations if asked).
   - PHASE C: Lead Generation (Ask for Name, Phone, and Preferred Date for Test Drive).

📊 INVENTORY DATA:
${carRules || "Updating inventory..."}

⚠️ STRICT RULES:
- ONLY sell cars from the INVENTORY above.
- Be VERY CLEAR that EMI figures are "Tentative & Subject to Bank Approval".
- If a user provides booking details, ALWAYS generate the ||LEAD|| string at the very end.
- Use bold text for car names, prices, and EMI amounts.

LEAD FORMAT (Hidden):
||LEAD||<Name>||<Phone>||<Car Model>||<Date/Time>||
`;
}

const chatHistories = new Map();

async function getMistralReply(customerPhone, customerMessage) {
    try {
        const msgLower = customerMessage.toLowerCase();
        let history = chatHistories.get(customerPhone) || [];

        // Check for Greetings
        const greetings = ["hi", "hii", "hello", "start", "namaste", "hey"];
        if (greetings.some(g => msgLower === g)) {
            const welcome = `*Welcome to Mahindra's Elite Experience!* 🚙✨\n\nI am **Mahindra Mitra**, your personal AI Sales Manager.\n\nI can help you with:\n✅ Latest Car Details & Prices\n✅ Feature Comparisons\n✅ Booking a Test Drive\n\nWhich Mahindra car is on your mind today? (e.g., Thar, XUV700, Scorpio-N)`;
            history = [{ role: "assistant", content: welcome }];
            chatHistories.set(customerPhone, history);
            return welcome;
        }

        const dynamicKnowledge = await getDynamicPrompt();

        const reqBody = {
            model: "mistral-small-latest",
            messages: [
                { role: "system", content: dynamicKnowledge },
                ...history,
                { role: "user", content: customerMessage }
            ],
            temperature: 0.6,
            max_tokens: 1000
        };

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
            },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) throw new Error(`Mistral API Error: ${response.statusText}`);

        const data = await response.json();
        let aiReply = data.choices[0]?.message?.content || "Apologies, I'm facing a slight technical glitch. How else can I assist you?";

        // Lead Capture Logic
        const leadMatch = aiReply.match(/\|\|LEAD\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|/i);
        if (leadMatch) {
            const [_, lName, lPhone, lCar, lDate] = leadMatch;
            const leadObj = await saveLead(lName.trim(), lPhone.trim(), lCar.trim(), lDate.trim());
            aiReply = aiReply.replace(/\|\|LEAD\|\|.*/gi, '').trim();
            
            if (leadObj) {
                aiReply += `\n\n📄 *Your Booking Receipt is Ready!*\nDownload it here: http://localhost:3000/api/receipt/${leadObj._id}`;
            }
        }

        // Clean up stars for cleaner WhatsApp look if needed (optional)
        // aiReply = aiReply.replace(/\*\*/g, '*'); 

        // Update History
        history.push({ role: "user", content: customerMessage }, { role: "assistant", content: aiReply });
        chatHistories.set(customerPhone, history.slice(-10));

        return aiReply;

    } catch (error) {
        console.error("❌ Mistral Error:", error.message);
        return "I'm sorry, I'm having trouble responding right now. Please try again or visit our showroom! 🙏";
    }
}

module.exports = { getMistralReply };
