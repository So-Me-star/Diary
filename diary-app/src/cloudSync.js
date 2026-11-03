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

function stageKey(userId) {
  return `diary_import_stage_${userId}`
}

function readStage(userId) {
  try {
    return JSON.parse(localStorage.getItem(stageKey(userId)) || 'null')
  } catch {
    return null
  }
}

async function getRemoteVault(userId) {
  const { data, error } = await supabase
    .from('diary_vaults')
    .select('encrypted_data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * 下载云端保险库。
 *
 * 新设备：
 * 1. 先记录恢复进度。
 * 2. 原子导入保险库和日记密文。
 * 3. 下载附件密文。
 * 4. 全部完成后才记录同步版本。
 *
 * 中途失败时保留恢复进度，下次可以继续。
 */
export async function downloadCloudVault(userId) {
  const remote = await getRemoteVault(userId)

  if (!remote?.encrypted_data || !remote.updated_at) {
    return { status: 'empty' }
  }

  const updatedAt = remote.updated_at
  const known = localStorage.getItem(syncKey(userId))
  const stage = readStage(userId)
  const resuming = (
    stage?.userId === userId &&
    stage?.updatedAt === updatedAt
  )

  if (known === updatedAt) {
    return { status: 'already_synced', updatedAt }
  }

  const hasLocalVault = await vaultExists()

  // 已有本地保险库，但不是上次中断的云端恢复：
  // 不自动覆盖，也不擅自认定本地或云端哪份更新。
  if (hasLocalVault && !resuming) {
    return {
      status: 'local_and_cloud_exist',
      updatedAt,
    }
  }

  // 先写恢复标记。即使随后断网，也知道这是一次未完成的恢复。
  if (!resuming) {
    localStorage.setItem(stageKey(userId), JSON.stringify({
      userId,
      updatedAt,
      startedAt: new Date().toISOString(),
    }))
  }

  if (!hasLocalVault) {
    await importEncryptedVault(remote.encrypted_data)
  }

  const manifest = remote.encrypted_data.media || []

  for (const item of manifest) {
    if (!item?.id || !item?.iv || !item?.metadata) {
      throw new Error('云端附件清单格式无效，恢复已暂停。')
    }

    const path = `${userId}/${item.id}.bin`

    const { data: file, error } =
      await supabase.storage.from(BUCKET).download(path)

    if (error) {
      throw new Error(`附件 ${item.id} 下载失败：${error.message}`)
    }

    if (!file) {
      throw new Error(`附件 ${item.id} 下载结果为空，恢复已暂停。`)
    }

    await importEncryptedMediaRecord({
      id: item.id,
      iv: item.iv,
      metadata: item.metadata,
      ciphertext: await file.arrayBuffer(),
    })
  }

  // 所有附件下载成功后，才确认这个版本已完整恢复。
  localStorage.setItem(syncKey(userId), updatedAt)
  localStorage.removeItem(stageKey(userId))

  return {
    status: resuming ? 'resumed' : 'downloaded',
    updatedAt,
    mediaCount: manifest.length,
  }
}

/**
 * 真正执行一次云端上传。
 * 通过 updated_at 条件更新，避免旧版本直接覆盖新版本。
 */
async function performUpload(userId) {
  const payload = await exportEncryptedVault()

  if (!payload) {
    throw new Error('本设备没有可同步的保险库。')
  }

  const remote = await getRemoteVault(userId)
  const known = localStorage.getItem(syncKey(userId))

  if (remote?.updated_at) {
    if (!known || known !== remote.updated_at) {
      throw new Error(
        '本机与云端版本不一致，已暂停上传以保护数据。请勿清理本机或云端数据。'
      )
    }
  } else if (known) {
    throw new Error(
      '本机记录的云端版本已不存在，已暂停上传以保护数据。'
    )
  }

  const records = await exportEncryptedMediaRecords()
  const manifest = []

  // 先上传附件密文。此时不删除云端旧附件。
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
      }
    )

    if (error) {
      throw new Error(`附件 ${record.id} 上传失败：${error.message}`)
    }

    manifest.push({
      id: record.id,
      iv: record.iv,
      metadata: record.metadata,
    })
  }

  payload.media = manifest

  const updatedAt = new Date().toISOString()
  const row = {
    user_id: userId,
    encrypted_data: payload,
    updated_at: updatedAt,
  }

  if (remote?.updated_at) {
    // 只有云端版本仍等于本机已知版本时才允许更新。
    const { data, error } = await supabase
      .from('diary_vaults')
      .update({
        encrypted_data: row.encrypted_data,
        updated_at: row.updated_at,
      })
      .eq('user_id', userId)
      .eq('updated_at', known)
      .select('updated_at')
      .maybeSingle()

    if (error) throw error

    if (!data) {
      throw new Error(
        '上传期间云端版本发生变化，已阻止覆盖。请保留本机数据。'
      )
    }
  } else {
    // 云端尚无保险库时使用 insert，避免并发创建时互相覆盖。
    const { error } = await supabase
      .from('diary_vaults')
      .insert(row)

    if (error) {
      throw new Error(
        `首次创建云端保险库失败：${error.message}。可能已有其他设备先完成了创建。`
      )
    }
  }

  // 云端主记录提交成功后，立即保存本机版本标记。
  localStorage.setItem(syncKey(userId), updatedAt)

  // 最后清理已从本机删除的云端附件。
  // 清理失败不会撤销已经成功提交的保险库版本。
  try {
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
  } catch (error) {
    console.warn('保险库已同步，但旧附件清理未完成：', error)
  }

  return {
    status: 'uploaded',
    updatedAt,
    mediaCount: manifest.length,
  }
}

// 同一账号的上传操作排队执行，避免多个自动保存同时覆盖版本标记。
const uploadQueues = new Map()

export function uploadCloudVault(userId) {
  const previous = uploadQueues.get(userId) || Promise.resolve()

  const current = previous
    .catch(() => {})
    .then(() => performUpload(userId))

  uploadQueues.set(userId, current)

  return current.finally(() => {
    if (uploadQueues.get(userId) === current) {
      uploadQueues.delete(userId)
    }
  })
}
