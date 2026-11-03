import React, { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorScreen extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('页面渲染错误：', error, info)
  }

  render() {
    if (this.state.error) {
      return React.createElement('div', {
        style: {
          padding: 24, margin: 20, background: '#fff0f0',
          color: '#9b1c1c', borderRadius: 12, whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere'
        }
      },
        React.createElement('h2', null, 'DiArY 页面运行出错'),
        React.createElement('pre', null, this.state.error.stack || this.state.error.message)
      )
    }
    return this.props.children
  }
}

window.addEventListener('error', event => {
  console.error('全局运行错误：', event.error || event.message)
})

window.addEventListener('unhandledrejection', event => {
  console.error('异步运行错误：', event.reason)
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorScreen>
      <App />
    </ErrorScreen>
  </StrictMode>
)
