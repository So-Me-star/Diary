const STORAGE_KEY = 'diary_app_data_v1'
const DB_NAME = 'diary_media_db'
const STORE_NAME = 'media'

export function createEmptyDay() {
  return {
    weather: '',
    mood: '',
    blocks: [{ id: crypto.randomUUID(), type: 'text', content: '' }],
    period: { isPeriod: null, flow: '', color: '' },
    expenses: [],
  }
}

export function loadData() {
  const defaults = {
    settings: {
      periodEnabled: false,
      ledgerEnabled: false,
      appLockEnabled: false,
    },
    days: {},
    ledgerTags: [
      '餐饮', '交通', '购物', '日用品', '娱乐',
      '医疗', '学习', '住房', '收入', '其他',
    ],
  }

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    if (!saved || typeof saved !== 'object') return defaults

    return {
      ...defaults,
      ...saved,
      settings: { ...defaults.settings, ...saved.settings },
      days: saved.days || {},
      ledgerTags: saved.ledgerTags || defaults.ledgerTags,
    }
  } catch {
    return defaults
  }
}

export function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function openMediaDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveMedia(file) {
  const db = await openMediaDB()
  const id = crypto.randomUUID()

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put({
      id,
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size,
    })
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })

  db.close()
  return {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
  }
}

export async function getMedia(id) {
  const db = await openMediaDB()

  const result = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })

  db.close()
  return result
}

export async function deleteMedia(id) {
  const db = await openMediaDB()

  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).delete(id)
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })

  db.close()
}

export async function exportAllMedia() {
  const db = await openMediaDB()

  const records = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })

  db.close()
  return records
}
