// ============================================
// Mistral AI Service - Fast AI Alternative (DB Edition)
// ============================================
const { Car, Lead } = require("./dbService"); // Real DB Models

// Read cars from Real DB (Primary Source)
async function getCarsDB() {
    try {
        // Dynamic DB Fetch with 5-second timeout
        const cars = await Car.find().maxTimeMS(5000);
        if (cars && cars.length > 0) return cars;
        return [];
    } catch(e) { 
        console.error("❌ MONGODB ERROR ON VERCEL:", e.message);
        console.log("👉 Suggestion: Add 0.0.0.0/0 in MongoDB Atlas Network Access!");
        throw e; // Stop here if DB is not working
    }
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
    console.log(`📡 Inventory Feed: Found ${cars.length} cars in Database.`);
    
    let carRules = "";
    cars.forEach(c => {
        let v = c.variants ? c.variants.join(", ") : "Standard";
        let co = c.colors ? c.colors.join(", ") : "Standard";
        let f = c.features ? c.features.join(", ") : "Standard";
        carRules += `- Model: **${c.model}** | Price: **${c.price}** | Variants: **${v}** | Colors: **${co}** | Features: **${f}**\n`;
    });

    if (cars.length === 0) {
        console.warn("⚠️ ALERT: AI is working with ZERO inventory! Using local memory fallback.");
    }

    return `
You are "Mahindra Mitra", the Expert Sales Manager for Mahindra Auto Showroom.
Your objective is to provide a premium, luxury experience to the customer and GUIDE them to book a Test Drive.

### 🔴 STRICT CONVERSATIONAL RULES:
1. **NEVER give all details at once.** This is a dialogue, not a brochure.
2. **KEEP REPLIES SHORT (1-2 sentences only).** Be professional and snappy.
3. **ONE DETAIL AT A TIME:** If asked about a car, give ONLY the starting price or the most popular variant first, then ASK a question.
4. **ALWAYS ASK A QUESTION:** Every message must end with a question to narrow down the customer's interest (e.g., "Would you like to know about the variants or the colors?").
5. **LANGUAGE:** Use the same language as the customer (Hinglish/English/Hindi).

### Showroom Inventory:
${carRules || "Updating inventory..."}

### Lead Generation Format (Hidden):
||LEAD||<Name>||<Phone>||<Car Model>||<Date/Time>||
`;
}

const chatHistories = new Map();

async function getMistralReply(customerPhone, customerMessage, host = "localhost:3000") {
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
                const protocol = host.includes('localhost') ? 'http' : 'https';
                aiReply += `\n\n📄 *Your Booking Receipt is Ready!*\nDownload it here: ${protocol}://${host}/api/receipt/${leadObj._id}`;
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
