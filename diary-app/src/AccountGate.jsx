import { useState } from 'react'
import { supabase } from './supabase'

function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@diary.local`
}

export default function AccountGate({ onLoggedIn }) {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const fieldStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px',
    marginTop: '10px',
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

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    const normalized = username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      setError('用户名需为 3–20 位，只能使用英文、数字或下划线。')
      return
    }

    if (password.length < 8) {
      setError('账号密码至少需要 8 个字符。')
      return
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('两次输入的账号密码不一致。')
      return
    }

    setBusy(true)
    try {
      const email = usernameToEmail(normalized)

      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { username: normalized } },
        })
        if (signUpError) throw signUpError
        if (!data.user) throw new Error('注册未成功，请重试。')

        if (!data.session) {
          setMessage('注册请求已提交。请检查 Supabase 是否已关闭邮箱确认，再重新登录。')
          return
        }

        const { error: profileError } = await supabase
          .from('diary_profiles')
          .upsert({ user_id: data.user.id, username: normalized })

        if (profileError) {
          await supabase.auth.signOut()
          throw profileError
        }

        onLoggedIn(data.session)
      } else {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (loginError) throw loginError
        onLoggedIn(data.session)
      }
    } catch (err) {
      const text = err?.message || ''
      if (text.toLowerCase().includes('already registered')) {
        setError('这个用户名已注册，请直接登录。')
      } else if (text.toLowerCase().includes('invalid login credentials')) {
        setError('用户名或账号密码不正确。')
      } else {
        setError(text || '操作失败，请稍后重试。')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      boxSizing: 'border-box',
    }}>
      <form onSubmit={handleSubmit} style={{
        width: '100%',
        maxWidth: 420,
        padding: 28,
        boxSizing: 'border-box',
        borderRadius: 18,
        background: 'var(--card, white)',
        boxShadow: '0 8px 35px #00000012',
      }}>
        <h1 style={{ marginTop: 0 }}>DiArY<span>.</span></h1>
        <h2>{mode === 'login' ? '登录你的账号' : '创建你的账号'}</h2>
        <p>账号用于云端同步；日记内容仍由你的保险库密码加密。</p>

        <input
          style={fieldStyle}
          autoComplete="username"
          placeholder="用户名（3–20 位英文、数字或下划线）"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
        />
        <input
          style={fieldStyle}
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          placeholder="账号密码（至少 8 位）"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
        />

        {mode === 'signup' && (
          <input
            style={fieldStyle}
            type="password"
            autoComplete="new-password"
            placeholder="再次输入账号密码"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />
        )}

        <button style={buttonStyle} disabled={busy} type="submit">
          {busy ? '请稍候……' : mode === 'login' ? '登录' : '注册账号'}
        </button>

        <button
          type="button"
          style={{ ...buttonStyle, background: 'transparent', color: 'inherit' }}
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
            setMessage('')
          }}
        >
          {mode === 'login' ? '没有账号？注册' : '已有账号？返回登录'}
        </button>

        {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
    </div>
  )
}
