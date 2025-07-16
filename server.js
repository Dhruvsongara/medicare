require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../client')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// API Keys
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const API_NINJAS_KEY = process.env.API_NINJAS_KEY;

// Health-related keywords to determine if query is medical
const MEDICAL_KEYWORDS = [
  'pain', 'symptom', 'fever', 'headache', 'stomach', 'ache', 'ill', 'sick',
  'medicine', 'drug', 'treatment', 'diagnose', 'diagnosis', 'doctor', 'hospital',
  'health', 'medical', 'condition', 'disease', 'infection', 'injury', 'wound',
  'cough', 'cold', 'flu', 'vomit', 'nausea', 'dizzy', 'rash', 'allergy',
  'blood', 'pressure', 'diabetes', 'asthma', 'heart', 'lung', 'liver', 'kidney',
  'prescription', 'pharmacy', 'vaccine', 'vaccination', 'covid', 'corona',
  'antibiotic', 'tablet', 'pill', 'injection', 'test', 'x-ray', 'scan', 'MRI',
  'pregnant', 'pregnancy', 'baby', 'child', 'elderly', 'senior', 'old'
];

// Common responses for frequent queries
const COMMON_RESPONSES = {
  'headache': `For headaches, try these remedies:
  1. Rest in a quiet, dark room
  2. Apply a cool compress to your forehead
  3. Stay hydrated
  4. Over-the-counter options in India: Paracetamol (Crocin), Ibuprofen (Brufen)
  5. See a doctor if: severe pain, lasts >2 days, or with fever/vision changes`,
  
  'fever': `For fever management:
  1. Rest and drink plenty of fluids
  2. Take Paracetamol (Crocin) as directed
  3. Use lukewarm sponge baths if needed
  4. Monitor temperature regularly
  5. Seek medical help if: fever >103°F, lasts >3 days, or with rash/breathing difficulty`
};

// Function to check if query is health-related
function isHealthRelated(query) {
  const lowerQuery = query.toLowerCase();
  return MEDICAL_KEYWORDS.some(keyword => lowerQuery.includes(keyword));
}

// Retry wrapper for API calls
async function withRetry(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || error.response?.status !== 429) {
      throw error;
    }
    await new Promise(res => setTimeout(res, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// Route to handle text queries
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // First check if the query is health-related
    if (!isHealthRelated(message)) {
      return res.json({ 
        reply: "I'm sorry, I can only assist with health-related questions. Please ask about medical symptoms, conditions, or treatments."
      });
    }

    // Check common responses first
    const lowerMessage = message.toLowerCase();
    for (const [key, response] of Object.entries(COMMON_RESPONSES)) {
      if (lowerMessage.includes(key)) {
        return res.json({ reply: response });
      }
    }

    // Try API Ninjas first for factual medical information
    try {
      const apiNinjasResponse = await axios.get(
        'https://api.api-ninjas.com/v1/health',
        {
          params: { query: message },
          headers: { 'X-Api-Key': API_NINJAS_KEY },
          timeout: 3000 // Fail fast if API is slow
        }
      ).catch(error => {
        console.log('API Ninjas error:', error.message);
        return null;
      });

      if (apiNinjasResponse?.data?.length > 0) {
        let reply = "Here's what I found about your query:\n\n";
        apiNinjasResponse.data.forEach((item, index) => {
          reply += `*${item.topic || 'Information'}*:\n`;
          reply += `${item.match || item.information}\n\n`;
        });
        reply += "Remember to consult a doctor for personalized medical advice.";
        return res.json({ reply });
      }
    } catch (apiNinjasError) {
      console.log('API Ninjas not available, falling back to OpenAI');
    }

    // Fall back to OpenAI if API Ninjas doesn't have info
    const prompt = `You are a friendly and caring medical assistant in India. A patient asks: "${message}". 
    Please provide a helpful response that includes:
    1. Potential causes of the symptoms
    2. Recommended home remedies (if appropriate)
    3. Common over-the-counter medicines available in India that might help
    4. When they should definitely see a doctor
    5. General wellness advice
    Respond in a warm, compassionate tone and format the response clearly with bullet points.
    
    Important: If the question is not health-related, politely decline to answer and explain you can only help with medical questions.`;

    const response = await withRetry(() => axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    ));

    const botReply = response.data.choices[0].message.content;
    res.json({ reply: botReply });
  } catch (error) {
    console.error('Full error:', error);
    
    if (error.response?.status === 429) {
      return res.status(429).json({ 
        error: "I'm getting too many requests right now. Please wait a moment and try again."
      });
    }
    
    res.status(500).json({ 
      error: 'Something went wrong',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Route to handle image uploads (for skin conditions)
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const simulatedResponse = `
Based on the image you've shared, here's what I can suggest:

1. *Possible Condition*: The image shows signs that might indicate a common skin condition like dermatitis or a mild fungal infection.

2. *Recommended Care*:
   - Keep the area clean and dry
   - Apply an over-the-counter antifungal cream like Clotrimazole (available in India as Clodid, Candid, etc.)
   - Avoid scratching the area

3. *When to See a Doctor*:
   - If the condition worsens or spreads
   - If you develop fever or pus
   - If there's no improvement after 1 week of home care

Remember, I can't diagnose from images alone. Please consult a dermatologist for accurate diagnosis and treatment.
`;

    res.json({ reply: simulatedResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error processing image' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});