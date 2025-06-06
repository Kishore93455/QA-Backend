const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const nlp = require('compromise');

const upload = multer({ storage: multer.memoryStorage() });

async function createTemplatedPDF(templatePdfBuffer, userText) {
  const originalPdf = await PDFDocument.load(templatePdfBuffer);
  const originalPages = originalPdf.getPages();
  const templatePage = originalPages[0];
  const { width, height } = templatePage.getSize();

  const pdfDoc = await PDFDocument.create();
  const [copiedPage] = await pdfDoc.copyPages(originalPdf, [0]);
  pdfDoc.addPage(copiedPage);

  const sanitizeText = (text) => text.replace(/[^\x20-\x7E\n]/g, '');
  const sanitizedText = sanitizeText(userText);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = 14;
  const margin = {
    top: 50,
    bottom: 30,
    left: 50,
    right: 0
  };
  const lineHeight = 25;
  const contentWidth = width - (margin.left + margin.right);
  const usableHeight = height - margin.top - margin.bottom;
  const maxLinesPerPage = Math.floor(usableHeight / lineHeight);

  // === NLP: Break into sentences ===
  const doc = nlp(sanitizedText);
  const sentences = doc.sentences().out('array');

  let lines = [];

  // Wrap each sentence manually based on approx width
  const maxCharsPerLine = Math.floor(contentWidth / (fontSize * 0.6));
  for (const sentence of sentences) {
    if (sentence.length <= maxCharsPerLine) {
      lines.push(sentence);
    } else {
      for (let i = 0; i < sentence.length; i += maxCharsPerLine) {
        lines.push(sentence.slice(i, i + maxCharsPerLine));
      }
    }
  }

  const totalPagesNeeded = Math.ceil(lines.length / maxLinesPerPage);
  while (pdfDoc.getPages().length < totalPagesNeeded) {
    const [newPage] = await pdfDoc.copyPages(originalPdf, [0]);
    pdfDoc.addPage(newPage);
  }

  
  const pages = pdfDoc.getPages();
  for (let pageIndex = 0; pageIndex < totalPagesNeeded; pageIndex++) {
    const page = pages[pageIndex];
    let y = height - margin.top;

    const startLine = pageIndex * maxLinesPerPage;
    const endLine = startLine + maxLinesPerPage;
    const pageLines = lines.slice(startLine, endLine);

    for (const line of pageLines) {
      page.drawText(line, {
        x: margin.left,
        y,
        size: fontSize,
        font,
        color: rgb(0, 0, 0)
      });
      y -= lineHeight;
    }
  }

  return await pdfDoc.save();
}

router.post('/generate-pdf', authenticate, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file || !req.body.data) {
      return res.status(400).json({ error: 'Missing PDF template or data' });
    }

    const finalPdf = await createTemplatedPDF(req.file.buffer, req.body.data);

    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(finalPdf));
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating PDF');
  }
});

module.exports = router;
