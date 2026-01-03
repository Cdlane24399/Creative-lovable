/**
 * Encryption Utility Tests
 */

import { encrypt, decrypt, isEncrypted, encryptIfNeeded, decryptSafe, hashForLookup } from '../encryption'

describe('Encryption Module', () => {
  // Set a test encryption key (32 bytes as base64)
  const TEST_KEY = Buffer.from('test-key-for-encryption-32bytes!').toString('base64')
  
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY
  })

  afterAll(() => {
    delete process.env.ENCRYPTION_KEY
  })

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'Hello, World!'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
      expect(encrypted).not.toBe(plaintext)
    })

    it('should encrypt and decrypt OAuth tokens', () => {
      const token = 'gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
      const encrypted = encrypt(token)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(token)
    })

    it('should encrypt and decrypt empty string', () => {
      const plaintext = ''
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('should encrypt and decrypt unicode strings', () => {
      const plaintext = 'Hello 世界 🌍'
      const encrypted = encrypt(plaintext)
      const decrypted = decrypt(encrypted)

      expect(decrypted).toBe(plaintext)
    })

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'test'
      const encrypted1 = encrypt(plaintext)
      const encrypted2 = encrypt(plaintext)

      // Due to random IV, same plaintext should produce different ciphertext
      expect(encrypted1).not.toBe(encrypted2)
      
      // But both should decrypt to same value
      expect(decrypt(encrypted1)).toBe(plaintext)
      expect(decrypt(encrypted2)).toBe(plaintext)
    })

    it('should throw error for invalid ciphertext', () => {
      expect(() => decrypt('invalid-base64!')).toThrow()
    })

    it('should throw error for truncated ciphertext', () => {
      const encrypted = encrypt('test')
      const truncated = encrypted.slice(0, 10)
      
      expect(() => decrypt(truncated)).toThrow()
    })
  })

  describe('isEncrypted', () => {
    it('should return true for encrypted data', () => {
      const encrypted = encrypt('test')
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it('should return false for plain text', () => {
      expect(isEncrypted('plain text')).toBe(false)
    })

    it('should return false for short strings', () => {
      expect(isEncrypted('abc')).toBe(false)
    })

    it('should return false for invalid base64', () => {
      expect(isEncrypted('not-valid-base64!!!')).toBe(false)
    })
  })

  describe('encryptIfNeeded', () => {
    it('should encrypt plain text', () => {
      const plaintext = 'gho_token_here'
      const result = encryptIfNeeded(plaintext)

      expect(result).not.toBe(plaintext)
      expect(decrypt(result)).toBe(plaintext)
    })

    it('should not double-encrypt already encrypted data', () => {
      const plaintext = 'test'
      const encrypted = encrypt(plaintext)
      const result = encryptIfNeeded(encrypted)

      // Should return the same encrypted value
      expect(result).toBe(encrypted)
      expect(decrypt(result)).toBe(plaintext)
    })
  })

  describe('decryptSafe', () => {
    it('should decrypt valid encrypted data', () => {
      const plaintext = 'test'
      const encrypted = encrypt(plaintext)
      const result = decryptSafe(encrypted)

      expect(result).toBe(plaintext)
    })

    it('should return null for invalid data', () => {
      const result = decryptSafe('not-encrypted')
      expect(result).toBeNull()
    })

    it('should return null for corrupted data', () => {
      const encrypted = encrypt('test')
      const corrupted = encrypted.slice(0, -5) + 'xxxxx'
      const result = decryptSafe(corrupted)

      expect(result).toBeNull()
    })
  })

  describe('hashForLookup', () => {
    it('should produce consistent hash for same input', () => {
      const hash1 = hashForLookup('test-value')
      const hash2 = hashForLookup('test-value')

      expect(hash1).toBe(hash2)
    })

    it('should produce different hash for different inputs', () => {
      const hash1 = hashForLookup('value1')
      const hash2 = hashForLookup('value2')

      expect(hash1).not.toBe(hash2)
    })

    it('should accept custom salt', () => {
      const hash1 = hashForLookup('test', 'salt1')
      const hash2 = hashForLookup('test', 'salt2')

      expect(hash1).not.toBe(hash2)
    })
  })
})

describe('Encryption without key', () => {
  const originalKey = process.env.ENCRYPTION_KEY
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY
  })

  afterEach(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey
    }
    // @ts-expect-error - NODE_ENV is technically readonly but we need to restore it
    process.env.NODE_ENV = originalEnv
  })

  it('should use development key in development mode', () => {
    // @ts-expect-error - NODE_ENV is technically readonly but we need to set it for testing
    process.env.NODE_ENV = 'development'
    
    // Should not throw in development
    const encrypted = encrypt('test')
    const decrypted = decrypt(encrypted)
    
    expect(decrypted).toBe('test')
  })

  it('should throw in production without key', () => {
    // @ts-expect-error - NODE_ENV is technically readonly but we need to set it for testing
    process.env.NODE_ENV = 'production'
    
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is required in production')
  })
})
