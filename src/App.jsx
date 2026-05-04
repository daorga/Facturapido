import React, { useState, useRef, useCallback, useEffect } from "react"
import { supabase } from "./supabase.js"

// API key stored locally on device — never leaves the phone

// ── STORES ───────────────────────────────────────────────────────────
const STORES = {
  walmart:  { name:"Walmart",  color:"#0071CE", emoji:"🛒", portal:"https://facturacion.walmart.com.mx",                  pasos:["Abre el portal de Walmart","Ingresa el TC (21 dígitos exactos, sin espacios)","Ingresa el TR tal como aparece","Captura RFC y datos fiscales","Descarga tu CFDI"],                                         campos:["TC (21 dígitos)","TR"] },
  lacomer:  { name:"La Comer", color:"#E30613", emoji:"🏪", portal:"https://www.lacomer.com.mx/lacomer/facturacion",       pasos:["Abre el portal de La Comer","Ingresa el folio del ticket","Ingresa la fecha de compra","Captura RFC y datos fiscales","Descarga tu factura"],                                                                   campos:["Folio","Fecha","RFC","Correo"] },
  costco:   { name:"Costco",   color:"#005DAA", emoji:"📦", portal:"https://www.costco.com.mx/facturacion",                pasos:["Abre el portal de Costco","Ingresa el número DEBAJO del código de barras","Ingresa tu número de membresía","Captura RFC y datos fiscales","Descarga tu factura"],                                           campos:["Núm. bajo código de barras","Núm. de membresía","RFC"] },
  chedraui: { name:"Chedraui", color:"#009B3A", emoji:"🛍️", portal:"https://facturacion.chedraui.com.mx",                  pasos:["Abre el portal de Chedraui","Ingresa el folio del ticket","Ingresa la fecha de compra","Captura RFC y datos fiscales","Genera tu factura"],                                                                    campos:["Folio","Fecha de compra","RFC","Código postal"] },
}

// ── QUINCENA UTILS ───────────────────────────────────────────────────
const MONTHS = ["","Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const makeQKey = (y,m,h) => `${y}-${String(m).padStart(2,"0")}-${h}`
const qLabel   = (key) => { const [y,m,h]=key.split("-"); return `${h==="1Q"?"1ra":"2da"} quincena ${MONTHS[parseInt(m)]} ${y}` }
const nowQKey  = () => { const n=new Date(); return makeQKey(n.getFullYear(),n.getMonth()+1,n.getDate()<=15?"1Q":"2Q") }
const allQ     = () => { const r=[]; for(let m=5;m<=12;m++){r.push({key:makeQKey(2026,m,"1Q"),label:`1ra quincena ${MONTHS[m]} 2026`});r.push({key:makeQKey(2026,m,"2Q"),label:`2da quincena ${MONTHS[m]} 2026`})}; return r }

// ── HELPERS ──────────────────────────────────────────────────────────
const parseAmt = v => { if(!v) return 0; const n=parseFloat(v.toString().replace(/[^0-9.]/g,"")); return isNaN(n)?0:n }
const fmt      = n => n.toLocaleString("es-MX",{style:"currency",currency:"MXN"})
const toDataURL= f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f) })
const toB64    = f => new Promise((res,rej)=>{ const r=new FileReader(); r.onload=e=>res(e.target.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(f) })

const compressImg = f => new Promise(resolve => {
  const img = new Image()
  img.onload = () => {
    try {
      const MAX=1400, {naturalWidth:ow, naturalHeight:oh}=img
      let w=ow, h=oh
      if(w>MAX||h>MAX){ if(w>h){h=Math.round(h*MAX/w);w=MAX}else{w=Math.round(w*MAX/h);h=MAX} }
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h
      cv.getContext("2d").drawImage(img,0,0,w,h)
      cv.toBlob(b=>resolve(b&&b.size>0?b:f),"image/jpeg",0.85)
    } catch { resolve(f) }
  }
  img.onerror=()=>resolve(f)
  img.src=URL.createObjectURL(f)
})

// ── COMPONENT ────────────────────────────────────────────────────────
export default function App() {
  const [view,       setView]       = useState("main")
  const [showQPick,  setShowQPick]  = useState(false)
  const [scanning,   setScanning]   = useState(false)
  const [imgPreview, setImgPreview] = useState(null)
  const [imgDataURL, setImgDataURL] = useState(null)
  const [ticketData, setTicketData] = useState(null)
  const [guideStore, setGuideStore] = useState(null)
  const [error,      setError]      = useState(null)
  const [dragOver,   setDragOver]   = useState(false)
  const [copied,     setCopied]     = useState(null)
  const [tickets,    setTickets]    = useState([])
  const [fiscal,     setFiscal]     = useState({rfc:"",razonSocial:"",cp:"",regimen:"",usoCfdi:"G03 - Gastos en general",email:""})
  const [meta,       setMeta]       = useState(0)
  const [metaInput,  setMetaInput]  = useState("")
  const [savedOk,    setSavedOk]    = useState(false)
  const [lightbox,   setLightbox]   = useState(null)
  const [activeQ,    setActiveQ]    = useState(nowQKey())
  const [loading,    setLoading]    = useState(true)
  const [apiKey,     setApiKey]     = useState(()=>localStorage.getItem("fr_api_key")||"")
  const [apiKeyInput,setApiKeyInput]= useState(()=>localStorage.getItem("fr_api_key")||"")
  const fileRef = useRef()

  // ── SUPABASE LOAD ────────────────────────────────────────────────────
  useEffect(()=>{
    const load = async () => {
      setLoading(true)
      // Load tickets for active quincena
      const {data:tix} = await supabase.from("tickets").select("*").eq("quincena",activeQ).order("created_at",{ascending:false})
      setTickets(tix||[])
      // Load fiscal profile
      const {data:prof} = await supabase.from("perfil").select("*").limit(1).single()
      if(prof){ setFiscal({rfc:prof.rfc||"",razonSocial:prof.razon_social||"",cp:prof.cp||"",regimen:prof.regimen||"",usoCfdi:prof.uso_cfdi||"G03 - Gastos en general",email:prof.email||""}); setMeta(prof.meta_quincena||0); setMetaInput(String(prof.meta_quincena||"")) }
      setLoading(false)
    }
    load()
  },[activeQ])

  const saveFiscal = async () => {
    const m=parseFloat(metaInput)||0; setMeta(m)
    const row={rfc:fiscal.rfc,razon_social:fiscal.razonSocial,cp:fiscal.cp,regimen:fiscal.regimen,uso_cfdi:fiscal.usoCfdi,email:fiscal.email,meta_quincena:m}
    const {data:existing}=await supabase.from("perfil").select("id").limit(1).single()
    if(existing?.id) await supabase.from("perfil").update(row).eq("id",existing.id)
    else await supabase.from("perfil").insert(row)
    setSavedOk(true); setTimeout(()=>setSavedOk(false),2000)
  }

  const addTicket = async (t, imgURL) => {
    const row = { quincena:activeQ, establecimiento:t.establecimiento, nombre_establecimiento:t.nombreEstablecimiento, folio:t.folio||null, tc:t.tc||null, tr:t.tr||null, codigo_barras:t.codigoBarras||null, fecha:t.fecha||null, hora:t.hora||null, total:parseAmt(t.total)||null, subtotal:parseAmt(t.subtotal)||null, iva:parseAmt(t.iva)||null, sucursal:t.sucursal||null, tc_valido:t.tcValido||null, img_data_url: imgURL||null }
    const {data} = await supabase.from("tickets").insert(row).select().single()
    if(data) setTickets(prev=>[data,...prev])
  }

  const removeTicket = async (id) => {
    await supabase.from("tickets").delete().eq("id",id)
    setTickets(prev=>prev.filter(t=>t.id!==id))
  }

  // ── OCR ──────────────────────────────────────────────────────────────
  const processImage = useCallback(async (file)=>{
    const currentKey = localStorage.getItem("fr_api_key")||""
    if(!currentKey){ setError("Primero configura tu API key de Anthropic en ⚙️ Configuración"); setView("scan"); return }
    setScanning(true); setError(null)
    try { setImgDataURL(await toDataURL(file)) } catch{}
    let send=file
    try { send=await compressImg(file) } catch{}
    try {
      const base64=await toB64(send)
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":currentKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-opus-4-5",
          max_tokens:1024,
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:"image/jpeg",data:base64}},
            {type:"text",text:`Analiza este ticket de supermercado mexicano. Responde SOLO con JSON válido, sin markdown ni texto extra:
{"establecimiento":"walmart|lacomer|costco|chedraui|otro","nombreEstablecimiento":"texto","folio":"string|null","tc":"SOLO Walmart: campo TC|null","tr":"SOLO Walmart: campo TR|null","codigoBarras":"SOLO Costco: número bajo código de barras|null","fecha":"DD/MM/YYYY|null","hora":"HH:MM|null","total":numero_o_null,"subtotal":numero_o_null,"iva":numero_o_null,"sucursal":"string|null","confianza":"alta|media|baja"}
WALMART TC: Busca la línea que contiene "TC#" o "TC". El TC son los 21 dígitos que siguen inmediatamente después del símbolo #. Ignora el # y cualquier letra antes. Correcciones obligatorias dígito por dígito: I→1, l→1, O→0, S→5, B→8, Z→2, G→6, q→9. El último carácter frecuentemente es confundido entre l y 1 — siempre es 1. Cuenta los dígitos: deben ser exactamente 21. SIN espacios.
WALMART TR: Busca "TR" o "TRW" en la misma línea que el TC. Copia el valor exacto incluyendo letras y números. SIN espacios.
COSTCO: número DEBAJO del código de barras, NO el de membresía. SIN espacios.
CHEDRAUI folio: el folio tiene exactamente 20 dígitos. SIN espacios ni guiones.
LA COMER folio: copia el folio exactamente como aparece. SIN espacios.
TODOS LOS CAMPOS NUMÉRICOS: nunca incluyas espacios internos en ningún número o código.
Total/subtotal/iva: número puro sin $ ni comas, ej: 1234.56`}
          ]}]
        })
      })
      const data=await resp.json()
      if(!resp.ok||data.error){ setError("Error API: "+(data.error?.message||JSON.stringify(data))); setView("scan"); return }
      const raw=data.content?.find(b=>b.type==="text")?.text||""
      const j0=raw.indexOf("{"), j1=raw.lastIndexOf("}")
      if(j0===-1||j1===-1){ setError("Respuesta sin JSON: "+raw.slice(0,120)); setView("scan"); return }
      let parsed
      try{ parsed=JSON.parse(raw.slice(j0,j1+1)) }catch(e){ setError("JSON inválido: "+raw.slice(j0,j0+120)); setView("scan"); return }
      if(parsed.tc){
        let tc=parsed.tc.toString().replace(/\s/g,"").replace(/[IlÍí|]/g,"1").replace(/[OoÓó]/g,"0").replace(/[Ss]/g,"5").replace(/[Bb]/g,"8").replace(/[Zz]/g,"2").replace(/[Gg]/g,"6").replace(/[^0-9]/g,"")
        parsed.tc=tc; parsed.tcValido=tc.length===21
      }
      // Strip spaces from all code fields
      if(parsed.tr) parsed.tr=parsed.tr.toString().replace(/\s/g,"")
      if(parsed.codigoBarras) parsed.codigoBarras=parsed.codigoBarras.toString().replace(/\s/g,"")
      if(parsed.folio) parsed.folio=parsed.folio.toString().replace(/\s/g,"")
      setTicketData(parsed); setView("result")
    } catch(e){
      setError("Error: "+(e?.message||"desconocido")); setView("scan")
    } finally { setScanning(false) }
  },[])

  const handleFile = f => { if(!f||!f.type.startsWith("image/")) return; setImgPreview(URL.createObjectURL(f)); processImage(f) }
  const copy = (text,key) => { if(!text) return; navigator.clipboard.writeText(text.toString()); setCopied(key); setTimeout(()=>setCopied(null),1500) }

  // ── DERIVED ───────────────────────────────────────────────────────────
  const totalQ   = tickets.reduce((s,t)=>s+parseAmt(t.total),0)
  const pct      = meta>0?Math.min((totalQ/meta)*100,100):0
  const restante = Math.max(meta-totalQ,0)
  const excedente= meta>0&&totalQ>meta?totalQ-meta:0
  const barColor = pct>=100?"#f87171":pct>=80?"#fbbf24":"#34d399"

  // ── STYLES ────────────────────────────────────────────────────────────
  const C={page:"linear-gradient(160deg,#070b12 0%,#0e1820 55%,#070b12 100%)",card:"rgba(255,255,255,0.04)",border:"rgba(255,255,255,0.08)",muted:"rgba(255,255,255,0.35)",green:"#34d399",red:"#f87171",yellow:"#fbbf24"}
  const s={
    wrap:{minHeight:"100vh",background:C.page,fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#eef0f3"},
    hdr:{display:"flex",alignItems:"center",gap:10,padding:"14px 18px",borderBottom:`1px solid ${C.border}`},
    logo:{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#38bdf8,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0},
    body:{maxWidth:460,margin:"0 auto",padding:"18px 14px 88px"},
    card:{background:C.card,border:`1px solid ${C.border}`,borderRadius:13,padding:15,marginBottom:11},
    lbl:{fontSize:10,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:9,display:"block"},
    btn:{background:"linear-gradient(135deg,#38bdf8,#6366f1)",color:"#fff",fontWeight:700,border:"none",borderRadius:10,padding:"13px 20px",cursor:"pointer",fontSize:15,width:"100%"},
    ghost:{background:"rgba(255,255,255,0.05)",color:"#eef0f3",border:`1px solid ${C.border}`,borderRadius:10,padding:"9px 13px",cursor:"pointer",fontSize:13},
    input:{background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 12px",color:"#eef0f3",fontSize:14,width:"100%",outline:"none",fontFamily:"inherit"},
    row:{display:"flex",alignItems:"center",gap:8,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",marginBottom:7},
    nav:{position:"fixed",bottom:0,left:0,right:0,background:"rgba(7,11,18,0.96)",backdropFilter:"blur(14px)",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-around",padding:"9px 0 15px"},
    navb:a=>({display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",padding:"4px 18px",borderRadius:8,background:a?"rgba(99,102,241,0.15)":"transparent",border:"none",color:a?"#818cf8":C.muted,fontSize:10,fontWeight:600}),
  }

  // ── QUINCENA PICKER ───────────────────────────────────────────────────
  const QPicker=()=>{
    const list=allQ(), curKey=nowQKey()
    return(
      <div onClick={()=>setShowQPick(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"flex-end"}}>
        <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:460,margin:"0 auto",background:"#0e1820",borderRadius:"18px 18px 0 0",border:`1px solid ${C.border}`,maxHeight:"70vh",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"16px 18px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
            <div style={{fontSize:15,fontWeight:700}}>Seleccionar quincena</div>
            <button onClick={()=>setShowQPick(false)} style={{...s.ghost,padding:"5px 10px",fontSize:12}}>✕</button>
          </div>
          <div style={{overflowY:"auto",padding:"8px 14px 20px"}}>
            {list.map(q=>{
              const isA=q.key===activeQ, isCur=q.key===curKey
              return(
                <div key={q.key} onClick={()=>{setActiveQ(q.key);setShowQPick(false)}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 13px",borderRadius:10,marginBottom:4,cursor:"pointer",background:isA?"rgba(99,102,241,0.15)":"rgba(255,255,255,0.03)",border:`1px solid ${isA?"rgba(99,102,241,0.4)":C.border}`}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:isA?700:400,color:isA?"#818cf8":"#eef0f3"}}>{q.label}</div>
                    {isCur&&<div style={{fontSize:10,color:C.green,marginTop:1}}>● quincena actual</div>}
                  </div>
                  {isA&&<span style={{color:"#818cf8",fontSize:16}}>✓</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── TICKET CARD ───────────────────────────────────────────────────────
  const TCard=({t})=>{
    const st=STORES[t.establecimiento], isW=t.establecimiento==="walmart", isC=t.establecimiento==="costco"
    return(
      <div style={s.card}>
        <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
          {t.img_data_url&&<div onClick={()=>setLightbox(t.img_data_url)} style={{width:44,height:56,borderRadius:7,overflow:"hidden",flexShrink:0,cursor:"pointer",border:`1px solid ${C.border}`}}><img src={t.img_data_url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>}
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:15}}>{st?.emoji||"🏪"}</span><span style={{fontSize:14,fontWeight:700}}>{st?.name||t.nombre_establecimiento}</span></div>
              <span style={{fontSize:16,fontWeight:700,color:C.green}}>{fmt(parseAmt(t.total))}</span>
            </div>
            {isW&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:3}}>
              <span style={{fontSize:11,fontFamily:"monospace",background:"rgba(0,113,206,0.2)",border:"1px solid rgba(0,113,206,0.35)",padding:"2px 7px",borderRadius:5}}>TC {t.tc||"—"}{t.tc&&!t.tc_valido&&<span style={{color:C.yellow}}> ⚠️</span>}</span>
              <span style={{fontSize:11,fontFamily:"monospace",background:"rgba(0,113,206,0.2)",border:"1px solid rgba(0,113,206,0.35)",padding:"2px 7px",borderRadius:5}}>TR {t.tr||"—"}</span>
            </div>}
            {isC&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:3}}>
              <span style={{fontSize:11,background:"rgba(0,93,170,0.2)",border:"1px solid rgba(0,93,170,0.35)",padding:"2px 7px",borderRadius:5}}>📅 {t.fecha||"—"}</span>
              <span style={{fontSize:11,fontFamily:"monospace",background:"rgba(0,93,170,0.2)",border:"1px solid rgba(0,93,170,0.35)",padding:"2px 7px",borderRadius:5}}>🎫 {t.codigo_barras||"—"}</span>
            </div>}
            {!isW&&!isC&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:3}}>
              <span style={{fontSize:11,background:"rgba(255,255,255,0.06)",padding:"2px 7px",borderRadius:5}}>📅 {t.fecha||"—"}</span>
              {t.folio&&<span style={{fontSize:11,fontFamily:"monospace",background:"rgba(255,255,255,0.06)",padding:"2px 7px",borderRadius:5}}>Folio {t.folio}</span>}
            </div>}
            {t.sucursal&&<div style={{fontSize:11,color:C.muted}}>{t.sucursal}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,marginTop:10}}>
          <button onClick={()=>{setTicketData({establecimiento:t.establecimiento,tc:t.tc,tr:t.tr,codigoBarras:t.codigo_barras,fecha:t.fecha,folio:t.folio,total:t.total});setGuideStore(STORES[t.establecimiento]);setView("guide")}} style={{...s.ghost,flex:1,fontSize:12,padding:"7px 10px",textAlign:"center"}}>Facturar →</button>
          {t.img_data_url&&<button onClick={()=>setLightbox(t.img_data_url)} style={{...s.ghost,fontSize:12,padding:"7px 10px"}}>🖼️</button>}
          <button onClick={()=>removeTicket(t.id)} style={{...s.ghost,fontSize:12,padding:"7px 12px",color:C.red,borderColor:"rgba(248,113,113,0.2)"}}>✕</button>
        </div>
      </div>
    )
  }

  // ── MAIN VIEW ─────────────────────────────────────────────────────────
  const MainView=()=>(
    <div>
      <button onClick={()=>setShowQPick(true)} style={{...s.ghost,width:"100%",display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 14px",marginBottom:14,fontSize:14,fontWeight:500}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:1}}>
          <span style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:"0.6px",fontWeight:600}}>Quincena activa</span>
          <span>{qLabel(activeQ)}</span>
        </div>
        <span style={{color:C.muted,fontSize:18}}>⌄</span>
      </button>
      <div style={{...s.card,padding:18,marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.6px"}}>Acumulado</div>
            <div style={{fontSize:30,fontWeight:700,marginTop:3,color:excedente>0?C.red:C.green,letterSpacing:"-0.5px"}}>{fmt(totalQ)}</div>
          </div>
          {meta>0&&<div style={{textAlign:"right"}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.6px"}}>Meta</div>
            <div style={{fontSize:19,fontWeight:700,marginTop:3,color:"rgba(255,255,255,0.5)"}}>{fmt(meta)}</div>
          </div>}
        </div>
        {meta>0&&<>
          <div style={{height:8,background:"rgba(255,255,255,0.07)",borderRadius:99,overflow:"hidden",marginBottom:7}}>
            <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${barColor}77,${barColor})`,borderRadius:99,transition:"width 0.5s"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
            <span style={{color:C.muted}}>{pct.toFixed(0)}% · {tickets.length} ticket{tickets.length!==1?"s":""}</span>
            {excedente>0?<span style={{color:C.red,fontWeight:600}}>+{fmt(excedente)} → próx. quincena</span>:<span style={{color:pct>=100?C.green:C.muted}}>{pct>=100?"✓ Meta alcanzada":`Faltan ${fmt(restante)}`}</span>}
          </div>
        </>}
        {meta===0&&<div style={{fontSize:12,color:"rgba(255,255,255,0.25)"}}>Configura tu meta en ⚙️ para ver el progreso</div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:7,marginTop:13}}>
          {[{l:"Tickets",v:tickets.length},{l:"Promedio",v:tickets.length>0?fmt(totalQ/tickets.length):"—"},{l:"Esta sem.",v:tickets.filter(t=>t.created_at&&(Date.now()-new Date(t.created_at).getTime())<604800000).length}].map(x=>(
            <div key={x.l} style={{background:"rgba(255,255,255,0.03)",borderRadius:9,padding:"9px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700}}>{x.v}</div>
              <div style={{fontSize:10,color:C.muted,marginTop:2,textTransform:"uppercase",letterSpacing:"0.4px"}}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>
      {loading?<div style={{textAlign:"center",padding:30,color:C.muted}}>Cargando...</div>:tickets.length===0?<div style={{textAlign:"center",padding:"32px 20px",color:"rgba(255,255,255,0.2)"}}>
        <div style={{fontSize:42,marginBottom:8}}>🧾</div>
        <div style={{fontSize:14,fontWeight:500}}>Sin tickets esta quincena</div>
        <div style={{fontSize:12,marginTop:4}}>Agrega tu primer ticket para empezar</div>
      </div>:<div><span style={s.lbl}>Tickets capturados</span>{tickets.map(t=><TCard key={t.id} t={t}/>)}</div>}
      <button style={{...s.btn,marginTop:6}} onClick={()=>{setImgPreview(null);setTicketData(null);setImgDataURL(null);setError(null);setView("scan")}}>+ Agregar ticket</button>
    </div>
  )

  // ── SCAN VIEW ─────────────────────────────────────────────────────────
  const ScanView=()=>(
    <div>
      <button style={{...s.ghost,marginBottom:14,fontSize:12}} onClick={()=>setView("main")}>← Regresar</button>
      <div style={{marginBottom:16}}><div style={{fontSize:21,fontWeight:700,letterSpacing:"-0.4px"}}>Escanear ticket</div><div style={{fontSize:13,color:C.muted,marginTop:3}}>Walmart · La Comer · Costco · Chedraui</div></div>
      <div onClick={()=>!scanning&&fileRef.current?.click()} onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0])}}
        style={{border:`1.5px dashed ${dragOver?"#38bdf8":C.border}`,borderRadius:13,padding:"32px 18px",textAlign:"center",cursor:scanning?"default":"pointer",background:dragOver?"rgba(56,189,248,0.05)":C.card,transition:"all 0.2s",position:"relative",overflow:"hidden",marginBottom:12}}>
        {scanning&&<div style={{position:"absolute",left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,#38bdf8,transparent)",top:0,animation:"sl 1.8s linear infinite"}}/>}
        {imgPreview?<div><img src={imgPreview} alt="" style={{maxHeight:210,maxWidth:"100%",borderRadius:9,marginBottom:10,opacity:scanning?0.45:1,transition:"opacity 0.3s"}}/>{scanning&&<div style={{color:"#38bdf8",fontSize:14,fontWeight:500,animation:"p 1.2s ease infinite"}}>Analizando con IA...</div>}</div>
        :<div><div style={{fontSize:44,marginBottom:10}}>📷</div><div style={{fontSize:14,fontWeight:600,marginBottom:3}}>Toca para elegir o tomar foto</div><div style={{fontSize:12,color:C.muted}}>También puedes arrastrar aquí</div></div>}
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
      </div>
      {error&&<div style={{padding:"11px 13px",background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:9,color:"#fca5a5",fontSize:13,wordBreak:"break-all"}}>⚠️ {error}</div>}
      <style>{`@keyframes sl{0%{top:0;opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}@keyframes p{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    </div>
  )

  // ── RESULT VIEW ───────────────────────────────────────────────────────
  const ResultView=()=>{
    if(!ticketData) return null
    const st=STORES[ticketData.establecimiento], tNum=parseAmt(ticketData.total)
    const newTotal=totalQ+tNum, newPct=meta>0?Math.min((newTotal/meta)*100,100):0

    // Editable key fields
    const [editTC, setEditTC] = React.useState(ticketData.tc||"")
    const [editTR, setEditTR] = React.useState(ticketData.tr||"")
    const isW=ticketData.establecimiento==="walmart", isC=ticketData.establecimiento==="costco"
    const [editCB, setEditCB] = React.useState(isC?(ticketData.codigoBarras||""):(!isW&&!isC?(ticketData.folio||""):""))
    const tcValido = editTC.length===21

    const fields=[
      !isW&&!isC?{key:"folio",label:"Folio",val:ticketData.folio,mono:true}:null,
      {key:"fecha",label:"Fecha",val:ticketData.fecha},{key:"hora",label:"Hora",val:ticketData.hora},{key:"sucursal",label:"Sucursal",val:ticketData.sucursal},
      {key:"subtotal",label:"Subtotal",val:ticketData.subtotal?fmt(parseAmt(ticketData.subtotal)):null},
      {key:"iva",label:"IVA",val:ticketData.iva?fmt(parseAmt(ticketData.iva)):null},
      {key:"total",label:"Total",val:tNum?fmt(tNum):null},
    ].filter(f=>f&&f.val)

    const getTicketToSave = () => ({
      ...ticketData,
      tc: editTC||ticketData.tc,
      tr: editTR||ticketData.tr,
      codigoBarras: isC?editCB:ticketData.codigoBarras,
      folio: (!isW&&!isC)?editCB:ticketData.folio,
      tcValido,
    })

    return(
      <div>
        <button style={{...s.ghost,marginBottom:14,fontSize:12}} onClick={()=>setView("scan")}>← Escanear otro</button>
        <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:12}}>
          <div style={{fontSize:34}}>{st?.emoji||"🏪"}</div>
          <div style={{flex:1}}><div style={{fontSize:19,fontWeight:700}}>{st?.name||ticketData.nombreEstablecimiento}</div><div style={{fontSize:12,color:ticketData.confianza==="alta"?C.green:C.yellow,marginTop:2}}>{ticketData.confianza==="alta"?"✓ Lectura alta confianza":"⚡ Verifica los datos"}</div></div>
          <div style={{fontSize:22,fontWeight:700,color:C.green}}>{tNum?fmt(tNum):""}</div>
        </div>
        {imgPreview&&<div style={{marginBottom:11,cursor:"pointer",display:"inline-block"}} onClick={()=>setLightbox(imgDataURL||imgPreview)}><div style={{position:"relative",display:"inline-block"}}><img src={imgPreview} alt="" style={{height:64,borderRadius:8,border:`1px solid ${C.border}`,objectFit:"cover"}}/><div style={{position:"absolute",bottom:0,left:0,right:0,background:"rgba(0,0,0,0.6)",fontSize:9,textAlign:"center",padding:"3px",borderBottomLeftRadius:8,borderBottomRightRadius:8,color:"rgba(255,255,255,0.65)"}}>📷 toca para ampliar</div></div></div>}
        {meta>0&&tNum>0&&<div style={{...s.card,marginBottom:11,background:"rgba(99,102,241,0.07)",borderColor:"rgba(99,102,241,0.2)"}}>
          <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Al agregar quedarías en:</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontSize:17,fontWeight:700,color:newTotal>meta?C.red:C.green}}>{fmt(newTotal)}</span><span style={{fontSize:12,color:C.muted}}>de {fmt(meta)} · {newPct.toFixed(0)}%</span></div>
          {[{w:(totalQ/meta)*100,lbl:"antes"},{w:newPct,lbl:"después",over:newTotal>meta}].map((b,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
              <div style={{flex:1,height:5,background:"rgba(255,255,255,0.07)",borderRadius:99,overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(b.w,100)}%`,background:b.over?"rgba(248,113,113,0.85)":"rgba(52,211,153,0.85)",borderRadius:99}}/></div>
              <span style={{fontSize:10,color:C.muted,width:38}}>{b.lbl}</span>
            </div>
          ))}
        </div>}

        <div style={s.card}>
          <span style={s.lbl}>Datos para facturar — edita si hay error · toca para copiar</span>

          {/* Walmart: TC y TR */}
          {isW&&<>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>TC (21 dígitos)</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input style={{...s.input,fontFamily:"monospace",fontSize:13,flex:1,borderColor:tcValido?C.green:"rgba(251,191,36,0.5)"}}
                  value={editTC} onChange={e=>setEditTC(e.target.value.replace(/[^0-9]/g,"").slice(0,21))} placeholder="21 dígitos" maxLength={21}/>
                <button onClick={()=>copy(editTC,"tc_edit")} style={{...s.ghost,fontSize:12,padding:"9px 12px",flexShrink:0}}>{copied==="tc_edit"?"✓":"⎘"}</button>
              </div>
              <div style={{fontSize:11,marginTop:3,color:tcValido?C.green:C.yellow}}>{editTC.length}/21 {tcValido?"✓ correcto":"— faltan "+(21-editTC.length)}</div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>TR</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input style={{...s.input,fontFamily:"monospace",fontSize:13,flex:1}} value={editTR} onChange={e=>setEditTR(e.target.value)} placeholder="TR del ticket"/>
                <button onClick={()=>copy(editTR,"tr_edit")} style={{...s.ghost,fontSize:12,padding:"9px 12px",flexShrink:0}}>{copied==="tr_edit"?"✓":"⎘"}</button>
              </div>
            </div>
          </>}

          {/* Costco: número bajo código de barras */}
          {isC&&<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Núm. bajo código de barras</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input style={{...s.input,fontFamily:"monospace",fontSize:13,flex:1}} value={editCB} onChange={e=>setEditCB(e.target.value)} placeholder="Número del ticket"/>
              <button onClick={()=>copy(editCB,"cb_edit")} style={{...s.ghost,fontSize:12,padding:"9px 12px",flexShrink:0}}>{copied==="cb_edit"?"✓":"⎘"}</button>
            </div>
          </div>}

          {/* La Comer / Chedraui: folio */}
          {!isW&&!isC&&<div style={{marginBottom:10}}>
            <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4}}>Folio</div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input style={{...s.input,fontFamily:"monospace",fontSize:13,flex:1}} value={editCB} onChange={e=>setEditCB(e.target.value)} placeholder="Folio del ticket"/>
              <button onClick={()=>copy(editCB,"folio_edit")} style={{...s.ghost,fontSize:12,padding:"9px 12px",flexShrink:0}}>{copied==="folio_edit"?"✓":"⎘"}</button>
            </div>
          </div>}

          {/* Fecha y Total — siempre visibles y copiables */}
          {fields.filter(f=>["fecha","total"].includes(f.key)).map(f=>(
            <div key={f.key} onClick={()=>copy(f.val,f.key)} style={{...s.row,marginBottom:7}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{f.label}</div>
                <div style={{fontSize:15,fontWeight:600,marginTop:2}}>{f.val}</div>
              </div>
              <span style={{fontSize:13,opacity:copied===f.key?1:0.2,color:copied===f.key?C.green:"#fff",transition:"all 0.2s",flexShrink:0}}>{copied===f.key?"✓":"⎘"}</span>
            </div>
          ))}
        </div>
        {fiscal.rfc&&<div style={s.card}>
          <span style={s.lbl}>Mis datos fiscales</span>
          {[{k:"rfc",l:"RFC",v:fiscal.rfc},{k:"rs",l:"Razón social",v:fiscal.razonSocial},{k:"cp",l:"C.P.",v:fiscal.cp},{k:"em",l:"Correo",v:fiscal.email}].filter(f=>f.v).map(f=>(
            <div key={f.k} onClick={()=>copy(f.v,f.k)} style={s.row}><div style={{flex:1}}><div style={{fontSize:10,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>{f.l}</div><div style={{fontSize:14,fontWeight:500,marginTop:2}}>{f.v}</div></div><span style={{fontSize:13,opacity:copied===f.k?1:0.2,color:copied===f.k?C.green:"#fff",transition:"all 0.2s"}}>{copied===f.k?"✓":"⎘"}</span></div>
          ))}
        </div>}
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          <button style={s.btn} onClick={()=>{addTicket(getTicketToSave(),imgDataURL);setView("main")}}>✓ Agregar a {qLabel(activeQ)}</button>
          <button style={{...s.ghost,textAlign:"center"}} onClick={()=>{setGuideStore(STORES[ticketData.establecimiento]);setView("guide")}}>Ver guía para facturar →</button>
        </div>
      </div>
    )
  }

  // ── GUIDE VIEW ────────────────────────────────────────────────────────
  const GuideView=()=>{
    const st=guideStore; if(!st) return null
    return(
      <div>
        <button style={{...s.ghost,marginBottom:14,fontSize:12}} onClick={()=>setView(ticketData?"result":"main")}>← Regresar</button>
        <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:18}}><span style={{fontSize:30}}>{st.emoji}</span><div><div style={{fontSize:19,fontWeight:700}}>Facturar en {st.name}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Pasos en el portal</div></div></div>
        <div style={s.card}>{st.pasos.map((p,i)=>(
          <div key={i} style={{display:"flex",gap:11,paddingBottom:i<st.pasos.length-1?16:0}}>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:`${st.color}22`,border:`1px solid ${st.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>{i+1}</div>
              {i<st.pasos.length-1&&<div style={{width:1,flex:1,background:C.border,marginTop:5}}/>}
            </div>
            <div style={{paddingTop:3,paddingBottom:i<st.pasos.length-1?13:0,fontSize:14,lineHeight:1.5,color:"rgba(255,255,255,0.82)"}}>{p}</div>
          </div>
        ))}</div>
        <div style={s.card}><span style={s.lbl}>Campos requeridos</span><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{st.campos.map(c=><span key={c} style={{background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,padding:"5px 10px",borderRadius:7,fontSize:12}}>{c}</span>)}</div></div>
        <a href={st.portal} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none",display:"block"}}><button style={s.btn}>Abrir portal de {st.name} →</button></a>
        <div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,0.18)",marginTop:9}}>Los tickets vencen en 30 días naturales</div>
      </div>
    )
  }

  // ── SETTINGS VIEW ─────────────────────────────────────────────────────
  const saveApiKey = () => {
    localStorage.setItem("fr_api_key", apiKeyInput)
    setApiKey(apiKeyInput)
    setSavedOk(true); setTimeout(()=>setSavedOk(false),2000)
  }

  const SettingsView=()=>(
    <div>
      <div style={{fontSize:17,fontWeight:700,marginBottom:16}}>Configuración</div>

      <div style={s.card}>
        <span style={s.lbl}>API Key de Anthropic</span>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:8}}>
          Se guarda solo en este dispositivo. Consíguela en console.anthropic.com
        </div>
        <input
          style={{...s.input, fontFamily:"monospace", fontSize:12}}
          type="password"
          placeholder="sk-ant-..."
          value={apiKeyInput}
          onChange={e=>setApiKeyInput(e.target.value)}
        />
        {apiKey && <div style={{fontSize:11,color:"#34d399",marginTop:6}}>✓ API key configurada</div>}
        <button style={{...s.btn, marginTop:10, fontSize:13, padding:"10px"}} onClick={saveApiKey}>
          Guardar API key
        </button>
      </div>

      <div style={s.card}>
        <span style={s.lbl}>Meta por quincena</span>
        <div style={{display:"flex",gap:7,alignItems:"center"}}><span style={{color:C.muted,fontSize:17,flexShrink:0}}>$</span><input style={s.input} type="number" placeholder="ej. 3000" value={metaInput} onChange={e=>setMetaInput(e.target.value)}/></div>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.28)",marginTop:7}}>La app te avisa cuando alcanzas tu meta quincena.</div>
      </div>
      <div style={s.card}>
        <span style={s.lbl}>Datos fiscales</span>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <input style={s.input} placeholder="RFC" value={fiscal.rfc} onChange={e=>setFiscal(p=>({...p,rfc:e.target.value.toUpperCase()}))}/>
          <input style={s.input} placeholder="Razón social o nombre" value={fiscal.razonSocial} onChange={e=>setFiscal(p=>({...p,razonSocial:e.target.value}))}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <input style={s.input} placeholder="C.P. fiscal" value={fiscal.cp} onChange={e=>setFiscal(p=>({...p,cp:e.target.value}))}/>
            <input style={s.input} placeholder="Correo" value={fiscal.email} onChange={e=>setFiscal(p=>({...p,email:e.target.value}))}/>
          </div>
          <select style={s.input} value={fiscal.regimen} onChange={e=>setFiscal(p=>({...p,regimen:e.target.value}))}>
            <option value="">Régimen fiscal...</option>
            {["605 - Sueldos y Salarios","612 - Personas Físicas con Actividades Empresariales","616 - Sin obligaciones fiscales","621 - Incorporación Fiscal","626 - Régimen Simplificado de Confianza"].map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <select style={s.input} value={fiscal.usoCfdi} onChange={e=>setFiscal(p=>({...p,usoCfdi:e.target.value}))}>
            {["G03 - Gastos en general","D01 - Honorarios médicos","G01 - Adquisición de mercancías","I04 - Equipo de cómputo y accesorios","S01 - Sin efectos fiscales"].map(u=><option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <button style={s.btn} onClick={saveFiscal}>{savedOk?"✓ Guardado":"Guardar configuración"}</button>
    </div>
  )

  const Lightbox=()=>lightbox?<div onClick={()=>setLightbox(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.93)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:18}}><div style={{position:"relative"}}><img src={lightbox} alt="" style={{maxWidth:"100%",maxHeight:"87vh",borderRadius:11,objectFit:"contain"}}/><button onClick={()=>setLightbox(null)} style={{position:"absolute",top:-10,right:-10,width:30,height:30,borderRadius:"50%",background:"rgba(255,255,255,0.14)",border:"none",color:"#fff",fontSize:15,cursor:"pointer"}}>✕</button></div></div>:null

  return(
    <div style={s.wrap}>
      <div style={s.hdr}>
        <div style={s.logo}>🧾</div>
        <div><div style={{fontSize:14,fontWeight:700,letterSpacing:"-0.3px"}}>FacturaRápido</div><div style={{fontSize:10,color:C.muted,marginTop:1}}>Walmart · La Comer · Costco · Chedraui</div></div>
        {view==="main"&&<div style={{marginLeft:"auto",textAlign:"right"}}><div style={{fontSize:10,color:C.muted}}>Acumulado</div><div style={{fontSize:14,fontWeight:700,color:excedente>0?C.red:C.green}}>{fmt(totalQ)}</div></div>}
      </div>
      <div style={s.body}>
        {view==="main"&&<MainView/>}{view==="scan"&&<ScanView/>}{view==="result"&&<ResultView/>}{view==="guide"&&<GuideView/>}{view==="settings"&&<SettingsView/>}
      </div>
      <div style={s.nav}>
        {[{id:"main",ic:"📋",lb:"Quincena"},{id:"scan",ic:"📷",lb:"Escanear"},{id:"settings",ic:"⚙️",lb:"Config"}].map(n=>(
          <button key={n.id} style={s.navb(view===n.id)} onClick={()=>{if(n.id==="scan"){setImgPreview(null);setTicketData(null);setImgDataURL(null);setError(null)}setView(n.id)}}>
            <span style={{fontSize:19}}>{n.ic}</span>{n.lb}
          </button>
        ))}
      </div>
      {showQPick&&<QPicker/>}
      <Lightbox/>
    </div>
  )
}
