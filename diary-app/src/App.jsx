import { useEffect, useMemo, useState } from 'react'
import VaultGate from './VaultGate'
import AccountGate from './AccountGate'
import { supabase } from './supabase'
import { downloadCloudVault, uploadCloudVault } from './cloudSync'
import {
  loadEncryptedData, saveEncryptedData, saveEncryptedMedia,
  getDecryptedMedia, deleteEncryptedMedia, regenerateRecoveryCode
} from './secureStorage'
import {
  Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend
} from 'recharts'
import './App.css'
import {
  createEmptyDay, loadData, getMedia, deleteMedia
} from './storage'

const moods = ['😭', '😞', '🙁', '😐', '🙂', '☺️', '🥹']
const weathers = [['☀️','晴'],['🌤️','晴间多云'],['⛅','多云'],['☁️','阴'],['🌧️','小雨'],['🌦️','阵雨'],['⛈️','雷雨'],['❄️','雪'],['🌫️','雾'],['🌬️','大风']]
const flows = ['极少','少量','中等','较多','很多']
const periodColors = [['浅粉色','#f4b6b6'],['鲜红色','#e34b55'],['暗红色','#a52d3b'],['深褐色','#754332'],['棕黑色','#45302c']]
const palettes = [
  {name:'浆果红 × 湖蓝',a:'#65020A',b:'#18D5E7'},
  {name:'胭脂粉 × 墨黑',a:'#FF7CA2',b:'#000000'},
  {name:'雾堇紫 × 樱粉',a:'#615EDE',b:'#FF7EC1'},
  {name:'裸粉 × 苔青',a:'#FACBC6',b:'#465C47'},
  {name:'桃绯粉 × 薄荷青',a:'#F35B83',b:'#8AEED1'},
  {name:'浅蓝 × 奶白',a:'#A9D6E5',b:'#FFF8E7'},
  {name:'阳光橙 × 森蓝',a:'#F4A340',b:'#244B5A'},
  {name:'浅蓝 × 灰色',a:'#B8DDF2',b:'#66717D'},
  {name:'勃垦地红 × 米黄',a:'#800020',b:'#F4E7CE'},
  {name:'紫罗兰 × 秘境蓝',a:'#8F5BD7',b:'#253C78'},
  {name:'鼠尾草绿 × 象牙白',a:'#698E6D',b:'#FEFAE9'},
  {name:'清新绿 × 雾白',a:'#5DAA80',b:'#F2F9F2'},
  {name:'橄榄绿 × 深炭',a:'#88B24E',b:'#262B24'},
  {name:'孔雀青 × 沙棕',a:'#018C89',b:'#B89076'},
  {name:'森林绿 × 明黄',a:'#01795D',b:'#F5D75B'},
  {name:'翠绿 × 燕麦',a:'#009C75',b:'#DEC3A8'},
  {name:'天蓝 × 明黄',a:'#56B4E9',b:'#F0E442'},
  {name:'黑色 × 海蓝 × 琥珀橙',a:'#000000',b:'#0072B2',c:'#E69F00'}
]
const defaultTags = ['餐饮','交通','购物']
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const money = n => Number(n || 0).toFixed(2)

function MediaItem({block,onDelete,onSize}) {
  const [url,setUrl] = useState('')
  useEffect(() => {
    let objectUrl = ''
    let active = true
    getDecryptedMedia(block.mediaId).then(item => {
      if (active && item?.blob) { objectUrl = URL.createObjectURL(item.blob); setUrl(objectUrl) }
    }).catch(console.error)
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  },[block.mediaId])
  if (!url) return <p className="muted">正在加载附件……</p>
  return <figure className="media-item">
    {block.mediaType?.startsWith('video/') ? <video src={url} controls className={`media-${block.size || 'medium'}`} /> : <img src={url} alt={block.name || '日记图片'} className={`media-${block.size || 'medium'}`} />}
    <figcaption><span>{block.name}</span>
      {block.mediaType?.startsWith('image/') && <select value={block.size || 'medium'} onChange={e=>onSize(e.target.value)}><option value="small">小图</option><option value="medium">中图</option><option value="large">大图</option></select>}
      <button className="quiet danger-text" onClick={onDelete}>移除</button>
    </figcaption>
  </figure>
}

function DiaryApp() {
  const [data,setData] = useState({
    settings:{periodEnabled:false,ledgerEnabled:false,appLockEnabled:false},
    days:{},
    ledgerTags:['餐饮','交通','购物','日用品','娱乐','医疗','学习','住房','收入','其他']
  })
  const [dataReady,setDataReady] = useState(false)
  const [date,setDate] = useState(today)
  const [ledgerDate,setLedgerDate] = useState(today)
  const [page,setPage] = useState('diary')
  const [query,setQuery] = useState('')
  const [calendarMonth,setCalendarMonth] = useState('')
  const [searchDate,setSearchDate] = useState('')
  const [activePicker,setActivePicker] = useState('')
  const [clearScope,setClearScope] = useState('all')
  const [busy,setBusy] = useState(false)
  const [insertAfter,setInsertAfter] = useState(null)
  const [ledgerStats,setLedgerStats] = useState(false)
  const [totalChartType,setTotalChartType] = useState('bar')
  const [categoryChartType,setCategoryChartType] = useState('bar')
  const [categoryMetric,setCategoryMetric] = useState('expense')
  const [themeOpen,setThemeOpen] = useState(false)
  const [themeTouched,setThemeTouched] = useState({scope:false,palette:false,direction:false})
  const [periodEditing,setPeriodEditing] = useState(false)
  const [tagDraft,setTagDraft] = useState({})
  const [editingTag,setEditingTag] = useState('')
  const [newTag,setNewTag] = useState('')
  const [amountDraft,setAmountDraft] = useState({})

  const day = data.days[date] || createEmptyDay()
  const ledgerDay = data.days[ledgerDate] || createEmptyDay()
  const palette = palettes[data.settings.themeIndex || 0] || palettes[0]
  const themeScope = data.settings.themeScope || 'accent'
  const splitDirection = data.settings.splitDirection || 'vertical'

  useEffect(() => {
    let active = true
    async function initialize() {
      try {
        let encrypted = await loadEncryptedData()
        if (!encrypted) {
          // 首次启用：迁移旧日记，并加密旧附件
          const legacy = loadData()
          const migrated = {
            ...legacy,
            days: { ...legacy.days }
          }

          for (const [dayKey, dayValue] of Object.entries(migrated.days)) {
            const blocks = []
            for (const block of (dayValue.blocks || [])) {
              if (block.type === 'media' && block.mediaId) {
                try {
                  const oldMedia = await getMedia(block.mediaId)
                  if (!oldMedia?.blob) {
                    throw new Error('找不到旧附件：' + block.mediaId)
                  }
                  const file = new File(
                    [oldMedia.blob],
                    oldMedia.name || block.name || 'diary-media',
                    { type: oldMedia.type || block.mediaType || oldMedia.blob.type }
                  )
                  const saved = await saveEncryptedMedia(file)
                  blocks.push({
                    ...block,
                    mediaId: saved.id,
                    mediaType: saved.type,
                    name: saved.name
                  })
                  continue
                } catch (error) {
                  console.error('附件迁移失败：', block.mediaId, error)
                  throw new Error('旧附件迁移失败。旧数据尚未删除，请检查后重试。', { cause: error })
                }
              }
              blocks.push(block)
            }
            migrated.days[dayKey] = { ...dayValue, blocks }
          }

          await saveEncryptedData(migrated)
          encrypted = await loadEncryptedData()
          if (!encrypted) throw new Error('加密数据验证失败')

          // 每个附件都必须能够成功解密，才允许清理旧数据
          for (const dayValue of Object.values(encrypted.days || {})) {
            for (const block of (dayValue.blocks || [])) {
              if (block.type === 'media' && block.mediaId) {
                const check = await getDecryptedMedia(block.mediaId)
                if (!check?.blob || check.blob.size === 0) {
                  throw new Error('加密附件验证失败：' + block.mediaId)
                }
              }
            }
          }

          // 数据和附件均验证成功后，才清理旧明文数据和旧附件
          for (const dayValue of Object.values(legacy.days || {})) {
            for (const block of (dayValue.blocks || [])) {
              if (block.type === 'media' && block.mediaId) {
                await deleteMedia(block.mediaId)
              }
            }
          }
          localStorage.removeItem('diary_app_data_v1')
        }

        if (active) {
          setData(encrypted)
          setDataReady(true)
        }
      } catch (error) {
        console.error(error)
        alert('日记加载或迁移失败：' + error.message + '。请勿清理浏览器数据。')
      }
    }
    initialize()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!dataReady) return
    saveEncryptedData(data).catch(error => {
      console.error('加密保存失败：', error)
      alert('日记加密保存失败，请保持页面打开并检查浏览器存储。')
    })
  },[data,dataReady])
  useEffect(() => {
    const root=document.documentElement
    root.style.setProperty('--accent',palette.a)
    root.style.setProperty('--accent-soft',palette.a + '18')
    root.style.setProperty('--accent-2',palette.b)
    root.dataset.themeScope=themeScope
    root.style.setProperty('--bg-a',palette.a)
    root.style.setProperty('--bg-b',palette.b)
    root.style.setProperty('--bg-direction',splitDirection==='horizontal'?'to right':'to bottom')
  },[palette,themeScope,splitDirection])

  function updateDay(which,field,value) {
    setData(prev => {
      const old = prev.days[which] || createEmptyDay()
      return {...prev,days:{...prev.days,[which]:{...old,[field]:value}}}
    })
  }
  function updateSettings(field,value) {
    setData(prev=>({...prev,settings:{...prev.settings,[field]:value}}))
  }
  function updateBlock(which,id,patch) {
    const blocks = (data.days[which] || createEmptyDay()).blocks.map(b=>b.id===id?{...b,...patch}:b)
    updateDay(which,'blocks',blocks)
  }
  async function addFiles(event) {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    setBusy(true)
    try {
      const added=[]
      for (const file of files) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue
        const saved=await saveEncryptedMedia(file)
        added.push({id:crypto.randomUUID(),type:'media',mediaId:saved.id,mediaType:saved.type,name:saved.name,size:'medium'})
      }
      const current = data.days[date] || createEmptyDay()
      const index = insertAfter === null ? current.blocks.length : insertAfter + 1
      const blocks=[...current.blocks]
      blocks.splice(index,0,...added)
      updateDay(date,'blocks',blocks)
    } catch(error) { alert(`附件保存失败：${error.message}`) }
    finally { setBusy(false); event.target.value=''; setInsertAfter(null) }
  }
  async function removeBlock(which,block) {
    if(block.type==='media') await deleteEncryptedMedia(block.mediaId)
    const current=data.days[which] || createEmptyDay()
    updateDay(which,'blocks',current.blocks.filter(b=>b.id!==block.id))
  }
  async function clearSelected() {
    const labels={all:'当天全部内容',diary:'日记文字和图片视频',records:'天气、心情和经期记录',ledger:'当天记账记录'}
    if(!confirm(`确定清除「${date}」的${labels[clearScope]}吗？此操作无法撤销。`)) return
    if(clearScope==='all') {
      await Promise.all(day.blocks.filter(b=>b.type==='media').map(b=>deleteEncryptedMedia(b.mediaId)))
      setData(prev=>{const days={...prev.days};delete days[date];return {...prev,days}})
    } else if(clearScope==='diary') {
      await Promise.all(day.blocks.filter(b=>b.type==='media').map(b=>deleteEncryptedMedia(b.mediaId)))
      updateDay(date,'blocks',[{id:crypto.randomUUID(),type:'text',content:''}])
    } else if(clearScope==='records') {
      updateDay(date,'weather','');updateDay(date,'mood','');updateDay(date,'period',{isPeriod:null,flow:'',color:''})
    } else updateDay(date,'expenses',[])
  }
  const dates=useMemo(()=>Object.keys(data.days).sort().reverse(),[data.days])
  const searchResults=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return dates.filter(d=>{
      const item=data.days[d]
      const text=(item.blocks||[]).filter(b=>b.type==='text').map(b=>b.content||'').join(' ').toLowerCase()
      return (!q || text.includes(q)) && (!calendarMonth || d.startsWith(calendarMonth)) && (!searchDate || d===searchDate)
    })
  },[query,data,calendarMonth,searchDate,dates])
  const ledgerTags=data.ledgerTags?.length?data.ledgerTags:defaultTags
  const ledgerRows=ledgerTags.map(tag=>({tag,amount:(ledgerDay.expenses||[]).filter(e=>e.tag===tag).reduce((s,e)=>s+Number(e.amount||0),0)}))
  const dailyTotal=ledgerTags.reduce((sum,tag)=>sum+Number(amountDraft[tag] ?? ledgerRows.find(r=>r.tag===tag)?.amount ?? 0),0) + (ledgerDay.expenses||[]).filter(e=>!ledgerTags.includes(e.tag)).reduce((s,e)=>s+Number(e.amount||0),0)
  const monthly=Object.entries(data.days).reduce((acc,[d,v])=>{
    const m=d.slice(0,7);acc[m] ||= {month:m,income:0,expense:0}
    ;(v.expenses||[]).forEach(e=>{if(e.amount>=0)acc[m].income+=e.amount;else acc[m].expense+=Math.abs(e.amount)})
    return acc
  },{})
  const monthlyData=Object.values(monthly).sort((a,b)=>a.month.localeCompare(b.month))
  const categoryTotals=Object.values(data.days).reduce((acc,v)=>{(v.expenses||[]).forEach(e=>{const tag=e.tag||'未分类';acc[tag] ||= {tag,income:0,expense:0};if(Number(e.amount)>=0)acc[tag].income+=Number(e.amount||0);else acc[tag].expense+=Math.abs(Number(e.amount||0))});return acc},{})
  const categoryData=Object.values(categoryTotals).sort((a,b)=>(b.income+b.expense)-(a.income+a.expense))
  const allIncome=monthlyData.reduce((s,m)=>s+m.income,0)
  const allExpense=monthlyData.reduce((s,m)=>s+m.expense,0)
  const pieColors=[palette.a,palette.b,'#D6A56D','#8C9C8A','#B7A1C9','#D98F9A','#7C9DB5']
  const textForSearch=(item)=> (item.blocks||[]).filter(b=>b.type==='text').map(b=>b.content||'').join(' ')
  function saveLedger() {
    const entries=[]
    for(const tag of ledgerTags) {
      const amount=Number(amountDraft[tag] ?? ledgerRows.find(r=>r.tag===tag)?.amount ?? 0)
      if(amount) entries.push({id:crypto.randomUUID(),tag,amount,note:''})
    }
    const old=(ledgerDay.expenses||[]).filter(e=>!ledgerTags.includes(e.tag))
    updateDay(ledgerDate,'expenses',[...old,...entries])
    setAmountDraft({})
    alert('账目已保存。')
  }
  function renameTag(oldName) {
    const next=(tagDraft[oldName]||'').trim()
    if(!next || next===oldName) {setEditingTag('');return}
    if(ledgerTags.includes(next)) {alert('这个标签已经存在。');return}
    setData(prev=>({...prev,ledgerTags:prev.ledgerTags.map(t=>t===oldName?next:t)}))
    setData(prev=>({...prev,days:Object.fromEntries(Object.entries(prev.days).map(([d,v])=>[d,{...v,expenses:(v.expenses||[]).map(e=>e.tag===oldName?{...e,tag:next}:e)}]))}))
    setEditingTag('')
  }
  function addTag() {
    const t=newTag.trim()
    if(!t)return
    if(ledgerTags.includes(t)){alert('这个标签已经存在。');return}
    setData(prev=>({...prev,ledgerTags:[...ledgerTags,t]}));setNewTag('')
  }
  function goDiary(d=date){setDate(d);setPage('diary');setActivePicker('');setPeriodEditing(false)}
  function picker(label,content) {
    return <div className="picker-wrap"><button className="pill-control" onClick={()=>setActivePicker(activePicker===label?'':label)}>{content}</button>
      {activePicker===label && <div className="picker-pop">{label==='weather'?weathers.map(([ic,n])=><button key={n} onClick={()=>{updateDay(date,'weather',n);setActivePicker('')}}>{ic} {n}</button>):moods.map(m=><button key={m} onClick={()=>{updateDay(date,'mood',m);setActivePicker('')}}>{m}</button>)}</div>}
    </div>
  }

  if (!dataReady) return <div style={{padding:40,textAlign:'center'}}>正在解密并加载日记……</div>
  return <main className="app-shell">
    <header className="brand-header">
      <div className="brand-word" aria-label="DiArY"><span>D</span><span className="tiny-letter">i</span><span>A</span><span className="tiny-letter">r</span><span>Y</span></div>
      <p>把日子写下来，让每个瞬间都有迹可循。</p>
    </header>

    {page==='diary' && <section className="page-card diary-page">
      <div className="meta-row">
        <label className="date-control"><span>DATE</span><input type="date" value={date} onChange={e=>{setDate(e.target.value);setPeriodEditing(false)}} /></label>
        {picker('weather',day.weather?`${weathers.find(w=>w[1]===day.weather)?.[0]||'☁️'} ${day.weather}`:'选择天气')}
        {picker('mood',day.mood?`心情 ${day.mood}`:'选择心情')}
      </div>
      {data.settings.periodEnabled && <div className="period-row">
        <span className="micro-label">PERIOD</span>
        {day.period.isPeriod===null || day.period.isPeriod===undefined ? <>
          <button className="pill-control" onClick={()=>{updateDay(date,'period',{isPeriod:true,flow:'',color:''});setPeriodEditing(true)}}>记录经期</button>
          <button className="text-link" onClick={()=>updateDay(date,'period',{isPeriod:false,flow:'',color:''})}>不在经期</button>
        </> : day.period.isPeriod===false ? <>
          <span className="period-summary">不在经期</span><button className="text-link" onClick={()=>{updateDay(date,'period',{isPeriod:true,flow:'',color:''});setPeriodEditing(true)}}>修改</button>
        </> : <>
          {day.period.flow && day.period.color && !periodEditing ? <>
            <span className="period-summary">经期中 · {day.period.flow} · {day.period.color}</span>
            <button className="text-link" onClick={()=>setPeriodEditing(true)}>修改</button>
          </> : <div className="period-details">
            <div className="inline-options"><span>经血量</span>{flows.map(f=><button key={f} className={day.period.flow===f?'mini-option chosen':'mini-option'} onClick={()=>{updateDay(date,'period',{...day.period,flow:f});if(day.period.color)setPeriodEditing(false)}}>{f}</button>)}</div>
            <div className="inline-options"><span>颜色</span>{periodColors.map(([n,c])=><button key={n} className={day.period.color===n?'color-choice chosen':'color-choice'} onClick={()=>{updateDay(date,'period',{...day.period,color:n});if(day.period.flow)setPeriodEditing(false)}}><i style={{background:c}}/>{n}</button>)}</div>
          </div>}
        </>}
      </div>}
      <div className="section-heading"><span className="eyebrow">YOUR DAILY PAGE</span><h1>ToDay<span>.</span></h1><p>{date}</p></div>
      <div className="writing-area">
        {(day.blocks||[]).map((block,index)=>block.type==='media'
          ? <MediaItem key={block.id} block={block} onDelete={()=>removeBlock(date,block)} onSize={size=>updateBlock(date,block.id,{size})}/>
          : <div className="text-block" key={block.id}>
              <textarea value={block.content||''} placeholder="今天发生了什么？此刻的你在想些什么……" onChange={e=>updateBlock(date,block.id,{content:e.target.value})}/>
              <div className="block-actions"><button className="quiet" onClick={()=>{setInsertAfter(index);document.getElementById('diary-files').click()}}>在这里插入图片</button>{day.blocks.length>1&&<button className="quiet danger-text" onClick={()=>removeBlock(date,block)}>删除段落</button>}</div>
            </div>)}
        <button className="add-text" onClick={()=>updateDay(date,'blocks',[...(day.blocks||[]),{id:crypto.randomUUID(),type:'text',content:''}])}>＋ 添加文字段落</button>
      </div>
      <input id="diary-files" className="hidden-input" type="file" accept="image/*,video/*" multiple disabled={busy} onChange={addFiles}/>
      <div className="diary-actions">
        <label className="gallery-button">＋ 图库<input type="file" accept="image/*,video/*" multiple disabled={busy} onChange={addFiles}/></label>
        <button className="save-button" onClick={async()=>{try{await saveEncryptedData(data);alert('今天的记录已加密保存。')}catch(error){alert('保存失败：'+error.message)}}}>保存</button>
        <div className="clear-control"><select value={clearScope} onChange={e=>setClearScope(e.target.value)}><option value="all">全部</option><option value="diary">日记和附件</option><option value="records">天气、心情、经期</option><option value="ledger">记账</option></select><button className="quiet danger-text" onClick={clearSelected}>清空</button></div>
      </div>
      {busy&&<p className="muted">正在添加附件……</p>}
      <p className="save-status">自动加密保存已开启 · 日记内容在本设备加密存储</p>
    </section>}

    {page==='search' && <section className="page-card">
      <div className="section-heading"><span className="eyebrow">FIND A MOMENT</span><h1>搜索<span>.</span></h1></div>
      <input className="search-input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索日记里的文字……"/>
      <div className="search-filter"><label>按日期</label><input type="date" value={searchDate} onChange={e=>setSearchDate(e.target.value)}/><label>按月份</label><input type="month" value={calendarMonth} onChange={e=>setCalendarMonth(e.target.value)}/><button className="text-link" onClick={()=>{setSearchDate('');setCalendarMonth('')}}>清除日期筛选</button></div>
      <div className="result-list">{searchResults.map(d=>{const p=data.days[d].period||{};return <button key={d} className="result-card" onClick={()=>goDiary(d)}><span>{d}</span><strong>{data.days[d].mood||'—'} {data.days[d].weather||''}{data.settings.periodEnabled&&p.isPeriod===true?` 经期${p.flow?' · '+p.flow:''}${p.color?' · '+p.color:''}`:data.settings.periodEnabled&&p.isPeriod===false?' 不在经期':''}</strong><p>{textForSearch(data.days[d]).trim()||'（这一天没有文字内容）'}</p></button>})}
        {!searchResults.length&&<p className="empty-state">没有找到记录。试试其他文字或月份。</p>}</div>
    </section>}

    {page==='ledger' && data.settings.ledgerEnabled && <section className="page-card">
      <div className="ledger-top"><label className="date-control"><span>LEDGER DATE</span><input type="date" value={ledgerDate} onChange={e=>{setLedgerDate(e.target.value);setDate(e.target.value)}}/></label><button className="save-button compact" onClick={saveLedger}>保存</button><button className="pill-control" onClick={()=>setLedgerStats(!ledgerStats)}>{ledgerStats?'返回记账':'统计'}</button></div>
      {ledgerStats ? <><div className="section-heading"><span className="eyebrow">MONTHLY OVERVIEW</span><h1>收支统计<span>.</span></h1></div>
        <section className="stats-panel"><div className="stats-title"><h2>总收支</h2><select value={totalChartType} onChange={e=>setTotalChartType(e.target.value)}><option value="bar">柱状图</option><option value="line">折线图</option><option value="pie">饼图</option></select></div>
          <div className="chart">{totalChartType==='bar'?<ResponsiveContainer width="100%" height={280}><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip/><Legend/><Bar dataKey="income" name="收入" fill="var(--accent)"/><Bar dataKey="expense" name="支出" fill="var(--accent-2)"/></BarChart></ResponsiveContainer>:totalChartType==='line'?<ResponsiveContainer width="100%" height={280}><LineChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="month"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="income" name="收入" stroke="var(--accent)" strokeWidth={2}/><Line type="monotone" dataKey="expense" name="支出" stroke="var(--accent-2)" strokeWidth={2}/></LineChart></ResponsiveContainer>:<ResponsiveContainer width="100%" height={280}><PieChart><Pie data={[{name:'收入',value:allIncome},{name:'支出',value:allExpense}].filter(x=>x.value>0)} dataKey="value" nameKey="name" outerRadius={95} label><Cell fill="var(--accent)"/><Cell fill="var(--accent-2)"/></Pie><Tooltip formatter={v=>money(v)}/><Legend/></PieChart></ResponsiveContainer>}</div>
          <div className="summary-line"><span>累计收入</span><strong>{money(allIncome)}</strong><span>累计支出</span><strong>{money(allExpense)}</strong></div>
        </section>
        <section className="stats-panel"><div className="stats-title"><h2>分类收支</h2><div className="stats-controls"><select value={categoryMetric} onChange={e=>setCategoryMetric(e.target.value)}><option value="expense">支出</option><option value="income">收入</option></select><select value={categoryChartType} onChange={e=>setCategoryChartType(e.target.value)}><option value="bar">柱状图</option><option value="line">折线图</option><option value="pie">饼图</option></select></div></div>
          <div className="chart">{!categoryData.length?<p className="empty-state">还没有记账数据，保存账目后这里会自动生成分类统计。</p>:categoryChartType==='bar'?<ResponsiveContainer width="100%" height={280}><BarChart data={categoryData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="tag"/><YAxis/><Tooltip formatter={v=>money(v)}/><Bar dataKey={categoryMetric} name={categoryMetric==='income'?'收入':'支出'} fill="var(--accent)"/></BarChart></ResponsiveContainer>:categoryChartType==='line'?<ResponsiveContainer width="100%" height={280}><LineChart data={categoryData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="tag"/><YAxis/><Tooltip formatter={v=>money(v)}/><Line type="monotone" dataKey={categoryMetric} name={categoryMetric==='income'?'收入':'支出'} stroke="var(--accent)" strokeWidth={2}/></LineChart></ResponsiveContainer>:<ResponsiveContainer width="100%" height={280}><PieChart><Pie data={categoryData.filter(x=>x[categoryMetric]>0)} dataKey={categoryMetric} nameKey="tag" outerRadius={100} label>{categoryData.filter(x=>x[categoryMetric]>0).map((x,i)=><Cell key={x.tag} fill={pieColors[i%pieColors.length]}/>)}</Pie><Tooltip formatter={v=>money(v)}/><Legend/></PieChart></ResponsiveContainer>}</div>
        </section>
      </> : <>
        <div className="section-heading"><span className="eyebrow">DAILY LEDGER</span><h1>记账<span>.</span></h1><p>填写金额，正数为收入，负数为支出。</p></div>
        <div className="ledger-table">{ledgerTags.map(tag=><div className="ledger-entry" key={tag}>
          <div className="ledger-tag">{editingTag===tag?<><input value={tagDraft[tag]??tag} onChange={e=>setTagDraft(p=>({...p,[tag]:e.target.value}))}/><button className="text-link" onClick={()=>renameTag(tag)}>完成</button></>:<><span>{tag}</span><button className="quiet" onClick={()=>{setEditingTag(tag);setTagDraft(p=>({...p,[tag]:tag}))}}>编辑</button></>}</div>
          <input className="amount-input" type="number" step="0.01" placeholder="0.00" value={amountDraft[tag]??(ledgerRows.find(r=>r.tag===tag)?.amount||'')} onChange={e=>setAmountDraft(p=>({...p,[tag]:e.target.value}))}/>
        </div>)}</div>
        <div className="add-tag-row"><input value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder="添加自定义标签"/><button className="text-link" onClick={addTag}>＋ 添加</button></div>
        <div className="total-row"><span>当日合计</span><strong>{money(dailyTotal)}</strong></div>
      </>}
    </section>}

    {page==='settings' && <section className="page-card">
      <div className="section-heading"><span className="eyebrow">MAKE IT YOURS</span><h1>设置<span>.</span></h1></div>
      <div className="setting-list">
        <div className="setting-item">
          <span><strong>重新生成恢复码</strong><small>旧恢复码将立即失效，请保存新恢复码</small></span>
          <button type="button" className="text-link" onClick={async()=>{
            if(!confirm('重新生成后，旧恢复码将失效。确定继续吗？')) return
            try {
              const code = await regenerateRecoveryCode()
              alert('请立即保存新的恢复码：\\n\\n' + code + '\\n\\n关闭此提示后将无法再次查看。')
            } catch(error) {
              alert('恢复码生成失败：' + error.message)
            }
          }}>重新生成</button>
        </div>
        <label className="setting-item"><span><strong>开启经期记录</strong><small>在日记页面显示经期记录入口</small></span><input type="checkbox" checked={!!data.settings.periodEnabled} onChange={e=>updateSettings('periodEnabled',e.target.checked)}/></label>
        <label className="setting-item"><span><strong>开启记账入口</strong><small>在底部导航中显示记账页面</small></span><input type="checkbox" checked={!!data.settings.ledgerEnabled} onChange={e=>updateSettings('ledgerEnabled',e.target.checked)}/></label>
      </div>
      <div className="theme-entry"><button className="setting-item theme-toggle" onClick={()=>{setThemeOpen(v=>!v);setThemeTouched({scope:false,palette:false,direction:false})}}><span><strong>配色</strong></span><span className="theme-chevron">{themeOpen?'－':'＋'}</span></button>
      {themeOpen&&<div className="theme-options">
        <div className="theme-heading"><h2>配色适用范围</h2></div><div className="choice-row"><button className={themeScope==='accent'?'choice-chip selected':'choice-chip'} onClick={()=>{updateSettings('themeScope','accent');const t={...themeTouched,scope:true};setThemeTouched(t);if(t.scope&&t.palette&&t.direction)setThemeOpen(false)}}>局部点缀</button><button className={themeScope==='background'?'choice-chip selected':'choice-chip'} onClick={()=>{updateSettings('themeScope','background');const t={...themeTouched,scope:true};setThemeTouched(t);if(t.scope&&t.palette&&t.direction)setThemeOpen(false)}}>背景拼色</button></div>
        <div className="theme-heading"><h2>界面配色</h2></div>
        <div className="palette-grid">{palettes.map((p,i)=><button key={p.name} className={Number(data.settings.themeIndex||0)===i?'palette-card selected-palette':''} onClick={()=>{updateSettings('themeIndex',i);const t={...themeTouched,palette:true};setThemeTouched(t);if(t.scope&&t.palette&&t.direction)setThemeOpen(false)}}><span className="swatches"><i style={{background:p.a}}/><i style={{background:p.b}}/>{p.c&&<i style={{background:p.c}}/>}</span><span>{p.name}</span>{Number(data.settings.themeIndex||0)===i&&<b>✓</b>}</button>)}</div>
        <div className="theme-heading"><h2>拼色方式</h2></div><div className="choice-row"><button className={splitDirection==='vertical'?'choice-chip selected':'choice-chip'} onClick={()=>{updateSettings('splitDirection','vertical');const t={...themeTouched,direction:true};setThemeTouched(t);if(t.scope&&t.palette&&t.direction)setThemeOpen(false)}}>上下拼色</button><button className={splitDirection==='horizontal'?'choice-chip selected':'choice-chip'} onClick={()=>{updateSettings('splitDirection','horizontal');const t={...themeTouched,direction:true};setThemeTouched(t);if(t.scope&&t.palette&&t.direction)setThemeOpen(false)}}>左右拼色</button></div>
      </div>}</div>
    </section>}

    <nav className="bottom-nav">
      <button className={page==='diary'?'nav-active':''} onClick={()=>setPage('diary')}><span>✎</span>日记</button>
      <button className={page==='search'?'nav-active':''} onClick={()=>setPage('search')}><span>⌕</span>搜索</button>
      {data.settings.ledgerEnabled&&<button className={page==='ledger'?'nav-active':''} onClick={()=>{setLedgerDate(date);setPage('ledger')}}><span>＋</span>记账</button>}
      <button className={page==='settings'?'nav-active':''} onClick={()=>setPage('settings')}><span>◌</span>设置</button>
    </nav>
  </main>
}
export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudMessage, setCloudMessage] = useState('')

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('读取登录状态失败：', error)
      if (mounted) {
        setSession(data?.session ?? null)
        setAuthReady(true)
      }
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession)
        setUnlocked(false)
      }
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!authReady) {
    return <div style={{ padding: 40, textAlign: 'center' }}>正在检查账号登录状态……</div>
  }

  if (!session) {
    return <AccountGate onLoggedIn={setSession} />
  }

  if (!cloudReady) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p>正在连接云端日记……</p>
        <button onClick={async () => {
          try {
            setCloudMessage('正在检查云端数据……')
            const result = await downloadCloudVault(session.user.id)
            if (result?.status === 'local_and_cloud_exist') {
              setCloudMessage('本机和云端都已有保险库。为防止覆盖，暂不自动合并；将优先保留本机数据。')
            } else if (result?.status === 'downloaded') {
              setCloudMessage('已下载云端加密保险库。')
            } else {
              setCloudMessage('云端暂无保险库，将使用本机保险库。')
            }
            setCloudReady(true)
          } catch (error) {
            setCloudMessage('云端连接失败：' + error.message)
          }
        }}>连接云端</button>
        {cloudMessage && <p>{cloudMessage}</p>}
      </div>
    )
  }

  if (!unlocked) {
    return <VaultGate onUnlocked={async () => {
      setUnlocked(true)
      try {
        await uploadCloudVault(session.user.id)
        setCloudMessage('加密日记已同步到云端。')
      } catch (error) {
        console.error('云同步失败：', error)
        setCloudMessage('云同步失败：' + error.message)
      }
    }} />
  }

  return <DiaryApp />
}
