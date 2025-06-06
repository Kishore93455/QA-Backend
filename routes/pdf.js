const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Pdf = require('../models/Pdf');
const { authenticate } = require('../middleware/auth');


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.resolve('uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  }
});


router.post('/upload', authenticate, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No PDF file uploaded' });
    }
    const absolutePath = path.resolve(req.file.path);
    if (!fs.existsSync(absolutePath)) {
      throw new Error('Uploaded file not found on disk');
    }
    const title = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const pdf = new Pdf({
      title,
      originalName: req.file.originalname,
      filePath: absolutePath,
      user: req.user._id
    });
    const validationError = pdf.validateSync();
    if (validationError) {
      throw validationError;
    }
    await pdf.save();
    const savedDoc = await Pdf.findById(pdf._id);
    if (!savedDoc.filePath) {
      throw new Error('filePath not saved to database');
    }
    res.status(201).json({
      message: 'PDF uploaded successfully',
      pdf: {
        id: pdf._id,
        title: pdf.title,
        originalName: pdf.originalName,
        filePath: pdf.filePath
      }
    });
  } catch (error) {
    console.error('PDF upload error:', error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ 
      message: 'Failed to upload PDF',
      error: error.message 
    });
  }
});


router.get('/user', authenticate, async (req, res) => {
  try {
    const pdfs = await Pdf.find({ user: req.user._id }).sort({ createdAt: -1 });
    
    res.json(pdfs.map(pdf => ({
      _id: pdf._id,
      title: pdf.title,
      originalName: pdf.originalName,
      createdAt: pdf.createdAt
    })));
  } catch (error) {
    console.error('Get PDFs error:', error);
    res.status(500).json({ message: 'Failed to fetch PDFs' });
  }
});


router.delete('/:id', authenticate, async (req, res) => {
  try {
    const pdf = await Pdf.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!pdf) {
      return res.status(404).json({ message: 'PDF not found' });
    }
    
    if (fs.existsSync(pdf.filePath)) {
      fs.unlinkSync(pdf.filePath);
    }

    await pdf.deleteOne();
    
    res.json({ message: 'PDF deleted successfully' });
  } catch (error) {
    console.error('Delete PDF error:', error);
    res.status(500).json({ message: 'Failed to delete PDF' });
  }
});


router.get('/:id', authenticate, async (req, res) => {
  try {
    const pdf = await Pdf.findOne({ _id: req.params.id, user: req.user._id });
    
    if (!pdf) {
      return res.status(404).json({ message: 'PDF not found' });
    }
    
    if (!fs.existsSync(pdf.filePath)) {
      return res.status(404).json({ message: 'PDF file not found' });
    }
    
    res.sendFile(path.resolve(pdf.filePath));
  } catch (error) {
    console.error('View PDF error:', error);
    res.status(500).json({ message: 'Failed to retrieve PDF' });
  }
});

module.exports = router;