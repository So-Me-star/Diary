import { useEffect, useState } from 'react'
import {
  vaultExists,
  createVault,
  unlockWithPassword,
  unlockWithRecoveryCode,
} from './secureStorage'

export default function VaultGate({ onUnlocked }) {
  const [exists, setExists] = useState(null)
  const [mode, setMode] = useState('password')
  const [password, setPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newRecoveryCode, setNewRecoveryCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    vaultExists()
      .then(setExists)
      .catch(() => setError('无法读取本设备的保险库，请检查浏览器存储权限。'))
  }, [])

  async function handleCreate() {
    setError('')
    if (password.length < 12) {
      setError('密码至少需要 12 个字符。')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致。')
      return
    }

    setBusy(true)
    try {
      const code = await createVault(password)
      setNewRecoveryCode(code)
      setExists(true)
    } catch (err) {
      setError(err.message || '创建失败，请重试。')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlock() {
    setError('')
    setBusy(true)
    try {
      if (mode === 'recovery') {
        await unlockWithRecoveryCode(recoveryCode)
      } else {
        await unlockWithPassword(password)
      }
      onUnlocked()
    } catch {
      setError(mode === 'recovery'
        ? '恢复码不正确，请检查后重试。'
        : '密码不正确，请重试。')
    } finally {
      setBusy(false)
    }
  }

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px',
    marginTop: '8px',
    border: '1px solid #ddd',
    borderRadius: '10px',
    fontSize: '15px',
  }

  const buttonStyle = {
    width: '100%',
    padding: '13px',
    marginTop: '16px',
    border: 'none',
    borderRadius: '10px',
    background: 'var(--accent, #65020A)',
    color: 'white',
    fontSize: '15px',
    cursor: 'pointer',
  }

  if (exists === null) {
    return <div style={{ maxWidth: 420, margin: '15vh auto', padding: 24, textAlign: 'center' }}>正在检查日记保险库……</div>
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      boxSizing: 'border-box',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        padding: 28,
        boxSizing: 'border-box',
        borderRadius: 18,
        background: 'var(--card, white)',
        boxShadow: '0 8px 35px #00000012',
      }}>
        <h1 style={{ marginTop: 0 }}>DiArY<span>.</span></h1>

        {newRecoveryCode ? (
          <>
            <h2>请保存你的恢复码</h2>
            <p>恢复码只显示这一次。忘记密码时，可以用它重新解锁日记。</p>
            <div style={{
              padding: 14,
              borderRadius: 10,
              background: '#f3f0ed',
              overflowWrap: 'anywhere',
              fontFamily: 'monospace',
              lineHeight: 1.8,
              userSelect: 'all',
            }}>{newRecoveryCode}</div>
            <button style={buttonStyle} onClick={() => {
              setNewRecoveryCode('')
              onUnlocked()
            }}>我已保存恢复码，进入日记</button>
          </>
        ) : !exists ? (
          <>
            <h2>创建你的日记保险库</h2>
            <p>设置一个至少 12 位的密码。密码和恢复码都要妥善保管。</p>
            <input
              style={fieldStyle}
              type="password"
              autoComplete="new-password"
              placeholder="设置密码（至少 12 位）"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <input
              style={fieldStyle}
              type="password"
              autoComplete="new-password"
              placeholder="再次输入密码"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
            />
            <button style={buttonStyle} disabled={busy} onClick={handleCreate}>
              {busy ? '正在创建……' : '创建保险库'}
            </button>
          </>
        ) : (
          <>
            <h2>解锁你的日记</h2>
            {mode === 'password' ? (
              <>
                <input
                  style={fieldStyle}
                  type="password"
                  autoComplete="current-password"
                  placeholder="输入日记密码"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
                <button style={buttonStyle} disabled={busy} onClick={handleUnlock}>
                  {busy ? '正在解锁……' : '解锁日记'}
                </button>
                <button style={{ ...buttonStyle, background: 'transparent', color: 'inherit' }} onClick={() => setMode('recovery')}>
                  使用恢复码解锁
                </button>
              </>
            ) : (
              <>
                <textarea
                  style={fieldStyle}
                  rows={3}
                  placeholder="输入保存的恢复码"
                  value={recoveryCode}
                  onChange={e => setRecoveryCode(e.target.value)}
                />
                <button style={buttonStyle} disabled={busy} onClick={handleUnlock}>
                  {busy ? '正在解锁……' : '使用恢复码解锁'}
                </button>
                <button style={{ ...buttonStyle, background: 'transparent', color: 'inherit' }} onClick={() => setMode('password')}>
                  返回密码解锁
                </button>
              </>
            )}
          </>
        )}

        {error && <p role="alert" style={{ color: '#b42318', marginTop: 16 }}>{error}</p>}
      </div>
    </div>
  )
}
