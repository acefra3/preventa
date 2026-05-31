const { BlobServiceClient } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let blobServiceClient;
function getClient() {
  if (!blobServiceClient && process.env.AZURE_STORAGE_CONNECTION_STRING &&
      !process.env.AZURE_STORAGE_CONNECTION_STRING.startsWith('DefaultEndpointsProtocol=https;AccountName=...')) {
    blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  }
  return blobServiceClient;
}

async function uploadFile(file, proposalId) {
  const client = getClient();
  if (!client) {
    // En desarrollo local, devuelve URL simulada
    console.log(`[DEV] Blob upload simulado: ${file.originalname}`);
    return `http://localhost:3001/dev-files/${proposalId}/${file.originalname}`;
  }
  const container = client.getContainerClient(process.env.AZURE_BLOB_CONTAINER || 'propuestas');
  const ext = path.extname(file.originalname);
  const blobName = `${proposalId}/${uuidv4()}${ext}`;
  const blockBlob = container.getBlockBlobClient(blobName);
  await blockBlob.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: file.mimetype },
  });
  return blockBlob.url;
}

module.exports = { uploadFile };
