import { supabase } from './supabase'
import {
  exportEncryptedVault,
  importEncryptedVault,
  vaultExists,
  exportEncryptedMediaRecords,
  importEncryptedMediaRecord,
} from './secureStorage'

const BUCKET = 'diary-media'

function syncKey(userId) {
  return `diary_last_sync_${userId}`
}

export async function downloadCloudVault(userId) {
  const { data, error } = await supabase
    .from('diary_vaults')
    .select('encrypted_data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data?.encrypted_data) return null

  if (await vaultExists()) {
    const known = localStorage.getItem(syncKey(userId))
    if (known && known === data.updated_at) {
      return { status: 'already_synced', updatedAt: data.updated_at }
    }
    return { status: 'local_and_cloud_exist', updatedAt: data.updated_at }
  }

  await importEncryptedVault(data.encrypted_data)

  for (const item of data.encrypted_data.media || []) {
    const path = `${userId}/${item.id}.bin`
    const { data: file, error: downloadError } =
      await supabase.storage.from(BUCKET).download(path)

    if (downloadError) throw downloadError

    await importEncryptedMediaRecord({
      id: item.id,
      iv: item.iv,
      metadata: item.metadata,
      ciphertext: await file.arrayBuffer(),
    })
  }

  localStorage.setItem(syncKey(userId), data.updated_at)
  return { status: 'downloaded', updatedAt: data.updated_at }
}


export async function initializeCloudSync(userId) {
  const { data, error } = await supabase
    .from('diary_vaults')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data?.updated_at) return false

  localStorage.setItem(syncKey(userId), data.updated_at)
  return true
}

export async function uploadCloudVault(userId) {
  const payload = await exportEncryptedVault()
  if (!payload) throw new Error('本设备没有可同步的保险库。')

  const { data: remote, error: checkError } = await supabase
    .from('diary_vaults')
    .select('updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (checkError) throw checkError

  const known = localStorage.getItem(syncKey(userId))
  if (remote?.updated_at && known !== remote.updated_at) {
    throw new Error('云端数据版本与本机不一致，已暂停上传以防覆盖。')
  }

  const records = await exportEncryptedMediaRecords()
  const manifest = []

  for (const record of records) {
    const path = `${userId}/${record.id}.bin`
    const { error } = await supabase.storage.from(BUCKET).upload(
      path,
      new Blob([record.ciphertext], {
        type: 'application/octet-stream',
      }),
      {
        upsert: true,
        contentType: 'application/octet-stream',
      },
    )

    if (error) throw error

    manifest.push({
      id: record.id,
      iv: record.iv,
      metadata: record.metadata,
    })
  }

  payload.media = manifest
  const updatedAt = new Date().toISOString()

  const { error } = await supabase.from('diary_vaults').upsert({
    user_id: userId,
    encrypted_data: payload,
    updated_at: updatedAt,
  }, { onConflict: 'user_id' })

  if (error) throw error

  // 清理已在本机删除的旧附件
  const keep = new Set(manifest.map(item => `${item.id}.bin`))
  const { data: files, error: listError } =
    await supabase.storage.from(BUCKET).list(userId)

  if (listError) throw listError

  const stale = (files || [])
    .filter(file => !keep.has(file.name))
    .map(file => `${userId}/${file.name}`)

  if (stale.length) {
    const { error: removeError } =
      await supabase.storage.from(BUCKET).remove(stale)
    if (removeError) throw removeError
  }

  localStorage.setItem(syncKey(userId), updatedAt)
  return true
}
