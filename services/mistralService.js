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
        await newLead.save();
        console.log(`✅ TEST DRIVE BOOKED IN REAL DB (Mistral): ${name} (${phone}) - ${car}`);
    } catch(e) { console.error("Lead saving error", e); }
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
You are "Mahindra Mitra", the Expert Sales Assistant for Mahindra Auto.
Your goal is to guide the customer through a step-by-step sales flow.

RULES:
1. ALWAYS reply in the SAME LANGUAGE as the user (Hindi/English/Hinglish).
2. ONLY one step per message. Do not give all info at once.
3. Use only the INVENTORY below.

INVENTORY:
${carRules || "Updating inventory..."}

STRICT CONVERSATION FLOW:
- Step 1: Ask "Which Mahindra car are you interested in?"
- Step 2: List variants only.
- Step 3: List colors only.
- Step 4: Show Price & ask about Features.
- Step 5: Ask if they want a Test Drive.
- Step 6: Get Name, Phone, and Date/Time for booking.

LEAD CAPTURE:
If a user provides details, add this hidden line at the end:
||LEAD||<Name>||<Phone>||<Car Model>||<Date/Time>||
`;
}

const chatHistories = new Map();

async function getMistralReply(customerPhone, customerMessage) {
    try {
        const msgLower = customerMessage.toLowerCase();
        let history = chatHistories.get(customerPhone) || [];

        if (["hi", "hii", "hello", "start"].includes(msgLower)) {
            const welcome = `*Welcome to Mahindra Auto Showroom!* 🚙✨\n\nI am your AI Assistant 'Mahindra Mitra'. How can I help you today?`;
            history.push({ role: "user", content: customerMessage }, { role: "assistant", content: welcome });
            chatHistories.set(customerPhone, history.slice(-10));
            return welcome;
        }

        const dynamicKnowledge = await getDynamicPrompt();

        const reqBody = {
            model: "mistral-small-latest", // Use mistral-large-latest or mistral-small-latest
            messages: [
                { role: "system", content: dynamicKnowledge },
                ...history,
                { role: "user", content: customerMessage }
            ],
            temperature: 0.7,
            max_tokens: 2048
        };

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`
            },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            console.error("Mistral API Error Status:", response.status);
            throw new Error(`Mistral API Error: ${response.statusText}`);
        }

        const data = await response.json();
        let aiReply = data.choices[0]?.message?.content || "I'm sorry, I'm having trouble responding right now.";

        const leadMatch = aiReply.match(/\|\|LEAD\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|(.*?)\|\|/i);
        if (leadMatch) {
            const [_, lName, lPhone, lCar, lDate] = leadMatch;
            await saveLead(lName.trim(), lPhone.trim(), lCar.trim(), lDate.trim());
            aiReply = aiReply.replace(/\|\|LEAD\|\|.*/gi, '').trim();
        }

        // Remove markdown stars from final reply
        aiReply = aiReply.replace(/\*/g, '').trim();

        history.push({ role: "user", content: customerMessage }, { role: "assistant", content: aiReply });
        chatHistories.set(customerPhone, history.slice(-10));

        return aiReply;

    } catch (error) {
        console.error("❌ Mistral Error:", error.message);
        return "I'm sorry, I'm having trouble responding right now. Please try again in a moment! 🙏";
    }
}

module.exports = { getMistralReply };
