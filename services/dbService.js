// ============================================
// MongoDB Database Service (Mongoose Models)
// ============================================
const mongoose = require('mongoose');

// Database Connection Logic
const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            console.warn("⚠️ MONGODB_URI missing in .env. Using JSON fallback for now.");
            return false;
        }
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("💎 MongoDB Connected Successfully!");
        return true;
    } catch (err) {
        console.error("❌ MongoDB Connection Error:", err.message);
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

const Car = mongoose.model('Car', carSchema);
const Lead = mongoose.model('Lead', leadSchema);

module.exports = { connectDB, Car, Lead };
