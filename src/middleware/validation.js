const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        details: errors.array()
      }
    });
  }
  next();
};

const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').trim().notEmpty().withMessage('Name is required')
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

const createFolderValidation = [
  body('name').trim().notEmpty(),
  body('parent_id').optional({ nullable: true }).isUUID()
];

const moveValidation = [
  param('id').isUUID(),
  body('folder_id').optional({ nullable: true }).isUUID() // Changed from destinationId to folder_id
];

const shareValidation = [
  body('resourceType').isIn(['file', 'folder']),
  body('resourceId').isUUID(),
  body('granteeUserId').isUUID(),
  body('role').isIn(['viewer', 'editor'])
];

const starValidation = [
  body('resourceType').isIn(['file', 'folder']),
  body('resourceId').isUUID()
];

// Public link validation
const publicLinkValidation = [
  body('resourceType').isIn(['file', 'folder']),
  body('resourceId').isUUID(),
  body('expiresAt').optional({ nullable: true }).isISO8601(),
  body('password').optional({ nullable: true }).isString()
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  createFolderValidation,
  moveValidation,
  shareValidation,
  starValidation,
  publicLinkValidation
};