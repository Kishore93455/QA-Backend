const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const OpenAI = require('openai');


const openai = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY, 
});

router.post('/chat', authenticate, async (req, res) => {
  try {
    const { question } = req.body;
    
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ 
        message: 'Question must be a non-empty string' 
      });
    }
  
    const completion = await openai.chat.completions.create({
      model: 'openai/gpt-4o',
      messages: [{
        role: 'user',
        content: question
      }],
      temperature: 0.4,
      max_tokens: 500
    });
    
    if (!completion?.choices?.[0]?.message?.content) {
      throw new Error('Invalid response structure from AI service');
    }
    
    res.json({ 
      answer: completion.choices[0].message.content 
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    
    if (error.message.includes('Invalid response structure')) {
      res.status(502).json({ 
        message: 'Received malformed response from AI service' 
      });
    } else if (error.message.includes('API key')) {
      res.status(401).json({ 
        message: 'Invalid API configuration' 
      });
    } else {
      res.status(500).json({ 
        message: 'Failed to process chat request',
        error: error.message
      });
    }
  }
});

module.exports = router;