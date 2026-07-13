'use strict';
const { body, validationResult } = require('express-validator');

const validateJobCreate = [
  body('name').notEmpty().withMessage('name is required').isLength({ max: 200 }),
  body('sourcePlatform').isIn(['APIC', 'DATAPOWER', 'IIB_ACE']).withMessage('sourcePlatform must be APIC, DATAPOWER, or IIB_ACE'),
  body('complexity').isIn(['SIMPLE', 'INTERMEDIATE', 'COMPLEX']).withMessage('complexity must be SIMPLE, INTERMEDIATE, or COMPLEX'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    next();
  },
];

const validateUpload = [
  (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    next();
  },
];

module.exports = { validateJobCreate, validateUpload };
