import forge from 'node-forge';
import { attestationApi, uploadApi, apiUtils } from './api';
import { DatasetUpload } from '@/types';

// Convert PEM public key to forge public key
function pemToPublicKey(pem: string): forge.pki.rsa.PublicKey {
  const publicKey = forge.pki.publicKeyFromPem(pem);
  return publicKey as forge.pki.rsa.PublicKey;
}

// Generate a random AES-256 key using Web Crypto API
async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt']
  );
}

// Generate a random nonce for AES-GCM
function generateNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(12)); // 96 bits
}

// Encrypt data with AES-GCM using Web Crypto API
async function encryptAESGCM(
  data: ArrayBuffer,
  key: CryptoKey,
  nonce: Uint8Array
): Promise<ArrayBuffer> {
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce as BufferSource,
    },
    key,
    data
  );

  return encrypted;
}

// Export AES key to raw bytes for RSA encryption
async function exportAESKey(key: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.exportKey('raw', key);
}

// Encrypt file with AES-GCM and wrap key with RSA
async function encryptAndWrapKey(
  fileData: ArrayBuffer,
  publicKeyPem: string
): Promise<{ ciphertext: ArrayBuffer; wrappedKey: Uint8Array; nonce: Uint8Array }> {
  // Generate AES key and nonce
  const aesKey = await generateAESKey();
  const nonce = generateNonce();

  // Encrypt file data with AES-GCM
  const ciphertext = await encryptAESGCM(fileData, aesKey, nonce);

  // Export AES key to raw bytes
  const aesKeyBytes = await exportAESKey(aesKey);

  // Wrap AES key with RSA public key (OAEP padding)
  const publicKey = pemToPublicKey(publicKeyPem);
  const aesKeyArray = new Uint8Array(aesKeyBytes);
  const aesKeyHex = Array.from(aesKeyArray, byte => byte.toString(16).padStart(2, '0')).join('');
  const wrappedKey = publicKey.encrypt(
    aesKeyHex,
    'RSA-OAEP',
    {
      md: forge.md.sha256.create(),
      mgf1: {
        md: forge.md.sha256.create(),
      },
    }
  );

  return {
    ciphertext: ciphertext,
    wrappedKey: Uint8Array.from(atob(wrappedKey), c => c.charCodeAt(0)),
    nonce: nonce,
  };
}

// Main function to encrypt and upload dataset
export async function encryptAndUploadDataset(
  workflowId: string,
  file: File,
  owner: string
): Promise<DatasetUpload> {
  try {
    // Get executor public key
    const attestation = await attestationApi.getExecutorPubkey();
    const publicKeyPem = attestation.public_key_pem;

    // Read file data
    const fileData = await file.arrayBuffer();

    // Generate dataset ID
    const datasetId = crypto.randomUUID();

    // Encrypt file and wrap key
    const { ciphertext, wrappedKey, nonce } = await encryptAndWrapKey(
      fileData,
      publicKeyPem
    );

    // Combine nonce + ciphertext (as done in Python version)
    const encryptedData = new Uint8Array(nonce.length + ciphertext.byteLength);
    encryptedData.set(nonce, 0);
    encryptedData.set(new Uint8Array(ciphertext), nonce.length);

    // Get signed URLs for uploading
    const [cipherResponse, keyResponse] = await Promise.all([
      uploadApi.getUploadUrl(workflowId, datasetId, file.name, 'dataset', owner),
      uploadApi.getUploadUrl(workflowId, datasetId, file.name, 'key', owner),
    ]);

    // Upload encrypted data and wrapped key
    await Promise.all([
      apiUtils.uploadToSignedUrl(
        cipherResponse.upload_url,
        encryptedData.buffer,
        'application/octet-stream'
      ),
      apiUtils.uploadToSignedUrl(
        keyResponse.upload_url,
        wrappedKey.buffer as ArrayBuffer,
        'application/octet-stream'
      ),
    ]);

    return {
      workflow_id: workflowId,
      filename: file.name,
      dataset_id: datasetId,
      owner,
      ciphertext_gcs: cipherResponse.gcs_path,
      wrapped_dek_gcs: keyResponse.gcs_path,
      upload_status_dataset: 200,
      upload_status_dek: 200,
    };
  } catch (error) {
    console.error('Encryption and upload failed:', error);
    throw new Error(`Failed to encrypt and upload dataset: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Utility function to validate file type
export function validateFileType(file: File): boolean {
  return file.type === 'text/csv' || file.name.endsWith('.csv');
}

// Utility function to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
