require('dotenv').config();
const axios = require('axios');

async function testFetch() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: "test" }] }]
    });
    console.log('✅ Success:', response.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error('❌ Error status:', err.response?.status);
    console.error('❌ Error message:', JSON.stringify(err.response?.data, null, 2));
  }
}

testFetch();
