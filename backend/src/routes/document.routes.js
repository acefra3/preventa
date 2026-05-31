const router = require('express').Router();
const multer = require('multer');
const { authenticate } = require('../middleware/auth.middleware');
const { pool } = require('../config/database');
const blobService = require('../services/blob.service');

router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// POST /api/documents/upload/:proposalId
router.post('/upload/:proposalId', upload.single('file'), async (req, res, next) => {
  try {
    const { proposalId } = req.params;
    const { description, isFinal, iterationRef } = req.body;

    if (!req.file) return res.status(400).json({ error: 'Archivo requerido (PDF, Word, PPT máx 25MB)' });

    const blobUrl = await blobService.uploadFile(req.file, proposalId);

    const { rows } = await pool.query(
      `INSERT INTO proposal_documents
         (proposal_id, uploaded_by, source, file_name, blob_url, description, file_size_kb, is_final, iteration_ref)
       VALUES ($1,$2,'upload',$3,$4,$5,$6,$7,$8) RETURNING id`,
      [proposalId, req.user.id, req.file.originalname, blobUrl, description || null,
       Math.round(req.file.size / 1024), isFinal === 'true', iterationRef ? +iterationRef : 0]
    );

    res.status(201).json({ id: rows[0].id, blobUrl, fileName: req.file.originalname });
  } catch (err) { next(err); }
});

// POST /api/documents/link/:proposalId
router.post('/link/:proposalId', async (req, res, next) => {
  try {
    const { proposalId } = req.params;
    const { externalUrl, description, isFinal, iterationRef } = req.body;
    if (!externalUrl) return res.status(400).json({ error: 'URL requerida' });

    const source = externalUrl.includes('drive.google') ? 'drive_link' : 'sharepoint_link';

    const { rows } = await pool.query(
      `INSERT INTO proposal_documents
         (proposal_id, uploaded_by, source, external_url, description, is_final, iteration_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [proposalId, req.user.id, source, externalUrl, description || null,
       isFinal === 'true' || isFinal === true, iterationRef ? +iterationRef : 0]
    );

    res.status(201).json({ id: rows[0].id });
  } catch (err) { next(err); }
});

module.exports = router;
