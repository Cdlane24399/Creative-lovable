/**
 * Encryption utilities for sensitive data at rest
 * 
 * Uses AES-256-GCM for authenticated encryption of OAuth tokens and other secrets.
 * The encryption key should be set via ENCRYPTION_KEY environment variable.
 * 
 * Key requirements:
 * - ENCRYPTION_KEY must be a 32-byte (256-bit) key encoded as base64
 * - Generate with: openssl rand -base64 32
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM recommended IV length
const AUTH_TAG_LENGTH = 16
const SALT_LENGTH = 16

/**
 * Get the encryption key from environment
 * In production, this should be a secure 32-byte key
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is required in production')
    }
    // In development, derive a key from a default (NOT SECURE - dev only)
    console.warn('⚠️  Using development encryption key - NOT SECURE for production')
    return scryptSync('development-only-key', 'dev-salt', 32)
  }
  
  const keyBuffer = Buffer.from(key, 'base64')
  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be a 32-byte key encoded as base64')
  }
  
  return keyBuffer
}

/**
 * Encrypt a string value
 * Returns base64-encoded ciphertext with IV and auth tag prepended
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  
  const authTag = cipher.getAuthTag()
  
  // Format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted])
  
  return combined.toString('base64')
}

/**
 * Decrypt a value encrypted with encrypt()
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedData, 'base64')
  
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short')
  }
  
  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  })
  
  decipher.setAuthTag(authTag)
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])
  
  return decrypted.toString('utf8')
}

/**
 * Check if a value appears to be encrypted (base64 with correct length prefix)
 */
export function isEncrypted(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64')
    // Minimum length: IV + AuthTag + 1 byte of ciphertext
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1
  } catch {
    return false
  }
}

/**
 * Encrypt a value only if it's not already encrypted
 * Useful for migration scenarios
 */
export function encryptIfNeeded(value: string): string {
  // Simple heuristic: OAuth tokens don't start with valid base64 of our format
  // This is imperfect but helps with migration
  if (isEncrypted(value)) {
    try {
      // Try to decrypt - if it works, it's already encrypted
      decrypt(value)
      return value
    } catch {
      // Decryption failed, so it's not encrypted with our key
    }
  }
  return encrypt(value)
}

/**
 * Decrypt a value, returning null if decryption fails
 * Useful for graceful handling of unencrypted legacy data
 */
export function decryptSafe(value: string): string | null {
  try {
    return decrypt(value)
  } catch {
    return null
  }
}

/**
 * Hash a value for comparison (e.g., token lookup)
 * Uses scrypt for password-like hashing
 */
export function hashForLookup(value: string, salt?: string): string {
  const useSalt = salt ?? process.env.HASH_SALT ?? 'default-salt'
  const hash = scryptSync(value, useSalt, 32)
  return hash.toString('base64')
}
