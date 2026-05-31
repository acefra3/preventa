import { Response } from 'express';
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import multer from 'multer';
import { query, queryOne } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── Azure Blob Storage client ────────────────────────────
function getBlobClient() {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connStr) throw new Error('Azure Storage no configurado');
  return BlobServiceClient.fromConnectionString(connStr);
}

const CONTAINER = process.env.AZURE_STORAGE_CONTAINER_NAME || 'propuestas-docs';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// Multer: almacenamiento en memoria (luego sube a Azure)
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido. Solo PDF, Word, PPT, Excel.'));
  },
});

// POST /api/documents/upload/:proposalId
export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  const { proposalId } = req.params;
  const { description, isDeliverable, isAdjustment, revisionNumber } = req.body;
  const file = req.file;

  if (!file) { res.status(400).json({ error: 'Archivo requerido' }); return; }

  // Verificar que la propuesta existe y el usuario tiene acceso
  const proposal = await queryOne<Record<string, unknown>>(
    'SELECT id, name, assigned_to, commercial_id FROM proposals WHERE id = $1',
    [proposalId]
  );
  if (!proposal) { res.status(404).json({ error: 'Propuesta no encontrada' }); return; }

  const { role, id: userId } = req.user!;
  if (role === 'preventa' && proposal['assigned_to'] !== userId) {
    res.status(403).json({ error: 'Sin acceso' }); return;
  }
  if (role === 'comercial' && proposal['commercial_id'] !== userId) {
    res.status(403).json({ error: 'Sin acceso' }); return;
  }

  // Subir a Azure Blob Storage
  const timestamp = Date.now();
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blobName = `proposals/${proposalId}/${timestamp}_${safeName}`;

  let blobUrl: string | null = null;

  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    const blobService = getBlobClient();
    const container = blobService.getContainerClient(CONTAINER);
    const blockBlob = container.getBlockBlobClient(blobName);
    await blockBlob.upload(file.buffer, file.buffer.length, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });
    blobUrl = blockBlob.url;
  } else {
    // Modo local: simular la URL
    blobUrl = `local://${blobName}`;
    console.warn('[Storage] Azure no configurado — archivo no subido realmente');
  }

  const [doc] = await query(
    `INSERT INTO documents
       (proposal_id, uploaded_by, name, doc_type, blob_name, blob_url, file_size_bytes, mime_type,
        description, is_deliverable, is_adjustment, revision_number)
     VALUES ($1,$2,$3,'file',$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      proposalId, userId, file.originalname, blobName, blobUrl,
      file.size, file.mimetype,
      description || null,
      isDeliverable === 'true' || isDeliverable === true,
      isAdjustment === 'true' || isAdjustment === true,
      revisionNumber ? parseInt(revisionNumber) : null,
    ]
  );

  res.status(201).json(doc);
};

// POST /api/documents/link/:proposalId
export const addExternalLink = async (req: AuthRequest, res: Response): Promise<void> => {
  const { proposalId } = req.params;
  const { name, externalUrl, description, isDeliverable, isAdjustment, revisionNumber } = req.body;

  if (!externalUrl || !name) {
    res.status(400).json({ error: 'URL y nombre requeridos' }); return;
  }

  const [doc] = await query(
    `INSERT INTO documents
       (proposal_id, uploaded_by, name, doc_type, external_url, description,
        is_deliverable, is_adjustment, revision_number)
     VALUES ($1,$2,$3,'link',$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      proposalId, req.user!.id, name, externalUrl, description || null,
      isDeliverable === true,
      isAdjustment === true,
      revisionNumber ? parseInt(revisionNumber) : null,
    ]
  );

  res.status(201).json(doc);
};

// GET /api/documents/:id/download  — SAS URL temporal (Azure) o local
export const getDownloadUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const doc = await queryOne<Record<string, unknown>>(
    'SELECT * FROM documents WHERE id = $1',
    [id]
  );
  if (!doc) { res.status(404).json({ error: 'Documento no encontrado' }); return; }

  if (doc['doc_type'] === 'link') {
    res.json({ url: doc['external_url'] }); return;
  }

  // Generar SAS URL válida por 15 minutos
  if (process.env.AZURE_STORAGE_ACCOUNT_NAME && process.env.AZURE_STORAGE_ACCOUNT_KEY) {
    const sharedKey = new StorageSharedKeyCredential(
      process.env.AZURE_STORAGE_ACCOUNT_NAME,
      process.env.AZURE_STORAGE_ACCOUNT_KEY
    );
    const sasParams = generateBlobSASQueryParameters(
      {
        containerName: CONTAINER,
        blobName: doc['blob_name'] as string,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: new Date(Date.now() + 15 * 60 * 1000),
      },
      sharedKey
    );
    const url = `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/${CONTAINER}/${doc['blob_name']}?${sasParams}`;
    res.json({ url });
  } else {
    res.json({ url: doc['blob_url'], note: 'URL local — Azure no configurado' });
  }
};

// GET /api/documents/proposal/:proposalId
export const getProposalDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  const { proposalId } = req.params;
  const docs = await query(
    `SELECT d.*, u.name AS uploaded_by_name
     FROM documents d
     JOIN users u ON d.uploaded_by = u.id
     WHERE d.proposal_id = $1
     ORDER BY d.created_at DESC`,
    [proposalId]
  );
  res.json(docs);
};
