import { supabase } from './supabase'
import {
  exportEncryptedVault,
  importEncryptedVault,
  vaultExists,
  exportEncryptedMediaRecords,
  importEncryptedMediaRecord,
} from './secureStorage'

const BUCKET = 'diary-media'

export async function downloadCloudVault(userId) {
  const { data, error } = await supabase
    .from('diary_vaults')
    .select('encrypted_data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data?.encrypted_data) return null

  if (await vaultExists()) {
    return { status: 'local_and_cloud_exist', updatedAt: data.updated_at }
  }

  await importEncryptedVault(data.encrypted_data)

  const manifest = data.encrypted_data.media || []
  for (const item of manifest) {
    const path = `${userId}/${item.id}.bin`
    const { data: file, error: downloadError } =
      await supabase.storage.from(BUCKET).download(path)
    if (downloadError) throw downloadError

    const ciphertext = await file.arrayBuffer()
    await importEncryptedMediaRecord({
      id: item.id,
      iv: item.iv,
      metadata: item.metadata,
      ciphertext,
    })
  }

  return { status: 'downloaded', updatedAt: data.updated_at }
}

export async function uploadCloudVault(userId) {
  const payload = await exportEncryptedVault()
  if (!payload) throw new Error('本设备没有可同步的保险库。')

  const records = await exportEncryptedMediaRecords()
  const manifest = []

  for (const record of records) {
    const path = `${userId}/${record.id}.bin`
    const { error } = await supabase.storage.from(BUCKET).upload(
      path,
      new Blob([record.ciphertext], { type: 'application/octet-stream' }),
      { upsert: true, contentType: 'application/octet-stream' }
    )
    if (error) throw error

    manifest.push({
      id: record.id,
      iv: record.iv,
      metadata: record.metadata,
    })
  }

  payload.media = manifest

  const { error } = await supabase.from('diary_vaults').upsert({
    user_id: userId,
    encrypted_data: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) throw error
  return true
}
