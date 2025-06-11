require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

//log the calls to the server
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'logs.log'),
  { flags: 'a' }
);
morgan.token('username', (req) => {
  return req.user?.name || '-';
});
morgan.token('indian-datetime', () => {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
});
morgan.token('status-message', (req, res) => {
  if (res.statusCode >= 400) {
    return res.body?.message || res.statusMessage || 'ERROR';
  }
  return 'SUCCESS';
});
app.use(morgan(':username - :method - :url - :indian-datetime - :status - :status-message', {
  stream: accessLogStream,
  skip: (req) => req.method === 'OPTIONS'
}));


const authRoutes = require('./routes/auth');
const pdfRoutes = require('./routes/pdf');
const qaRoutes = require('./routes/qa');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const createPdfRouter = require('./routes/create_pdf');
const editPdfRouter = require('./routes/edit-pdf');



const corsOptions = {
  origin: 'http://localhost:4200', 
  credentials: true,
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: 'Origin,X-Requested-With,Content-Type,Accept,Authorization'
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));


app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/api/auth', authRoutes); 
app.use('/api/pdf', pdfRoutes);
app.use('/api/qa', qaRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/create_pdf', createPdfRouter);
app.use('/api/edit_pdf', editPdfRouter);


mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('Connected to MongoDB');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});