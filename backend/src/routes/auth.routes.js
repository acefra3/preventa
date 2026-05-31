// auth.routes.js
const router = require('express').Router();
const { login, refresh, logout, requestRecovery, resetPassword } = require('../controllers/auth.controller');

router.post('/login',          login);
router.post('/refresh',        refresh);
router.post('/logout',         logout);
router.post('/recovery',       requestRecovery);
router.post('/reset-password', resetPassword);

module.exports = router;
