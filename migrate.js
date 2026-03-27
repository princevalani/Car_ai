// ============================================
// Data Migration Script (JSON -> MongoDB) - Cars & Leads
// ============================================
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { Car, Lead } = require('./services/dbService');

async function migrate() {
    try {
        console.log("🚀 Starting Full Data Migration...");
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("💎 Connected to MongoDB.");

        // --- MIGRATE CARS ---
        const carsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cars.json'), 'utf8'));
        console.log(`📂 Found ${carsData.length} cars in JSON.`);
        for (const car of carsData) {
            const exists = await Car.findOne({ model: car.model });
            if (!exists) {
                await new Car(car).save();
                console.log(`✅ Car Migrated: ${car.model}`);
            }
        }

        // --- MIGRATE LEADS ---
        const leadsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/leads.json'), 'utf8'));
        console.log(`📂 Found ${leadsData.length} leads in JSON.`);
        for (const lead of leadsData) {
            // Check if lead already exists (by name and phone)
            const exists = await Lead.findOne({ name: lead.name, phone: lead.phone, car: lead.car });
            if (!exists) {
                // Ensure date is string
                await new Lead({
                    name: lead.name,
                    phone: lead.phone,
                    car: lead.car,
                    date: lead.date,
                    status: lead.status || "New"
                }).save();
                console.log(`✅ Lead Migrated: ${lead.name}`);
            }
        }

        console.log("\n🏁 ALL DATA MIGRATED SUCCESSFULLY TO MONGODB!");
        process.exit();
    } catch (err) {
        console.error("❌ Migration Error:", err);
        process.exit(1);
    }
}

migrate();
