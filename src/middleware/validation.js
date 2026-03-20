const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', details: errors.array() }
    });
  }
  next();
};

const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').trim().notEmpty().withMessage('Name is required'),
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

const createFolderValidation = [
  body('name').trim().notEmpty(),
  body('parent_id').optional({ nullable: true }).isUUID(),
];

const moveValidation = [
  param('id').isUUID(),
  body('folder_id').optional({ nullable: true }).isUUID(),
];

// use snake_case to match what controllers read
const shareValidation = [
  body('resource_type').isIn(['file', 'folder']),
  body('resource_id').isUUID(),
  body('role').optional({ nullable: true }).isIn(['viewer', 'editor']),
];

// use snake_case to match what starController reads
const starValidation = [
  body('resource_type').isIn(['file', 'folder']),
  body('resource_id').isUUID(),
];

const publicLinkValidation = [
  body('resource_type').isIn(['file', 'folder']),
  body('resource_id').isUUID(),
  body('expires_at').optional({ nullable: true }).isISO8601(),
  body('password').optional({ nullable: true }).isString(),
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  createFolderValidation,
  moveValidation,
  shareValidation,
  starValidation,
  publicLinkValidation,
};