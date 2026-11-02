import { supabase } from './supabase'
import {
  exportEncryptedVault,
  importEncryptedVault,
  vaultExists,
} from './secureStorage'

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
  return { status: 'downloaded', updatedAt: data.updated_at }
}

export async function uploadCloudVault(userId) {
  const payload = await exportEncryptedVault()
  if (!payload) throw new Error('本设备没有可同步的保险库。')

  const { error } = await supabase
    .from('diary_vaults')
    .upsert({
      user_id: userId,
      encrypted_data: payload,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) throw error
  return true
}
