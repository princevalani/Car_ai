// ============================================
// MongoDB Database Service (Mongoose Models)
// ============================================
const mongoose = require('mongoose');

// Database Connection Logic
let isConnected = false;
const connectDB = async () => {
    try {
        if (isConnected || mongoose.connection.readyState === 1) {
            console.log("♻️ Using existing MongoDB connection");
            return true;
        }

        if (!process.env.MONGODB_URI) {
            console.warn("⚠️ MONGODB_URI missing in .env.");
            return false;
        }

        const options = {
            serverSelectionTimeoutMS: 30000, // Increased for Vercel
            socketTimeoutMS: 45000,
            family: 4 
        };

        console.log("⏳ Connecting to MongoDB Atlas...");
        const db = await mongoose.connect(process.env.MONGODB_URI, options);
        isConnected = true;
        console.log("💎 MongoDB Connected Successfully!");
        return true;
    } catch (err) {
        console.error("❌ MongoDB Connection Error Details:");
        console.error("-> Message:", err.message);
        console.error("-> Code:", err.code);
        return false;
    }
};

// 🚗 CAR MODEL (Inventory Management)
const carSchema = new mongoose.Schema({
    model: { type: String, required: true },
    price: { type: String, required: true },
    variants: [String],
    colors: [String],
    features: [String],
    image: String,
    category: String, // e.g. SUV, Offroader
    createdAt: { type: Date, default: Date.now }
});

// 👤 LEAD MODEL (Customer Leads)
const leadSchema = new mongoose.Schema({
    name: { type: String, required: true },
    phone: { type: String, required: true },
    car: String,
    date: String, // Requested test drive date
    status: { type: String, default: 'New' }, // New, Contacted, Completed
    source: { type: String, default: 'WhatsApp AI' },
    createdAt: { type: Date, default: Date.now }
});

// 💬 LOG MODEL (Conversation History)
const logSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    name: String,
    incoming: { type: String, required: true },
    outgoing: { type: String, required: true },
    status: { type: String, default: 'sent' },
    createdAt: { type: Date, default: Date.now }
});

const Car = mongoose.model('Car', carSchema);
const Lead = mongoose.model('Lead', leadSchema);
const Log = mongoose.model('Log', logSchema);

module.exports = { connectDB, Car, Lead, Log };
