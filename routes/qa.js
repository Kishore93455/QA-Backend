const express = require('express');
const router = express.Router();
const Pdf = require('../models/Pdf');
const { authenticate } = require('../middleware/auth');
const pdfParse = require('pdf-parse');
const fs = require('fs');

router.post('/ask/:pdfId', authenticate, async (req, res) => {
  try {
    const { pdfId } = req.params;
    const { question } = req.body;
    
    if (!question) {
      return res.status(400).json({ message: 'Question is required' });
    }
    
    const pdf = await Pdf.findOne({ _id: pdfId, user: req.user._id });
    
    if (!pdf) {
      return res.status(404).json({ message: 'PDF not found' });
    }
    
    if (!pdf.filePath) {
      return res.status(400).json({ 
        message: 'PDF file path not set',
        details: 'The PDF upload may have failed or the document was not properly saved'
      });
    }
    
    if (!fs.existsSync(pdf.filePath)) {
      return res.status(400).json({ 
        message: 'PDF file not found at stored location',
        details: `Expected path: ${pdf.filePath}`
      });
    }
    
    const dataBuffer = fs.readFileSync(pdf.filePath);
    const pdfData = await pdfParse(dataBuffer);
    const textChunks = pdfData.text.split(/\n\s*\n/);
    let bestAnswer = '';
    let bestScore = 0;
    
    textChunks.forEach(chunk => {
      const score = calculateRelevanceScore(chunk, question);
      if (score > bestScore) {
        bestScore = score;
        bestAnswer = chunk;
      }
    });
    
    res.json({ 
      answer: bestAnswer || 'No relevant answer found in the PDF',
      confidence: bestScore 
    });
  } catch (error) {
    console.error('QA error:', error);
    res.status(500).json({ message: 'Failed to process question' });
  }
});

function calculateRelevanceScore(text, question) {
  const questionWords = question.toLowerCase().split(/\s+/);
  const textWords = text.toLowerCase().split(/\s+/);
  
  let score = 0;
  questionWords.forEach(word => {
    if (textWords.includes(word)) {
      score += 1;
    }
  });
  
  return score / questionWords.length;
}

module.exports = router;