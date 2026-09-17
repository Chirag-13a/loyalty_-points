const express = require('express');
const { advanceClock, listOutbox } = require('../controllers/systemController');

const router = express.Router();
router.post('/clock', advanceClock);
router.get('/outbox', listOutbox);

module.exports = router;
