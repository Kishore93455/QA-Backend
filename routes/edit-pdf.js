const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const pdfParse = require('pdf-parse');

const upload = multer({ dest: 'temp/' });

let extractedSections = [];
let templateFilePath = null;

const sanitizeText = (text) => {
  return text
    .replace(/\r/g, '')
    .replace(/[▪■●•]/g, '•')
    .replace(/[^\x00-\x7F]/g, '');
};


function restoreDynamicSpaces(text) {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .replace(/([^\s])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])([^a-zA-Z0-9\s])/g, '$1 $2')
    .replace(/([^a-zA-Z0-9\s])([a-zA-Z])/g, '$1 $2')
    .replace(/(\w)([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z]{2,})(?=[A-Z])/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const extractSections = (text) => {
  const regex = /([A-Z][A-Z\s]{2,}):?\s*\n([\s\S]*?)(?=\n[A-Z][A-Z\s]{2,}:?\s*\n|$)/g;
  const matches = [...text.matchAll(regex)];
  return matches.map(m => ({
    heading: m[1].trim(),
    content: m[2].trim()
  }));
};

router.post('/upload', upload.fields([{ name: 'contentPdf' }, { name: 'templatePdf' }]), async (req, res) => {
  try {
    if (!req.files || !req.files['contentPdf']) {
      return res.status(400).json({ message: 'Content PDF is required' });
    }

    const contentPdfPath = req.files['contentPdf'][0].path;
    const contentBuffer = fs.readFileSync(contentPdfPath);
    const parsed = await pdfParse(contentBuffer);
    extractedSections = extractSections(parsed.text);

    if (req.files['templatePdf']) {
      templateFilePath = req.files['templatePdf'][0].path;
    } else {
      templateFilePath = null;
    }

    fs.unlinkSync(contentPdfPath);
    if (extractedSections.length === 0) {
      if (templateFilePath) fs.unlinkSync(templateFilePath);
      return res.status(400).json({ message: 'No sections found in PDF' });
    }

    res.json({ sections: extractedSections });
  } catch (error) {
    console.error('PDF upload error:', error);
    if (req.files['contentPdf']) fs.unlinkSync(req.files['contentPdf'][0].path);
    if (req.files['templatePdf']) fs.unlinkSync(req.files['templatePdf'][0].path);
    res.status(500).json({ message: 'Error processing PDF' });
  }
});

router.post('/download', async (req, res) => {
  try {
    if (!req.body.sections || !Array.isArray(req.body.sections)) {
      return res.status(400).json({ message: 'Invalid sections data' });
    }

    const sections = req.body.sections;
    const fontSize = 14;
    const margin = 100;
    const bottomMargin = 100;
    const lineHeight = 18;

    let pdfDoc;
    let page;
    let addTemplatedPage;

    if (templateFilePath) {
      const templateBytes = fs.readFileSync(templateFilePath);
      const loaded = await PDFDocument.load(templateBytes);

      pdfDoc = await PDFDocument.create();

      addTemplatedPage = async () => {
        const [newTemplatePage] = await pdfDoc.copyPages(loaded, [0]);
        pdfDoc.addPage(newTemplatePage);
        return pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
      };

      page = await addTemplatedPage();
    } else {
      pdfDoc = await PDFDocument.create();
      pdfDoc.addPage();
      page = pdfDoc.getPages()[0];
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();
    let y = height - margin;

    async function writeAlignedText({ page, text, font, fontSize, x, yStart, maxWidth, lineHeight, bottomMargin, margin, addPageFn }) {
      const { width, height } = page.getSize();
      let y = yStart;

      const cleanedText = restoreDynamicSpaces(sanitizeText(text)); 
      const lines = cleanedText.split('\n');

      for (const rawLine of lines) {
        const words = rawLine.trim().split(/\s+/);
        let currentLine = '';

        for (const word of words) {
          const testLine = currentLine ? currentLine + ' ' + word : word;
          const testWidth = font.widthOfTextAtSize(testLine, fontSize);

          if (testWidth > maxWidth) {
            page.drawText(currentLine, { x: x + 10, y, size: fontSize, font });

            y -= lineHeight;
            if (y < bottomMargin) {
              page = await addPageFn();
              y = height - margin;
            }

            currentLine = word;
          } else {
            currentLine = testLine;
          }
        }

        if (currentLine) {
          page.drawText(currentLine, { x: x + 10, y, size: fontSize, font });
          y -= lineHeight;

          if (y < bottomMargin) {
            page = await addPageFn();
            y = height - margin;
          }
        }

        y -= 5;
      }

      return { page, y };
    }

    const drawBlock = async (heading, content) => {
      if (y < bottomMargin + lineHeight) {
        page = templateFilePath ? await addTemplatedPage() : pdfDoc.addPage();
        y = height - margin;
      }

      page.drawText(`${heading}:`, { x: margin, y, size: fontSize + 2, font });
      y -= lineHeight;

      const result = await writeAlignedText({
        page,
        text: content,
        font,
        fontSize,
        x: margin,
        yStart: y,
        maxWidth: width - (margin * 2),
        lineHeight,
        bottomMargin,
        margin,
        addPageFn: async () => {
          const newPage = templateFilePath ? await addTemplatedPage() : pdfDoc.addPage();
          page = newPage;
          return newPage;
        }
      });

      page = result.page;
      y = result.y - lineHeight;
    };

    for (const section of sections) {
      await drawBlock(section.heading, section.content);
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=edited_output.pdf');
    res.send(Buffer.from(pdfBytes));

    if (templateFilePath && fs.existsSync(templateFilePath)) {
      fs.unlinkSync(templateFilePath);
      templateFilePath = null;
    }
  } catch (error) {
    console.error('PDF download error:', error);
    res.status(500).json({ message: 'Error generating PDF' });
  }
});

module.exports = router;
