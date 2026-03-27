require('dotenv').config();
const axios = require('axios');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  
  try {
    const response = await axios.get(url);
    console.log('✅ Models List:', JSON.stringify(response.data.models.map(m => m.name), null, 2));
  } catch (err) {
    console.error('❌ Error status:', err.response?.status);
    console.error('❌ Error data:', JSON.stringify(err.response?.data, null, 2));
  }
}

listModels();
