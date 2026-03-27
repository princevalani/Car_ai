require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelsToTest = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp', 'gemini-1.0-pro'];
  
  for (const m of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("test");
      console.log(`✅ Model ${m} is available and working.`);
    } catch (e) {
      console.log(`❌ Model ${m} failed: ${e.message}`);
      if (e.response) {
        console.log(`Error body: ${JSON.stringify(await e.response.json())}`);
      }
    }
  }
}

listModels();
