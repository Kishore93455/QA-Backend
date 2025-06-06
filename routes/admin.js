const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authenticate, isAdmin } = require('../middleware/auth');


router.get('/users', authenticate, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

module.exports = router;