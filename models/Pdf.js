const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vectorized: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model('Pdf', pdfSchema);