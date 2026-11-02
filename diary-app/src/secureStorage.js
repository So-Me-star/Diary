import {
  createMasterKey,
  generateRecoveryCode,
  wrapMasterKey,
  unwrapMasterKey,
  encryptData,
  decryptData,
} from './crypto.js'

const DB_NAME = 'diary_secure_db'
const DB_VERSION = 1

let activeMasterKey = null

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('vault')) {
        db.createObjectStore('vault', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('media')) {
        db.createObjectStore('media', { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readRecord(storeName, id) {
  const db = await openDB()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(storeName, 'readonly')
        .objectStore(storeName).get(id)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

async function writeRecord(storeName, record) {
  const db = await openDB()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).put(record)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

async function removeRecord(storeName, id) {
  const db = await openDB()
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite')
      transaction.objectStore(storeName).delete(id)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}

function requireUnlocked() {
  if (!activeMasterKey) {
    throw new Error('日记尚未解锁')
  }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0))
}

export async function vaultExists() {
  return Boolean(await readRecord('vault', 'main'))
}

export async function createVault(password) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('密码至少需要 12 个字符')
  }

  if (await vaultExists()) {
    throw new Error('本设备已经创建过日记保险库')
  }

  const masterKey = await createMasterKey()
  const recoveryCode = generateRecoveryCode()

  const passwordEnvelope = await wrapMasterKey(masterKey, password)
  const recoveryEnvelope = await wrapMasterKey(masterKey, recoveryCode)

  await writeRecord('vault', {
    id: 'main',
    version: 1,
    passwordEnvelope,
    recoveryEnvelope,
  })

  activeMasterKey = masterKey
  return recoveryCode
}

export async function regenerateRecoveryCode() {
  requireUnlocked()
  const vault = await readRecord('vault', 'main')
  if (!vault) throw new Error('找不到日记保险库')
  const recoveryCode = generateRecoveryCode()
  const recoveryEnvelope = await wrapMasterKey(activeMasterKey, recoveryCode)
  await writeRecord('vault', { ...vault, recoveryEnvelope })
  return recoveryCode
}

export async function unlockWithPassword(password) {
  const vault = await readRecord('vault', 'main')
  if (!vault) throw new Error('还没有创建日记保险库')

  activeMasterKey = await unwrapMasterKey(vault.passwordEnvelope, password)
  return true
}

export async function unlockWithRecoveryCode(recoveryCode) {
  const vault = await readRecord('vault', 'main')
  if (!vault) throw new Error('还没有创建日记保险库')

  activeMasterKey = await unwrapMasterKey(
    vault.recoveryEnvelope,
    recoveryCode.trim().toUpperCase()
  )
  return true
}

export function lockVault() {
  activeMasterKey = null
}

export function isVaultUnlocked() {
  return activeMasterKey !== null
}

export async function loadEncryptedData() {
  requireUnlocked()
  const record = await readRecord('data', 'main')
  if (!record) return null
  return decryptData(activeMasterKey, record.envelope)
}

export async function saveEncryptedData(data) {
  requireUnlocked()
  const envelope = await encryptData(activeMasterKey, data)
  await writeRecord('data', { id: 'main', envelope })
}

export async function saveEncryptedMedia(file) {
  requireUnlocked()

  const id = crypto.randomUUID()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const bytes = await file.arrayBuffer()

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    activeMasterKey,
    bytes
  )

  const metadata = await encryptData(activeMasterKey, {
    name: file.name,
    type: file.type,
    size: file.size,
  })

  await writeRecord('media', {
    id,
    iv: toBase64(iv),
    ciphertext,
    metadata,
  })

  return { id, name: file.name, type: file.type, size: file.size }
}

export async function getDecryptedMedia(id) {
  requireUnlocked()
  const record = await readRecord('media', id)
  if (!record) return null

  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(record.iv) },
    activeMasterKey,
    record.ciphertext
  )

  const metadata = await decryptData(activeMasterKey, record.metadata)

  return {
    blob: new Blob([bytes], { type: metadata.type }),
    ...metadata,
  }
}

export async function deleteEncryptedMedia(id) {
  requireUnlocked()
  await removeRecord('media', id)
}
