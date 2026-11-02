// DiArY: browser-side end-to-end encryption core

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const ITERATIONS = 600000

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}

function randomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function generateRecoveryCode() {
  return Array.from(randomBytes(32), b =>
    b.toString(16).padStart(2, '0')
  ).join('').toUpperCase()
}

export async function createMasterKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

async function deriveWrappingKey(secret, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function wrapMasterKey(masterKey, secret) {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const wrappingKey = await deriveWrappingKey(secret, salt)
  const rawKey = await crypto.subtle.exportKey('raw', masterKey)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    rawKey
  )

  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext)
  }
}

export async function unwrapMasterKey(envelope, secret) {
  if (envelope.version !== 1 || envelope.iterations !== ITERATIONS) {
    throw new Error('不支持的密钥格式')
  }

  const salt = fromBase64(envelope.salt)
  const iv = fromBase64(envelope.iv)
  const wrappingKey = await deriveWrappingKey(secret, salt)

  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    fromBase64(envelope.ciphertext)
  )

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function encryptData(masterKey, data) {
  const iv = randomBytes(12)
  const plaintext = encoder.encode(JSON.stringify(data))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    plaintext
  )

  return {
    version: 1,
    algorithm: 'AES-GCM-256',
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext)
  }
}

export async function decryptData(masterKey, envelope) {
  if (envelope.version !== 1) {
    throw new Error('不支持的加密数据格式')
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    masterKey,
    fromBase64(envelope.ciphertext)
  )

  return JSON.parse(decoder.decode(plaintext))
}
