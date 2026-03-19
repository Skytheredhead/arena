import { useState, useEffect, useRef, useCallback } from "react"

/* ─────────────────────────────────────────────────────────────────
   MOCK DATA
───────────────────────────────────────────────────────────────── */
const RC = "XK-7734"
const VER = "v0.9.4-beta"
const PLAYERS = [
  {id:1,name:"VORTEX_9",   k:18,d:4, a:7, sc:2400,ping:12,  team:"A",you:true },
  {id:2,name:"nullptr",    k:14,d:8, a:3, sc:1820,ping:45,  team:"A",you:false},
  {id:3,name:"xGhost",     k:11,d:11,a:9, sc:1540,ping:28,  team:"B",you:false},
  {id:4,name:"STRIKER_77", k:9, d:13,a:4, sc:1180,ping:67,  team:"B",you:false},
  {id:5,name:"echo_void",  k:7, d:15,a:6, sc:960, ping:34,  team:"A",you:false},
  {id:6,name:"ph03n1x",    k:5, d:16,a:2, sc:720, ping:89,  team:"B",you:false},
  {id:7,name:"RAMPART",    k:3, d:17,a:1, sc:440, ping:124, team:"A",you:false},
  {id:8,name:"zenith_",    k:2, d:18,a:5, sc:340, ping:201, team:"B",you:false},
]
const KFEED_STATIC = [
  {id:1,killer:"VORTEX_9",  victim:"STRIKER_77",wpn:"PULSE RIFLE",hs:true },
  {id:2,killer:"nullptr",   victim:"ph03n1x",   wpn:"SCATTER GUN",hs:false},
  {id:3,killer:"xGhost",    victim:"RAMPART",   wpn:"VOID BLADE", hs:false},
  {id:4,killer:"VORTEX_9",  victim:"zenith_",   wpn:"PULSE RIFLE",hs:true },
]
const LP = [
  {id:1,name:"VORTEX_9",  ready:true, host:true, ping:12,  you:true },
  {id:2,name:"nullptr",   ready:true, host:false,ping:45,  you:false},
  {id:3,name:"xGhost",    ready:false,host:false,ping:28,  you:false},
  {id:4,name:"STRIKER_77",ready:true, host:false,ping:67,  you:false},
  {id:5,name:"echo_void", ready:false,host:false,ping:34,  you:false},
  {id:6,name:"[open]",    ready:false,host:false,ping:null, you:false},
]

/* ─────────────────────────────────────────────────────────────────
   THEME — NEON CYBER
───────────────────────────────────────────────────────────────── */
const C = {
  bg:     "#020b14",
  bg2:    "#040f1c",
  panel:  "rgba(0,245,255,0.04)",
  panelHover: "rgba(0,245,255,0.08)",
  border: "rgba(0,245,255,0.22)",
  borderHi: "#00f5ff",
  a:      "#00f5ff",
  a2:     "#ff0090",
  a3:     "#7000ff",
  warn:   "#ffcc00",
  danger: "#ff2244",
  ok:     "#00ff88",
  text:   "#7ab8d0",
  textBright: "#d0f4ff",
  textDim: "#1e4860",
  font:   "'Courier New', Courier, monospace",
}

/* ─────────────────────────────────────────────────────────────────
   GLOBAL STYLES + KEYFRAMES
───────────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --a:      ${C.a};
    --a2:     ${C.a2};
    --a3:     ${C.a3};
    --ok:     ${C.ok};
    --warn:   ${C.warn};
    --danger: ${C.danger};
    --bg:     ${C.bg};
    --panel:  ${C.panel};
    --border: ${C.border};
    --borderHi: ${C.borderHi};
    --text:   ${C.text};
    --textBright: ${C.textBright};
    --textDim: ${C.textDim};
    --font:   ${C.font};
    --fontDisplay: 'Orbitron', ${C.font};
  }

  body { background: var(--bg); color: var(--text); font-family: var(--font); overflow-x: hidden; }

  /* ── SCROLLBAR ── */
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--a)55; border-radius: 2px; }

  /* ── KEYFRAMES ── */
  @keyframes scanSweep {
    0%   { top: -4px; opacity: 0; }
    5%   { opacity: 0.6; }
    95%  { opacity: 0.6; }
    100% { top: 100%; opacity: 0; }
  }
  @keyframes gridScroll {
    from { transform: perspective(600px) rotateX(72deg) translateY(0); }
    to   { transform: perspective(600px) rotateX(72deg) translateY(60px); }
  }
  @keyframes particleDrift {
    0%   { transform: translateY(0px) translateX(0px); opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 1; }
    100% { transform: translateY(-120px) translateX(var(--dx,20px)); opacity: 0; }
  }
  @keyframes glitch1 {
    0%,94%  { clip-path: inset(0 0 100% 0); transform: translate(0); }
    95%     { clip-path: inset(30% 0 50% 0); transform: translate(-3px, 1px); }
    96%     { clip-path: inset(60% 0 20% 0); transform: translate(3px, -1px); }
    97%     { clip-path: inset(10% 0 80% 0); transform: translate(-2px, 2px); }
    100%    { clip-path: inset(0 0 100% 0); transform: translate(0); }
  }
  @keyframes glitch2 {
    0%,94%  { clip-path: inset(100% 0 0 0); transform: translate(0); opacity: 0; }
    95%     { clip-path: inset(50% 0 10% 0); transform: translate(3px, -1px); opacity: 0.8; color: var(--a2); }
    96%     { clip-path: inset(20% 0 60% 0); transform: translate(-3px, 1px); opacity: 0.8; }
    97%     { clip-path: inset(70% 0 5%  0); transform: translate(2px, -2px); opacity: 0.8; }
    100%    { clip-path: inset(100% 0 0 0); transform: translate(0); opacity: 0; }
  }
  @keyframes borderPulse {
    0%,100% { box-shadow: 0 0 0 0 transparent, inset 0 0 0 0 transparent; }
    50%     { box-shadow: 0 0 12px 1px var(--a)44, inset 0 0 8px 0 var(--a)11; }
  }
  @keyframes borderGlow {
    0%,100% { box-shadow: 0 0 6px var(--a)66; }
    50%     { box-shadow: 0 0 18px var(--a), 0 0 40px var(--a)44; }
  }
  @keyframes cornerDraw {
    from { width: 0; height: 0; opacity: 0; }
    to   { width: 12px; height: 12px; opacity: 1; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes slideRight {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes slideLeft {
    from { opacity: 0; transform: translateX(-24px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes blink {
    0%,49%  { opacity: 1; }
    50%,100%{ opacity: 0; }
  }
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50%     { opacity: 0.3; }
  }
  @keyframes radarSweep {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes fillBar {
    from { width: 0; }
  }
  @keyframes shake {
    0%,100% { transform: translate(0,0); }
    20%     { transform: translate(-4px, 2px); }
    40%     { transform: translate(4px, -2px); }
    60%     { transform: translate(-3px, 3px); }
    80%     { transform: translate(3px, -1px); }
  }
  @keyframes redFlash {
    0%,100% { background: radial-gradient(ellipse at center, transparent 30%, ${C.danger}00 100%); }
    50%     { background: radial-gradient(ellipse at center, transparent 10%, ${C.danger}66 100%); }
  }
  @keyframes numberTick {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }
  @keyframes typeIn {
    from { width: 0; }
    to   { width: 100%; }
  }
  @keyframes dataStream {
    0%   { transform: translateY(-100%); opacity: 0; }
    5%   { opacity: 0.6; }
    95%  { opacity: 0.6; }
    100% { transform: translateY(100vh); opacity: 0; }
  }
  @keyframes hoverFill {
    from { transform: scaleX(0); transform-origin: left; }
    to   { transform: scaleX(1); transform-origin: left; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes pingAlert {
    0%,100% { color: var(--ok); }
    50%     { color: var(--warn); text-shadow: 0 0 8px var(--warn); }
  }
  @keyframes vignettePulse {
    0%,100% { opacity: 0.3; }
    50%     { opacity: 0.7; }
  }
  @keyframes xpFill {
    from { width: 0%; }
    to   { width: 68%; }
  }
  @keyframes floatY {
    0%,100% { transform: translateY(0px); }
    50%     { transform: translateY(-6px); }
  }
  @keyframes progressCrawl {
    0%   { background-position: 0 0; }
    100% { background-position: 40px 0; }
  }
  @keyframes borderRace {
    0%   { clip-path: inset(0 100% 100% 0); }
    25%  { clip-path: inset(0 0    100% 0); }
    50%  { clip-path: inset(0 0    0    0); }
    75%  { clip-path: inset(0 0    0  100%); }
    100% { clip-path: inset(100% 0  0  0); }
  }
  @keyframes hexRotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── UTILITY CLASSES ── */
  .blink    { animation: blink 1s step-start infinite; }
  .pulse    { animation: pulse 2s ease-in-out infinite; }
  .fadeUp   { animation: fadeUp .4s cubic-bezier(.16,1,.3,1) both; }
  .fadeIn   { animation: fadeIn .3s ease both; }
  .slideR   { animation: slideRight .35s cubic-bezier(.16,1,.3,1) both; }
  .slideL   { animation: slideLeft  .35s cubic-bezier(.16,1,.3,1) both; }
  .scaleIn  { animation: scaleIn   .35s cubic-bezier(.16,1,.3,1) both; }
  .spin     { animation: spin 1.2s linear infinite; }

  /* ── CYBER BUTTON ── */
  .cbtn {
    font-family: var(--fontDisplay);
    cursor: pointer;
    border: 1px solid var(--a)88;
    background: transparent;
    color: var(--a);
    padding: 10px 24px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    position: relative;
    overflow: hidden;
    transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }
  .cbtn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--a);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.25s cubic-bezier(.16,1,.3,1);
    z-index: 0;
  }
  .cbtn:hover::before { transform: scaleX(1); }
  .cbtn:hover { color: #000; border-color: var(--a); box-shadow: 0 0 20px var(--a)88; }
  .cbtn:active { transform: scale(0.97); }
  .cbtn span { position: relative; z-index: 1; }

  .cbtn-primary { background: var(--a)22; border-color: var(--a); box-shadow: 0 0 10px var(--a)44; }
  .cbtn-danger  { border-color: var(--danger)88; color: var(--danger); }
  .cbtn-danger::before { background: var(--danger); }
  .cbtn-danger:hover { color: #fff; border-color: var(--danger); box-shadow: 0 0 20px var(--danger)88; }
  .cbtn-sm { padding: 6px 14px; font-size: 10px; }
  .cbtn-full { width: 100%; text-align: center; display: block; }

  /* ── CYBER INPUT ── */
  .cinput {
    font-family: var(--font);
    background: rgba(0,245,255,0.04);
    border: 1px solid var(--border);
    color: var(--textBright);
    padding: 10px 14px;
    font-size: 13px;
    letter-spacing: 1px;
    width: 100%;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
  }
  .cinput:focus {
    border-color: var(--a);
    background: rgba(0,245,255,0.08);
    box-shadow: 0 0 16px var(--a)44, inset 0 0 8px var(--a)11;
  }
  .cinput::placeholder { color: var(--textDim); }

  /* ── PANEL ── */
  .cpanel {
    background: var(--panel);
    border: 1px solid var(--border);
    position: relative;
    animation: borderPulse 4s ease-in-out infinite;
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  }
  .cpanel::before,
  .cpanel::after {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    border-color: var(--a);
    border-style: solid;
    animation: cornerDraw .4s cubic-bezier(.16,1,.3,1) both;
  }
  .cpanel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
  .cpanel::after  { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }

  /* ── LABEL ── */
  .clabel {
    font-family: var(--font);
    font-size: 9px;
    letter-spacing: 3px;
    text-transform: uppercase;
    color: var(--textDim);
    margin-bottom: 6px;
  }

  /* ── SCANLINE ── */
  .scanlines {
    position: fixed; inset: 0; pointer-events: none; z-index: 9999;
    background: repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px);
  }
  .scan-sweep {
    position: fixed; left: 0; right: 0; height: 3px; pointer-events: none; z-index: 9998;
    background: linear-gradient(90deg, transparent, var(--a)44, transparent);
    animation: scanSweep 6s linear infinite;
  }

  /* ── PING COLOR ── */
  .ping-ok   { color: var(--ok);     }
  .ping-warn { color: var(--warn);   }
  .ping-bad  { color: var(--danger); animation: pingAlert 1s ease infinite; }
`

/* ─────────────────────────────────────────────────────────────────
   ANIMATED COMPONENTS
───────────────────────────────────────────────────────────────── */

/* Hex grid background */
function HexBg(){
  return(
    <div style={{position:"absolute",inset:0,overflow:"hidden",zIndex:0,pointerEvents:"none"}}>
      {/* Moving grid */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,height:"60%",
        backgroundImage:`linear-gradient(${C.borderHi}18 1px,transparent 1px),linear-gradient(90deg,${C.borderHi}12 1px,transparent 1px)`,
        backgroundSize:"50px 50px",
        animation:"gridScroll 3s linear infinite",
        transform:"perspective(600px) rotateX(72deg)",
        transformOrigin:"bottom",opacity:0.5,
      }}/>
      {/* Radial glow top */}
      <div style={{
        position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
        width:"80%",height:"50%",
        background:`radial-gradient(ellipse at 50% 0%, ${C.a}0a 0%, transparent 70%)`,
      }}/>
      {/* Corner atmosphere */}
      <div style={{
        position:"absolute",top:0,left:0,width:"40%",height:"40%",
        background:`radial-gradient(ellipse at 0% 0%, ${C.a}08 0%, transparent 60%)`,
      }}/>
      <div style={{
        position:"absolute",bottom:0,right:0,width:"30%",height:"30%",
        background:`radial-gradient(ellipse at 100% 100%, ${C.a2}08 0%, transparent 60%)`,
      }}/>
      {/* Floating particles */}
      {Array.from({length:18},(_,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${5+i*5.2}%`,
          bottom:`${10+((i*37)%60)}%`,
          width:"2px",height:"2px",
          borderRadius:"50%",
          background:i%3===0?C.a:i%3===1?C.a2:C.a3,
          opacity:0,
          animationName:"particleDrift",
          animationDuration:`${4+i*0.7}s`,
          animationDelay:`${i*0.4}s`,
          animationTimingFunction:"linear",
          animationIterationCount:"infinite",
          "--dx":`${(i%5-2)*15}px`,
        }}/>
      ))}
      {/* Data streams — vertical lines */}
      {[8,23,41,57,72,88].map((l,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${l}%`,top:0,
          width:"1px",height:"120px",
          background:`linear-gradient(transparent, ${C.a}44, transparent)`,
          animationName:"dataStream",
          animationDuration:`${5+i*1.3}s`,
          animationDelay:`${i*0.8}s`,
          animationTimingFunction:"linear",
          animationIterationCount:"infinite",
          opacity:0,
        }}/>
      ))}
    </div>
  )
}

/* Glitch text */
function GlitchText({children, size=48, style={}}){
  return(
    <div style={{position:"relative",display:"inline-block",...style}}>
      <div style={{
        fontFamily:"'Orbitron',var(--font)",
        fontSize:`${size}px`,fontWeight:900,
        color:C.a,letterSpacing:`${size/24}px`,lineHeight:1,
        textShadow:`0 0 30px ${C.a}, 0 0 60px ${C.a}44`,
      }}>{children}</div>
      {/* Glitch layer 1 */}
      <div aria-hidden="true" style={{
        position:"absolute",inset:0,
        fontFamily:"'Orbitron',var(--font)",
        fontSize:`${size}px`,fontWeight:900,
        color:C.a2,letterSpacing:`${size/24}px`,lineHeight:1,
        animation:"glitch1 5s step-start infinite",
        textShadow:`2px 0 ${C.a2}`,
      }}>{children}</div>
      {/* Glitch layer 2 */}
      <div aria-hidden="true" style={{
        position:"absolute",inset:0,
        fontFamily:"'Orbitron',var(--font)",
        fontSize:`${size}px`,fontWeight:900,
        color:C.a3,letterSpacing:`${size/24}px`,lineHeight:1,
        animation:"glitch2 5s step-start infinite",
        textShadow:`-2px 0 ${C.a3}`,
      }}>{children}</div>
    </div>
  )
}

/* Counting number */
function AnimNumber({target, duration=1200, color=C.a, size=32, suffix="", style={}}){
  const [val,setVal]=useState(0)
  const mounted=useRef(false)
  useEffect(()=>{
    if(mounted.current) return
    mounted.current=true
    const start=Date.now()
    const tick=()=>{
      const p=Math.min(1,(Date.now()-start)/duration)
      const ease=1-Math.pow(1-p,3)
      setVal(Math.round(target*ease))
      if(p<1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  },[target,duration])
  return(
    <span style={{
      fontFamily:"'Orbitron',var(--font)",
      color,fontSize:`${size}px`,fontWeight:700,
      textShadow:`0 0 12px ${color}88`,...style
    }}>{val}{suffix}</span>
  )
}

/* Cyber button */
function CBtn({children,onClick,primary,danger,small,full,style={}}){
  return(
    <button
      className={`cbtn${primary?" cbtn-primary":""}${danger?" cbtn-danger":""}${small?" cbtn-sm":""}${full?" cbtn-full":""}`}
      onClick={onClick}
      style={style}
    ><span>{children}</span></button>
  )
}

/* Panel with animated corners */
function CPanel({children,style={},className="",delay=0}){
  return(
    <div className={`cpanel ${className}`} style={{
      animationDelay:`${delay}s`,...style
    }}>
      {children}
    </div>
  )
}

/* Separator line with moving dot */
function CLine({color=C.border,margin="14px 0"}){
  return(
    <div style={{position:"relative",margin,height:"1px",background:color,overflow:"hidden"}}>
      <div style={{
        position:"absolute",top:"-1px",left:"-10%",
        width:"20%",height:"3px",
        background:`linear-gradient(90deg, transparent, ${C.a}, transparent)`,
        animationName:"shimmer",
        animationDuration:"2.5s",
        animationTimingFunction:"linear",
        animationIterationCount:"infinite",
        backgroundSize:"200% 100%",
      }}/>
    </div>
  )
}

/* HP / resource bar */
function CBar({val,max=100,color=C.ok,delay=0,height=6}){
  const pct=(val/max)*100
  const segs=Math.ceil(max/25)
  return(
    <div style={{display:"flex",gap:"2px",height:`${height}px`}}>
      {Array.from({length:segs},(_,i)=>{
        const segFull=(i+1)*25<=val
        const segPart=i*25<val&&(i+1)*25>val
        const segPct=segPart?((val-i*25)/25)*100:segFull?100:0
        return(
          <div key={i} style={{flex:1,background:`${C.textDim}44`,position:"relative",overflow:"hidden"}}>
            <div style={{
              position:"absolute",inset:0,
              background:color,
              width:`${segPct}%`,
              animationName:"fillBar",
              animationDuration:".6s",
              animationTimingFunction:"cubic-bezier(.16,1,.3,1)",
              animationDelay:`${delay+i*0.08}s`,
              animationFillMode:"both",
              boxShadow:`0 0 6px ${color}`,
            }}/>
          </div>
        )
      })}
    </div>
  )
}

/* Mini radar sweep */
function RadarMap(){
  return(
    <div style={{position:"relative",width:130,height:130,overflow:"hidden",background:"rgba(0,10,15,0.9)",border:`1px solid ${C.border}`}}>
      {/* Grid */}
      <div style={{
        position:"absolute",inset:0,
        backgroundImage:`linear-gradient(${C.a}18 1px,transparent 1px),linear-gradient(90deg,${C.a}18 1px,transparent 1px)`,
        backgroundSize:"20px 20px",
      }}/>
      {/* Radar sweep */}
      <div style={{
        position:"absolute",top:"50%",left:"50%",
        width:"60px",height:"1px",
        transformOrigin:"0 50%",
        animation:"radarSweep 3s linear infinite",
        background:`linear-gradient(90deg, ${C.a}88, transparent)`,
      }}/>
      {/* Center dot (player) */}
      <div style={{
        position:"absolute",left:"50%",top:"45%",
        width:"8px",height:"8px",
        borderRadius:"50%",
        background:C.a,
        transform:"translate(-50%,-50%)",
        boxShadow:`0 0 8px ${C.a}`,
        animation:"pulse 1.5s ease-in-out infinite",
      }}/>
      {/* Enemy dots */}
      {[{x:28,y:22},{x:68,y:58},{x:44,y:72},{x:80,y:30}].map((p,i)=>(
        <div key={i} style={{
          position:"absolute",
          left:`${p.x}%`,top:`${p.y}%`,
          width:"5px",height:"5px",
          borderRadius:"50%",
          background:C.danger,
          transform:"translate(-50%,-50%)",
          boxShadow:`0 0 5px ${C.danger}`,
          animation:`pulse ${1.2+i*0.3}s ease-in-out infinite`,
          animationDelay:`${i*0.2}s`,
        }}/>
      ))}
      {/* Ring */}
      <div style={{position:"absolute",inset:"6px",borderRadius:"50%",border:`1px solid ${C.a}18`}}/>
      <div style={{position:"absolute",inset:"20px",borderRadius:"50%",border:`1px solid ${C.a}10`}}/>
      <div style={{position:"absolute",bottom:"4px",left:"6px",color:C.textDim,fontSize:"8px",fontFamily:C.font,letterSpacing:"1px"}}>NEXUS</div>
    </div>
  )
}

/* Kill feed item — slides in, fades after 4s */
function KFeedItem({k,delay=0}){
  const [gone,setGone]=useState(false)
  useEffect(()=>{
    const t=setTimeout(()=>setGone(true),4000+delay*800)
    return()=>clearTimeout(t)
  },[delay])
  if(gone) return null
  return(
    <div style={{
      background:"rgba(0,10,20,0.88)",
      border:`1px solid ${C.border}`,
      backdropFilter:"blur(8px)",
      padding:"5px 10px",
      display:"flex",gap:"8px",alignItems:"center",
      fontFamily:C.font,fontSize:"11px",
      animation:`slideRight .3s cubic-bezier(.16,1,.3,1) ${delay*0.15}s both`,
      transition:"opacity .5s ease",
      opacity:gone?0:1,
      clip_path:"polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))",
    }}>
      <span style={{color:C.a,fontWeight:"bold",textShadow:`0 0 8px ${C.a}88`}}>{k.killer}</span>
      <span style={{color:C.textDim,fontSize:"9px"}}>{k.wpn}</span>
      <span style={{color:"rgba(255,34,68,0.9)"}}>{k.victim}</span>
      {k.hs&&<span style={{color:C.warn,fontSize:"9px",animation:"pulse 2s infinite"}}>⬡</span>}
    </div>
  )
}

/* Crosshair */
function Crosshair(){
  return(
    <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",zIndex:20,pointerEvents:"none"}}>
      <div style={{position:"relative",width:"28px",height:"28px",animation:"floatY 3s ease-in-out infinite"}}>
        {/* Top */}
        <div style={{position:"absolute",left:"50%",top:0,width:"1px",height:"8px",background:C.a,transform:"translateX(-50%)",boxShadow:`0 0 4px ${C.a}`}}/>
        {/* Bottom */}
        <div style={{position:"absolute",left:"50%",bottom:0,width:"1px",height:"8px",background:C.a,transform:"translateX(-50%)",boxShadow:`0 0 4px ${C.a}`}}/>
        {/* Left */}
        <div style={{position:"absolute",top:"50%",left:0,height:"1px",width:"8px",background:C.a,transform:"translateY(-50%)",boxShadow:`0 0 4px ${C.a}`}}/>
        {/* Right */}
        <div style={{position:"absolute",top:"50%",right:0,height:"1px",width:"8px",background:C.a,transform:"translateY(-50%)",boxShadow:`0 0 4px ${C.a}`}}/>
        {/* Center dot */}
        <div style={{position:"absolute",left:"50%",top:"50%",width:"3px",height:"3px",background:C.a2,borderRadius:"50%",transform:"translate(-50%,-50%)",animation:"pulse 1.5s ease-in-out infinite",boxShadow:`0 0 6px ${C.a2}`}}/>
      </div>
    </div>
  )
}

/* Ping dot */
function PingDot({ping}){
  const col=!ping?C.textDim:ping<50?C.ok:ping<100?C.warn:C.danger
  const cls=!ping?"":ping<50?"ping-ok":ping<100?"ping-warn":"ping-bad"
  return <span className={cls} style={{fontSize:"11px",fontFamily:C.font}}>{ping?`${ping}ms`:"—"}</span>
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: MAIN MENU
───────────────────────────────────────────────────────────────── */
function MainMenu({go}){
  const [nick,setNick]=useState("VORTEX_9")
  const [code,setCode]=useState("")
  const [hover,setHover]=useState(-1)
  const menuItems=[
    {l:"▸ QUICK PLAY",  s:"loading"},
    {l:"  CREATE ROOM", s:"lobby"},
    {l:"  JOIN BY CODE",s:null},
    {l:"  SETTINGS",    s:"settings"},
    {l:"  SPECTATE",    s:"spec"},
  ]
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",position:"relative",overflow:"hidden",backgroundColor:C.bg}}>
      <HexBg/>

      {/* TOP BAR */}
      <div className="fadeIn" style={{
        position:"absolute",top:0,left:0,right:0,
        borderBottom:`1px solid ${C.border}`,
        background:"rgba(2,11,20,0.95)",backdropFilter:"blur(12px)",
        padding:"10px 32px",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        animation:"fadeUp .4s ease both",
      }}>
        <div style={{display:"flex",gap:"24px",fontFamily:C.font,fontSize:"10px",letterSpacing:"2px",color:C.textDim}}>
          {["EU-WEST","12ms","120fps"].map((s,i)=>(
            <span key={i} style={{animationName:"fadeIn",animationDuration:".4s",animationDelay:`${0.1+i*0.1}s`,animationFillMode:"both",animationTimingFunction:"ease"}}>{s}</span>
          ))}
        </div>
        <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"3px",fontFamily:C.font}}>{VER} <span className="blink">█</span></div>
      </div>

      {/* LOGO */}
      <div style={{position:"relative",zIndex:2,textAlign:"center",marginBottom:"60px",animation:"fadeUp .6s .1s cubic-bezier(.16,1,.3,1) both"}}>
        <GlitchText size={92}>ARENA</GlitchText>
        <div style={{
          color:C.textDim,fontSize:"10px",letterSpacing:"8px",marginTop:"14px",fontFamily:C.font,
          animation:"fadeUp .5s .4s ease both",
        }}>// BROWSER ARENA FPS // ROOM:{RC} //</div>
        {/* Hex decoration under logo */}
        <div style={{
          position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",
          width:"300px",height:"300px",
          border:`1px solid ${C.a}0a`,
          borderRadius:"50%",
          animation:"hexRotate 20s linear infinite",
          pointerEvents:"none",
        }}/>
      </div>

      {/* MENU LINKS */}
      <div style={{position:"relative",zIndex:2,width:"320px",marginBottom:"44px"}}>
        {menuItems.map((item,i)=>(
          <button key={i}
            onMouseEnter={()=>setHover(i)}
            onMouseLeave={()=>setHover(-1)}
            onClick={()=>item.s&&go(item.s)}
            style={{
              fontFamily:"'Orbitron',var(--font)",
              background:"transparent",border:"none",
              borderLeft:`2px solid ${hover===i?C.a:i===0?C.a:C.textDim}`,
              color:hover===i?C.textBright:i===0?C.a:C.text,
              padding:"14px 20px",fontSize:"12px",fontWeight:700,letterSpacing:"3px",
              textAlign:"left",cursor:"pointer",textTransform:"uppercase",
              width:"100%",display:"block",position:"relative",overflow:"hidden",
              transition:"color 0.2s, border-color 0.2s",
              animation:`slideLeft .35s ${0.2+i*0.07}s cubic-bezier(.16,1,.3,1) both`,
              textShadow:hover===i?`0 0 14px ${C.a}`:i===0?`0 0 10px ${C.a}88`:"none",
            }}
          >
            {/* hover fill bg */}
            <div style={{
              position:"absolute",inset:0,
              background:hover===i?`${C.a}08`:"transparent",
              transition:"background 0.2s",
            }}/>
            {/* scan line on hover */}
            {hover===i&&<div style={{
              position:"absolute",inset:0,
              backgroundImage:`linear-gradient(90deg,transparent,${C.a}12,transparent)`,
              animationName:"shimmer",
              animationDuration:"1s",
              animationTimingFunction:"linear",
              animationIterationCount:"infinite",
              backgroundSize:"200% 100%",
            }}/>}
            <span style={{position:"relative",zIndex:1}}>{item.l}</span>
            {i===0&&<span style={{position:"absolute",right:"16px",top:"50%",transform:"translateY(-50%)",color:C.ok,fontSize:"9px",letterSpacing:"2px",animation:"pulse 2s infinite"}}>ONLINE</span>}
          </button>
        ))}
      </div>

      {/* INPUT AREA */}
      <div style={{position:"relative",zIndex:2,width:"320px",display:"flex",flexDirection:"column",gap:"10px",animation:"fadeUp .5s .55s ease both"}}>
        <CPanel style={{padding:"20px",display:"flex",flexDirection:"column",gap:"10px"}}>
          <div className="clabel">operator callsign</div>
          <input className="cinput" value={nick} onChange={e=>setNick(e.target.value)} placeholder="CALLSIGN"/>
          <div className="clabel">room access code</div>
          <div style={{display:"flex",gap:"8px"}}>
            <input className="cinput" value={code} onChange={e=>setCode(e.target.value)} placeholder="XK-0000" style={{letterSpacing:"5px",textTransform:"uppercase"}}/>
            <CBtn onClick={()=>go("lobby")} primary><span>JOIN</span></CBtn>
          </div>
        </CPanel>
      </div>

      {/* Status strip */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,
        borderTop:`1px solid ${C.border}`,
        background:"rgba(2,11,20,0.95)",backdropFilter:"blur(8px)",
        padding:"8px 32px",
        display:"flex",justifyContent:"space-between",fontFamily:C.font,
        animation:"fadeUp .4s .7s ease both",
      }}>
        <div style={{display:"flex",gap:"32px"}}>
          {[{l:"PLAYERS ONLINE",v:"247"},{l:"ACTIVE ROOMS",v:"31"},{l:"YOUR RANK",v:"#1,840"}].map((s,i)=>(
            <div key={i} style={{animationDelay:`${0.8+i*0.1}s`}}>
              <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"2px"}}>{s.l}</div>
              <div style={{color:C.a,fontSize:"14px",fontWeight:"bold",textShadow:`0 0 8px ${C.a}88`}}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"2px",alignSelf:"center"}}>{RC}</div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: LOBBY
───────────────────────────────────────────────────────────────── */
function Lobby({go}){
  const [map,setMap]=useState(0)
  const [mode,setMode]=useState(0)
  const maps=["NEXUS CORE","ORBITAL BREACH","STATIC LABS","VOID STATION"]
  const modes=["TEAM DEATHMATCH","FREE FOR ALL","DOMINATION","ELIMINATION"]
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",backgroundColor:C.bg,position:"relative",overflow:"hidden"}}>
      <HexBg/>
      {/* Header */}
      <div style={{
        position:"relative",zIndex:10,
        borderBottom:`1px solid ${C.border}`,
        background:"rgba(2,11,20,0.95)",backdropFilter:"blur(12px)",
        padding:"12px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",
        animation:"fadeUp .3s ease both",
      }}>
        <div style={{display:"flex",gap:"20px",alignItems:"center"}}>
          <CBtn small onClick={()=>go("main")}><span>← BACK</span></CBtn>
          <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"12px",fontWeight:700,letterSpacing:"4px",textShadow:`0 0 12px ${C.a}88`}}>ROOM LOBBY</div>
        </div>
        {/* Room code — animated */}
        <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
          <div style={{fontFamily:C.font,color:C.textDim,fontSize:"9px",letterSpacing:"3px"}}>ROOM CODE</div>
          <div className="cpanel" style={{
            padding:"8px 24px",
            fontFamily:"'Orbitron',var(--font)",
            color:C.textBright,fontSize:"22px",fontWeight:700,letterSpacing:"8px",
            animation:"borderGlow 3s ease-in-out infinite",
          }}>
            <span style={{textShadow:`0 0 16px ${C.a}`}}>{RC}</span>
          </div>
          <CBtn small onClick={()=>{}}><span>📋 COPY</span></CBtn>
        </div>
      </div>

      <div style={{position:"relative",zIndex:5,flex:1,display:"grid",gridTemplateColumns:"1fr 280px",gap:"0"}}>
        {/* Players */}
        <div style={{padding:"28px",borderRight:`1px solid ${C.border}`}}>
          <div className="clabel" style={{marginBottom:"16px",animation:"fadeIn .4s .1s both"}}>// PLAYERS ({LP.filter(p=>p.name!=="[open]").length}/6) — READY TO LAUNCH</div>
          <div style={{display:"flex",flexDirection:"column",gap:"6px",marginBottom:"24px"}}>
            {LP.map((p,i)=>(
              <div key={p.id} style={{
                background:p.you?`${C.a}0a`:C.panel,
                border:`1px solid ${p.you?C.a:C.border}`,
                padding:"14px 18px",
                display:"flex",alignItems:"center",gap:"16px",
                fontFamily:C.font,
                animation:`slideLeft .35s ${0.1+i*0.06}s cubic-bezier(.16,1,.3,1) both`,
                clip_path:"polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))",
                boxShadow:p.you?`0 0 16px ${C.a}22`:"none",
                transition:"box-shadow 0.3s",
              }}>
                {/* Ready indicator */}
                <div style={{
                  width:"8px",height:"8px",borderRadius:"50%",flexShrink:0,
                  background:p.ready?C.ok:C.textDim,
                  boxShadow:p.ready?`0 0 6px ${C.ok}`:undefined,
                  animation:p.ready?"pulse 2s ease-in-out infinite":undefined,
                }}/>
                <div style={{flex:1,color:p.you?C.textBright:p.name==="[open]"?C.textDim:C.text,fontSize:"14px",fontWeight:p.you?"bold":"normal",letterSpacing:"1px",fontStyle:p.name==="[open]"?"italic":"normal"}}>{p.name}</div>
                {p.host&&<span style={{background:C.a,color:"#000",padding:"2px 8px",fontSize:"9px",fontWeight:"bold",letterSpacing:"2px"}}>HOST</span>}
                {p.you&&<span style={{color:C.textDim,fontSize:"9px",letterSpacing:"2px"}}>YOU</span>}
                {p.ready&&!p.host&&<span style={{color:C.ok,fontSize:"10px",letterSpacing:"2px",textShadow:`0 0 6px ${C.ok}`}}>READY</span>}
                {!p.ready&&p.name!=="[open]"&&<span style={{color:C.warn,fontSize:"10px",letterSpacing:"2px",animation:"pulse 2s infinite"}}>WAITING</span>}
                {p.ping&&<PingDot ping={p.ping}/>}
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:"10px",animation:"fadeUp .4s .5s ease both"}}>
            <CBtn primary onClick={()=>go("hud")} style={{flex:1}}><span>READY UP</span></CBtn>
            <CBtn onClick={()=>go("hud")} style={{flex:1}}><span>START MATCH</span></CBtn>
          </div>
        </div>
        {/* Config */}
        <div style={{padding:"24px",display:"flex",flexDirection:"column",gap:"20px"}}>
          <div style={{animation:"slideRight .35s .15s cubic-bezier(.16,1,.3,1) both"}}>
            <div className="clabel" style={{marginBottom:"10px"}}>// MAP VOTE</div>
            {maps.map((m,i)=>(
              <div key={i} onClick={()=>setMap(i)} style={{
                background:i===map?`${C.a}12`:C.panel,
                border:`1px solid ${i===map?C.a:C.border}`,
                padding:"10px 14px",marginBottom:"6px",cursor:"pointer",fontFamily:C.font,
                color:i===map?C.a:C.text,fontSize:"12px",letterSpacing:"2px",fontWeight:"bold",
                transition:"all 0.2s",
                boxShadow:i===map?`0 0 12px ${C.a}22`:undefined,
                clip_path:"polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))",
                textShadow:i===map?`0 0 8px ${C.a}88`:undefined,
              }}>{m}</div>
            ))}
          </div>
          <div style={{animation:"slideRight .35s .25s cubic-bezier(.16,1,.3,1) both"}}>
            <div className="clabel" style={{marginBottom:"10px"}}>// GAME MODE</div>
            {modes.map((m,i)=>(
              <div key={i} onClick={()=>setMode(i)} style={{
                background:i===mode?`${C.a}12`:C.panel,
                border:`1px solid ${i===mode?C.a:C.border}`,
                padding:"10px 14px",marginBottom:"6px",cursor:"pointer",fontFamily:C.font,
                color:i===mode?C.a:C.text,fontSize:"12px",letterSpacing:"1px",
                transition:"all 0.2s",
                boxShadow:i===mode?`0 0 12px ${C.a}22`:undefined,
              }}>{m}</div>
            ))}
          </div>
          <CLine/>
          <div style={{fontFamily:C.font,animation:"fadeIn .4s .4s both"}}>
            {[{l:"REGION",v:"EU-WEST"},{l:"PING",v:"12ms"},{l:"MAX PLAYERS",v:"8"},{l:"VERSION",v:VER}].map(row=>(
              <div key={row.l} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`,fontSize:"11px"}}>
                <span style={{color:C.textDim}}>{row.l}</span>
                <span style={{color:C.a,textShadow:`0 0 6px ${C.a}66`}}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: HUD
───────────────────────────────────────────────────────────────── */
function HUD({go}){
  const [kfeed,setKfeed]=useState(KFEED_STATIC)
  const teamA=PLAYERS.filter(p=>p.team==="A").reduce((s,p)=>s+p.k,0)
  const teamB=PLAYERS.filter(p=>p.team==="B").reduce((s,p)=>s+p.k,0)
  const [ammo,setAmmo]=useState(24)
  const [tick,setTick]=useState(false)

  useEffect(()=>{
    const iv=setInterval(()=>setTick(t=>!t),1000)
    return()=>clearInterval(iv)
  },[])

  return(
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden",backgroundColor:C.bg}}>
      <HexBg/>

      {/* Vignette */}
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at center,transparent 40%,${C.bg}cc 100%)`,pointerEvents:"none",zIndex:2}}/>

      <Crosshair/>

      {/* ── TOP CENTER: timer + score ── */}
      <div style={{position:"absolute",top:"14px",left:"50%",transform:"translateX(-50%)",zIndex:10,animation:"fadeUp .4s ease both"}}>
        <CPanel style={{padding:"8px 28px",display:"flex",gap:"28px",alignItems:"center",backdropFilter:"blur(12px)"}}>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.a2,fontFamily:"'Orbitron',var(--font)",fontSize:"20px",fontWeight:700,textShadow:`0 0 12px ${C.a2}`}}>{teamA}</div>
            <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font}}>TEAM A</div>
          </div>
          {/* Timer */}
          <div style={{
            fontFamily:"'Orbitron',var(--font)",fontSize:"28px",fontWeight:700,
            color:C.a,letterSpacing:"4px",
            textShadow:`0 0 20px ${C.a}, 0 0 40px ${C.a}44`,
            animation:tick?"numberTick .15s ease both":undefined,
          }}>08:34</div>
          <div style={{textAlign:"center"}}>
            <div style={{color:C.a,fontFamily:"'Orbitron',var(--font)",fontSize:"20px",fontWeight:700,textShadow:`0 0 12px ${C.a}`}}>{teamB}</div>
            <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font}}>TEAM B</div>
          </div>
        </CPanel>
      </div>

      {/* ── TOP LEFT: minimap ── */}
      <div style={{position:"absolute",top:"14px",left:"14px",zIndex:10,animation:"slideLeft .4s .1s ease both"}}>
        <RadarMap/>
      </div>

      {/* ── TOP RIGHT: kill feed ── */}
      <div style={{position:"absolute",top:"14px",right:"14px",zIndex:10,display:"flex",flexDirection:"column",gap:"5px",maxWidth:"300px"}}>
        {kfeed.map((k,i)=><KFeedItem key={k.id} k={k} delay={i}/>)}
      </div>

      {/* ── BOTTOM LEFT: HP + Shield ── */}
      <div style={{position:"absolute",bottom:"80px",left:"24px",zIndex:10,animation:"slideLeft .4s .2s ease both"}}>
        <CPanel style={{padding:"16px 20px",backdropFilter:"blur(12px)"}}>
          {/* HP */}
          <div style={{marginBottom:"12px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px",alignItems:"baseline"}}>
              <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"3px",fontFamily:C.font}}>HP</div>
              <div style={{fontFamily:"'Orbitron',var(--font)",color:C.ok,fontSize:"28px",fontWeight:700,textShadow:`0 0 12px ${C.ok}88`,lineHeight:1}}>87</div>
            </div>
            <CBar val={87} max={100} color={C.ok} delay={0}/>
          </div>
          <CLine margin="8px 0"/>
          {/* Shield */}
          <div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px",alignItems:"baseline"}}>
              <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"3px",fontFamily:C.font}}>SHIELD</div>
              <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a2,fontSize:"28px",fontWeight:700,textShadow:`0 0 12px ${C.a2}88`,lineHeight:1}}>50</div>
            </div>
            <CBar val={50} max={100} color={C.a2} delay={0.2}/>
          </div>
        </CPanel>
      </div>

      {/* ── BOTTOM CENTER: ability bar ── */}
      <div style={{position:"absolute",bottom:"80px",left:"50%",transform:"translateX(-50%)",zIndex:10,animation:"fadeUp .4s .3s ease both"}}>
        <div style={{display:"flex",gap:"6px"}}>
          {[
            {k:"Q",cd:"2s",    rdy:false,col:C.textDim},
            {k:"E",cd:"READY", rdy:true, col:C.a},
            {k:"F",cd:"6s",    rdy:false,col:C.textDim},
            {k:"X",cd:"READY", rdy:true, col:C.a3},
          ].map(ab=>(
            <div key={ab.k} style={{
              background:ab.rdy?`${ab.col}18`:C.panel,
              border:`1px solid ${ab.rdy?ab.col:C.border}`,
              width:"52px",height:"52px",
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
              fontFamily:"'Orbitron',var(--font)",fontSize:"14px",fontWeight:700,color:ab.col,
              boxShadow:ab.rdy?`0 0 14px ${ab.col}55`:undefined,
              animation:ab.rdy?"borderPulse 3s infinite":undefined,
              position:"relative",overflow:"hidden",
              clip_path:"polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))",
            }}>
              {ab.rdy&&<div style={{
                position:"absolute",inset:0,
                backgroundImage:`linear-gradient(90deg,transparent,${ab.col}12,transparent)`,
                animationName:"shimmer",animationDuration:"2s",animationTimingFunction:"linear",animationIterationCount:"infinite",backgroundSize:"200% 100%",
              }}/>}
              <span style={{position:"relative",zIndex:1}}>{ab.k}</span>
              <div style={{fontSize:"7px",color:ab.rdy?ab.col:C.textDim,letterSpacing:"1px",position:"relative",zIndex:1}}>{ab.cd}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── BOTTOM RIGHT: weapon + ammo ── */}
      <div style={{position:"absolute",bottom:"80px",right:"24px",zIndex:10,textAlign:"right",animation:"slideRight .4s .2s ease both"}}>
        <CPanel style={{padding:"16px 20px",backdropFilter:"blur(12px)"}}>
          <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"3px",fontFamily:C.font,marginBottom:"6px",textAlign:"right"}}>PULSE RIFLE</div>
          <div style={{display:"flex",alignItems:"baseline",gap:"6px",justifyContent:"flex-end"}}>
            <div style={{
              fontFamily:"'Orbitron',var(--font)",fontSize:"56px",fontWeight:900,
              color:C.textBright,lineHeight:1,
              textShadow:`0 0 20px ${C.a}44`,
              animation:tick?"numberTick .12s ease both":undefined,
            }}>{ammo}</div>
            <div style={{fontFamily:C.font,color:C.textDim,fontSize:"22px",lineHeight:1}}>/120</div>
          </div>
          {/* Ammo pips */}
          <div style={{display:"flex",gap:"2px",justifyContent:"flex-end",marginTop:"8px",flexWrap:"wrap",maxWidth:"120px",marginLeft:"auto"}}>
            {Array.from({length:30},(_,i)=>(
              <div key={i} style={{
                width:"5px",height:"10px",
                background:i<ammo?C.a:`${C.textDim}33`,
                boxShadow:i<ammo?`0 0 3px ${C.a}88`:undefined,
                transition:"background 0.2s, box-shadow 0.2s",
              }}/>
            ))}
          </div>
        </CPanel>
      </div>

      {/* ── BOTTOM MICRO BAR ── */}
      <div style={{
        position:"absolute",bottom:0,left:0,right:0,zIndex:10,
        background:"rgba(2,11,20,0.85)",backdropFilter:"blur(8px)",
        borderTop:`1px solid ${C.border}`,
        padding:"8px 24px",
        display:"flex",justifyContent:"space-between",fontFamily:C.font,fontSize:"9px",color:C.textDim,letterSpacing:"2px",
        animation:"fadeUp .3s ease both",
      }}>
        <span>VORTEX_9</span>
        <div style={{display:"flex",gap:"24px"}}>
          <span style={{color:C.ok}}>12ms</span>
          <span>120fps</span>
          <span>{RC}</span>
          <span>NEXUS CORE</span>
          <span>TDM</span>
        </div>
        <span className="blink">█</span>
      </div>

      {/* ESC hint */}
      <button onClick={()=>go("pause")} style={{
        position:"absolute",top:"14px",left:"50%",marginLeft:"200px",zIndex:10,
        fontFamily:C.font,background:C.panel,border:`1px solid ${C.border}`,
        color:C.textDim,padding:"6px 12px",fontSize:"9px",letterSpacing:"2px",cursor:"pointer",
        transition:"all 0.2s",
      }}>ESC</button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: SCOREBOARD
───────────────────────────────────────────────────────────────── */
function Scoreboard({go}){
  const teamA=PLAYERS.filter(p=>p.team==="A")
  const teamB=PLAYERS.filter(p=>p.team==="B")
  const tAScore=teamA.reduce((s,p)=>s+p.k,0)
  const tBScore=teamB.reduce((s,p)=>s+p.k,0)

  const Row=({p,rank,delay=0})=>(
    <div style={{
      display:"flex",alignItems:"center",
      borderBottom:`1px solid ${C.border}`,
      background:p.you?`${C.a}0a`:"transparent",
      animation:`slideLeft .35s ${delay}s cubic-bezier(.16,1,.3,1) both`,
      transition:"background 0.2s",
      boxShadow:p.you?`inset 3px 0 0 ${C.a}`:undefined,
    }}>
      <div style={{width:"40px",padding:"13px 8px",color:C.textDim,fontSize:"12px",textAlign:"center",fontFamily:C.font}}>{rank}</div>
      <div style={{flex:1,padding:"13px 8px",color:p.you?C.textBright:C.text,fontWeight:p.you?"bold":"normal",fontSize:"13px",letterSpacing:"1px",fontFamily:C.font}}>
        {p.name}
        {p.you&&<span style={{color:C.a,fontSize:"9px",marginLeft:"8px",letterSpacing:"2px",animation:"pulse 2s infinite"}}>◀ YOU</span>}
      </div>
      {[{v:p.k,c:C.ok},{v:p.d,c:C.danger},{v:p.a,c:C.warn}].map((cell,i)=>(
        <div key={i} style={{width:"64px",textAlign:"center",padding:"13px 8px",fontFamily:"'Orbitron',var(--font)",color:cell.c,fontWeight:700,fontSize:"15px",textShadow:`0 0 8px ${cell.c}66`}}>{cell.v}</div>
      ))}
      <div style={{width:"88px",textAlign:"center",padding:"13px 8px",fontFamily:"'Orbitron',var(--font)",color:C.a,fontWeight:700,fontSize:"15px",textShadow:`0 0 8px ${C.a}88`}}>{p.sc}</div>
      <div style={{width:"64px",textAlign:"center",padding:"13px 8px"}}><PingDot ping={p.ping}/></div>
    </div>
  )
  return(
    <div style={{minHeight:"100vh",backgroundColor:C.bg,display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
      <HexBg/>
      <div style={{position:"relative",zIndex:5,flex:1,display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{
          background:"rgba(2,11,20,0.95)",backdropFilter:"blur(12px)",
          borderBottom:`1px solid ${C.border}`,
          padding:"16px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp .3s ease both",
        }}>
          <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"14px",fontWeight:700,letterSpacing:"5px",textShadow:`0 0 12px ${C.a}88`}}>SCOREBOARD</div>
          {/* Live score */}
          <div style={{display:"flex",gap:"36px",alignItems:"center"}}>
            <div style={{textAlign:"center"}}>
              <AnimNumber target={tAScore} color={C.a2} size={28}/>
              <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"4px",fontFamily:C.font,marginTop:"2px"}}>TEAM A</div>
            </div>
            <div style={{color:C.textDim,fontFamily:C.font,fontSize:"18px"}}>:</div>
            <div style={{textAlign:"center"}}>
              <AnimNumber target={tBScore} color={C.a} size={28}/>
              <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"4px",fontFamily:C.font,marginTop:"2px"}}>TEAM B</div>
            </div>
            <div style={{color:C.textDim,fontSize:"12px",fontFamily:C.font,marginLeft:"12px",letterSpacing:"2px"}}>08:34 LEFT</div>
          </div>
          <CBtn small onClick={()=>go("hud")}><span>BACK TO GAME</span></CBtn>
        </div>

        {/* Col headers */}
        <div style={{
          display:"flex",borderBottom:`1px solid ${C.a}44`,
          padding:"0",background:"rgba(0,245,255,0.03)",
          animation:"fadeIn .3s .1s both",
        }}>
          {[{w:40,l:"#",c:C.textDim},{w:0,l:"PLAYER",c:C.textDim,flex:true},{w:64,l:"K",c:C.ok},{w:64,l:"D",c:C.danger},{w:64,l:"A",c:C.warn},{w:88,l:"SCORE",c:C.a},{w:64,l:"PING",c:C.textDim}].map((h,i)=>(
            <div key={i} style={{
              ...(h.flex?{flex:1,paddingLeft:"8px"}:{width:`${h.w}px`,textAlign:"center"}),
              padding:"10px 8px",color:h.c,fontSize:"9px",letterSpacing:"3px",
              fontFamily:C.font,textTransform:"uppercase",
            }}>{h.l}</div>
          ))}
        </div>

        {/* Teams */}
        <div style={{flex:1,padding:"0 0 24px 0",overflow:"auto"}}>
          <div style={{padding:"8px 8px 4px",fontFamily:C.font,color:C.a2,fontSize:"9px",letterSpacing:"4px",animation:"fadeIn .3s .15s both"}}>— TEAM A</div>
          {teamA.map((p,i)=><Row key={p.id} p={p} rank={i+1} delay={0.1+i*0.05}/>)}
          <div style={{padding:"12px 8px 4px",fontFamily:C.font,color:C.a,fontSize:"9px",letterSpacing:"4px",animation:"fadeIn .3s .35s both"}}>— TEAM B</div>
          {teamB.map((p,i)=><Row key={p.id} p={p} rank={i+1} delay={0.35+i*0.05}/>)}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: PAUSE
───────────────────────────────────────────────────────────────── */
function PauseMenu({go}){
  const items=[
    {l:"RESUME",s:"hud",primary:true},
    {l:"SETTINGS",s:"settings"},
    {l:"CONTROLS",s:"settings"},
    {l:"SCOREBOARD",s:"score"},
    {l:"RETURN TO LOBBY",s:"lobby"},
    {l:"REPORT PLAYER",s:null},
    {l:"LEAVE MATCH",s:"main",danger:true},
  ]
  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",backgroundColor:C.bg,overflow:"hidden"}}>
      <HexBg/>
      {/* Dark overlay */}
      <div style={{position:"absolute",inset:0,background:"rgba(2,11,20,0.75)",backdropFilter:"blur(4px)",zIndex:1,animation:"fadeIn .3s ease both"}}/>

      <div style={{position:"relative",zIndex:2,width:"360px",animation:"scaleIn .35s cubic-bezier(.16,1,.3,1) both"}}>
        <CPanel style={{padding:"44px 48px",boxShadow:`0 0 60px ${C.a}22`}}>
          <div style={{textAlign:"center",marginBottom:"32px"}}>
            <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"5px",fontFamily:C.font,marginBottom:"10px",animation:"blink 2s step-start infinite"}}>// PAUSED //</div>
            <GlitchText size={44}>ARENA</GlitchText>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {items.map((item,i)=>(
              <CBtn key={i} primary={item.primary} danger={item.danger} full
                onClick={()=>go(item.s||"pause")}
                style={{
                  animation:`fadeUp .3s ${0.05+i*0.04}s cubic-bezier(.16,1,.3,1) both`,
                }}
              ><span>{item.l}</span></CBtn>
            ))}
          </div>
          <CLine margin="20px 0"/>
          <div style={{textAlign:"center",fontFamily:C.font,color:C.textDim,fontSize:"9px",letterSpacing:"3px",animation:"fadeIn .4s .4s both"}}>
            {RC} · EU-WEST · <span style={{color:C.ok}}>12ms</span>
          </div>
        </CPanel>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: SETTINGS
───────────────────────────────────────────────────────────────── */
function Settings({go}){
  const [tab,setTab]=useState("video")
  const tabs=["video","audio","controls","gameplay","accessibility"]

  const CSlider=({label,val=70,color=C.a})=>(
    <div style={{marginBottom:"20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
        <div className="clabel">{label}</div>
        <span style={{color,fontSize:"11px",fontFamily:"'Orbitron',var(--font)",textShadow:`0 0 6px ${color}88`}}>{val}</span>
      </div>
      <div style={{height:"3px",background:`${C.textDim}33`,position:"relative"}}>
        {/* Filled part */}
        <div style={{
          position:"absolute",left:0,top:0,height:"100%",width:`${val}%`,
          background:`linear-gradient(90deg,${C.a3},${color})`,
          boxShadow:`0 0 8px ${color}`,
          animationName:"fillBar",animationDuration:".8s",animationTimingFunction:"cubic-bezier(.16,1,.3,1)",animationFillMode:"both",
        }}/>
        {/* Handle */}
        <div style={{
          position:"absolute",top:"50%",left:`${val}%`,
          width:"12px",height:"12px",
          background:color,borderRadius:"50%",
          transform:"translate(-50%,-50%)",
          boxShadow:`0 0 10px ${color}`,
          animation:"borderGlow 2s infinite",
        }}/>
      </div>
    </div>
  )
  const CToggle=({label,on=true})=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:`1px solid ${C.border}`}}>
      <span style={{fontFamily:C.font,fontSize:"12px",color:C.text,letterSpacing:"1px",textTransform:"uppercase"}}>{label}</span>
      <div style={{
        width:"44px",height:"22px",borderRadius:"11px",
        background:on?`${C.a}33`:"transparent",
        border:`1px solid ${on?C.a:C.border}`,
        position:"relative",cursor:"pointer",
        boxShadow:on?`0 0 10px ${C.a}44`:undefined,
        transition:"all 0.3s",
      }}>
        <div style={{
          position:"absolute",top:"3px",left:on?"24px":"3px",
          width:"16px",height:"16px",borderRadius:"50%",
          background:on?C.a:C.textDim,
          boxShadow:on?`0 0 8px ${C.a}`:undefined,
          transition:"left 0.2s cubic-bezier(.16,1,.3,1)",
        }}/>
      </div>
    </div>
  )

  return(
    <div style={{minHeight:"100vh",backgroundColor:C.bg,display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
      <HexBg/>
      <div style={{position:"relative",zIndex:5,flex:1,display:"flex",flexDirection:"column"}}>
        <div style={{
          background:"rgba(2,11,20,0.95)",backdropFilter:"blur(12px)",
          borderBottom:`1px solid ${C.border}`,
          padding:"14px 28px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp .3s ease both",
        }}>
          <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"13px",fontWeight:700,letterSpacing:"5px",textShadow:`0 0 12px ${C.a}88`}}>SYSTEM CONFIG</div>
          <CBtn small onClick={()=>go("main")}><span>← BACK</span></CBtn>
        </div>

        <div style={{flex:1,display:"flex"}}>
          {/* Sidebar */}
          <div style={{width:"200px",background:"rgba(2,11,20,0.6)",borderRight:`1px solid ${C.border}`,padding:"20px 0"}}>
            {tabs.map((tab2,i)=>(
              <button key={tab2} onClick={()=>setTab(tab2)} style={{
                fontFamily:"'Orbitron',var(--font)",background:tab===tab2?`${C.a}12`:"transparent",
                border:"none",borderLeft:`3px solid ${tab===tab2?C.a:C.border}`,
                color:tab===tab2?C.a:C.text,padding:"14px 20px",
                fontSize:"11px",fontWeight:700,letterSpacing:"2px",
                textAlign:"left",cursor:"pointer",textTransform:"uppercase",
                width:"100%",transition:"all 0.2s",
                textShadow:tab===tab2?`0 0 8px ${C.a}88`:undefined,
                boxShadow:tab===tab2?`inset 0 0 20px ${C.a}08`:undefined,
                animation:`slideLeft .3s ${0.05+i*0.04}s ease both`,
              }}>{tab2}</button>
            ))}
            {/* Version info */}
            <div style={{padding:"24px 20px 0",fontFamily:C.font,color:C.textDim,fontSize:"9px",letterSpacing:"2px",lineHeight:"1.8"}}>
              {VER}<br/>EU-WEST<br/><span style={{color:C.ok}}>12ms</span>
            </div>
          </div>

          {/* Content */}
          <div style={{flex:1,padding:"32px 44px",maxWidth:"600px",overflow:"auto"}}>
            {tab==="video"&&<div style={{animation:"fadeUp .3s ease both"}}>
              <div className="clabel" style={{marginBottom:"24px",fontSize:"10px",letterSpacing:"4px"}}>// VIDEO CONFIGURATION</div>
              <CSlider label="Resolution Scale" val={100}/>
              <CSlider label="Render Quality" val={80}/>
              <CSlider label="Field of View" val={90} color={C.a2}/>
              <CSlider label="UI Scale" val={100}/>
              <CLine/>
              <CToggle label="Fullscreen" on={true}/>
              <CToggle label="V-Sync" on={false}/>
              <CToggle label="Motion Blur" on={false}/>
              <CToggle label="Antialiasing" on={true}/>
            </div>}
            {tab==="audio"&&<div style={{animation:"fadeUp .3s ease both"}}>
              <div className="clabel" style={{marginBottom:"24px",fontSize:"10px",letterSpacing:"4px"}}>// AUDIO CONFIGURATION</div>
              <CSlider label="Master Volume" val={80}/>
              <CSlider label="SFX Volume" val={70}/>
              <CSlider label="Music Volume" val={40} color={C.a3}/>
              <CSlider label="Voice Chat Volume" val={90}/>
              <CLine/>
              <CToggle label="Spatial Audio" on={true}/>
              <CToggle label="Hit Sounds" on={true}/>
              <CToggle label="Footstep Emphasis" on={true}/>
            </div>}
            {tab==="controls"&&<div style={{animation:"fadeUp .3s ease both"}}>
              <div className="clabel" style={{marginBottom:"24px",fontSize:"10px",letterSpacing:"4px"}}>// CONTROL BINDINGS</div>
              <CSlider label="Mouse Sensitivity" val={35}/>
              <CSlider label="ADS Sensitivity" val={60} color={C.a2}/>
              <CLine/>
              {[["Move Forward","W"],["Move Back","S"],["Strafe Left","A"],["Strafe Right","D"],["Jump","Space"],["Crouch","Ctrl"],["Ability 1","Q"],["Ability 2","E"],["Interact","F"],["Scoreboard","Tab"],["Pause","Esc"]].map(([action,key],i)=>(
                <div key={action} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`,fontFamily:C.font,fontSize:"12px",animation:`fadeIn .3s ${i*0.03}s both`}}>
                  <span style={{color:C.text,letterSpacing:"1px",textTransform:"uppercase"}}>{action}</span>
                  <div style={{
                    background:`${C.a}12`,border:`1px solid ${C.a}`,
                    padding:"4px 14px",color:C.a,fontSize:"11px",fontWeight:"bold",letterSpacing:"2px",
                    fontFamily:"'Orbitron',var(--font)",
                    boxShadow:`0 0 8px ${C.a}33`,
                    clip_path:"polygon(0 0,calc(100% - 4px) 0,100% 4px,100% 100%,4px 100%,0 calc(100% - 4px))",
                  }}>{key}</div>
                </div>
              ))}
            </div>}
            {tab==="gameplay"&&<div style={{animation:"fadeUp .3s ease both"}}>
              <div className="clabel" style={{marginBottom:"24px",fontSize:"10px",letterSpacing:"4px"}}>// GAMEPLAY OPTIONS</div>
              <CToggle label="Show Damage Numbers" on={true}/>
              <CToggle label="Hitmarkers" on={true}/>
              <CToggle label="Dynamic Crosshair" on={false}/>
              <CToggle label="Kill Notifications" on={true}/>
              <CToggle label="Auto-Reload" on={true}/>
              <CLine/>
              <div className="clabel" style={{marginBottom:"10px"}}>Crosshair Style</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"20px"}}>
                {["DOT","CROSS","CIRCLE","T-SHAPE","CUSTOM"].map((s,i)=>(
                  <div key={s} style={{
                    background:i===1?`${C.a}18`:C.panel,
                    border:`1px solid ${i===1?C.a:C.border}`,
                    padding:"8px 16px",cursor:"pointer",fontFamily:C.font,
                    color:i===1?C.a:C.text,fontSize:"11px",letterSpacing:"1px",
                    textTransform:"uppercase",transition:"all 0.2s",
                    boxShadow:i===1?`0 0 10px ${C.a}33`:undefined,
                    textShadow:i===1?`0 0 6px ${C.a}88`:undefined,
                  }}>{s}</div>
                ))}
              </div>
            </div>}
            {tab==="accessibility"&&<div style={{animation:"fadeUp .3s ease both"}}>
              <div className="clabel" style={{marginBottom:"24px",fontSize:"10px",letterSpacing:"4px"}}>// ACCESSIBILITY</div>
              <CToggle label="High Contrast Mode" on={false}/>
              <CToggle label="Colorblind Assist" on={false}/>
              <CToggle label="Screen Reader" on={false}/>
              <CToggle label="Reduce Motion" on={false}/>
              <CToggle label="Large Text" on={false}/>
              <CLine/>
              <div className="clabel" style={{marginBottom:"10px"}}>Colorblind Mode</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                {["None","Deuteranopia","Protanopia","Tritanopia"].map((s,i)=>(
                  <div key={s} style={{
                    background:i===0?`${C.a}18`:C.panel,
                    border:`1px solid ${i===0?C.a:C.border}`,
                    padding:"8px 16px",cursor:"pointer",fontFamily:C.font,
                    color:i===0?C.a:C.text,fontSize:"10px",letterSpacing:"1px",
                    transition:"all 0.2s",
                  }}>{s}</div>
                ))}
              </div>
            </div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: DEATH / RESPAWN
───────────────────────────────────────────────────────────────── */
function Death({go}){
  const [count,setCount]=useState(5)
  const circumference=2*Math.PI*46
  useEffect(()=>{
    const iv=setInterval(()=>setCount(c=>Math.max(0,c-1)),1000)
    return()=>clearInterval(iv)
  },[])
  useEffect(()=>{if(count===0) setTimeout(()=>go("hud"),600);},[count])

  return(
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",backgroundColor:C.bg}}>
      <HexBg/>

      {/* Red pulsing vignette */}
      <div style={{position:"absolute",inset:0,animation:"redFlash 1.5s ease-in-out infinite",pointerEvents:"none",zIndex:1}}/>

      {/* Screen shake wrapper */}
      <div style={{position:"relative",zIndex:2,textAlign:"center",animation:"shake .4s ease, fadeUp .5s ease both"}}>

        {/* ELIMINATED title with intense glitch */}
        <div style={{position:"relative",marginBottom:"32px"}}>
          <div style={{
            fontFamily:"'Orbitron',var(--font)",
            fontSize:"72px",fontWeight:900,
            color:C.danger,
            textShadow:`0 0 30px ${C.danger}, 0 0 60px ${C.danger}66`,
            letterSpacing:"6px",lineHeight:1,
          }}>ELIMINATED</div>
          {/* Glitch overlays */}
          {[C.a2,C.a3].map((col,i)=>(
            <div key={i} aria-hidden style={{
              position:"absolute",inset:0,
              fontFamily:"'Orbitron',var(--font)",
              fontSize:"72px",fontWeight:900,color:col,
              letterSpacing:"6px",lineHeight:1,
              animation:`glitch${i+1} 2s step-start infinite`,
            }}>ELIMINATED</div>
          ))}
        </div>

        {/* Killed by panel */}
        <CPanel style={{
          padding:"28px 48px",marginBottom:"36px",display:"inline-block",
          backdropFilter:"blur(16px)",
          boxShadow:`0 0 40px ${C.danger}22`,
          animation:"scaleIn .4s .2s cubic-bezier(.16,1,.3,1) both",
        }}>
          <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"4px",fontFamily:C.font,marginBottom:"12px"}}>ELIMINATED BY</div>
          <div style={{fontFamily:"'Orbitron',var(--font)",color:C.textBright,fontSize:"28px",fontWeight:700,letterSpacing:"3px",marginBottom:"8px",textShadow:`0 0 16px ${C.a2}`}}>STRIKER_77</div>
          <div style={{color:C.a,fontSize:"12px",letterSpacing:"3px",fontFamily:C.font,textShadow:`0 0 8px ${C.a}88`}}>PULSE RIFLE · HEADSHOT</div>
          {/* tiny stats */}
          <div style={{display:"flex",gap:"24px",justifyContent:"center",marginTop:"12px"}}>
            {[{l:"DISTANCE",v:"42m"},{l:"DAMAGE",v:"160"},{l:"ACCURACY",v:"87%"}].map(s=>(
              <div key={s.l} style={{textAlign:"center"}}>
                <div style={{color:C.a,fontSize:"14px",fontWeight:"bold",fontFamily:"'Orbitron',var(--font)"}}>{s.v}</div>
                <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"2px",fontFamily:C.font}}>{s.l}</div>
              </div>
            ))}
          </div>
        </CPanel>

        {/* Countdown ring */}
        <div style={{marginBottom:"32px",position:"relative",display:"inline-block",animation:"scaleIn .4s .3s ease both"}}>
          <svg width="110" height="110" viewBox="0 0 110 110">
            <circle cx="55" cy="55" r="46" fill="none" stroke={`${C.a}22`} strokeWidth="3"/>
            <circle cx="55" cy="55" r="46" fill="none" stroke={C.a} strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={circumference*(1-((5-count)/5))}
              strokeLinecap="round"
              style={{transform:"rotate(-90deg)",transformOrigin:"50% 50%",transition:"stroke-dashoffset 0.9s cubic-bezier(.16,1,.3,1)",boxShadow:`0 0 12px ${C.a}`}}
            />
            {/* Inner ring */}
            <circle cx="55" cy="55" r="36" fill="none" stroke={`${C.a}12`} strokeWidth="1"/>
          </svg>
          <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontFamily:"'Orbitron',var(--font)",color:count<=2?C.danger:C.a,fontSize:"30px",fontWeight:700,lineHeight:1,
              textShadow:`0 0 16px ${count<=2?C.danger:C.a}`,
              transition:"color 0.3s",
            }}>{count}</div>
            <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font,marginTop:"2px"}}>RESPAWN</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{display:"flex",gap:"12px",justifyContent:"center",animation:"fadeUp .4s .4s ease both"}}>
          <CBtn primary onClick={()=>go("hud")}><span>RESPAWN NOW</span></CBtn>
          <CBtn onClick={()=>go("spec")}><span>SPECTATE</span></CBtn>
          <CBtn danger onClick={()=>go("lobby")}><span>LEAVE</span></CBtn>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: POST-MATCH
───────────────────────────────────────────────────────────────── */
function PostMatch({go}){
  const mvp=PLAYERS[0]
  const top3=PLAYERS.slice(0,3)
  return(
    <div style={{minHeight:"100vh",backgroundColor:C.bg,display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
      <HexBg/>
      <div style={{position:"relative",zIndex:5,flex:1,display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{
          background:"rgba(2,11,20,0.95)",backdropFilter:"blur(12px)",
          borderBottom:`1px solid ${C.border}`,
          padding:"16px 32px",display:"flex",justifyContent:"space-between",alignItems:"center",
          animation:"fadeUp .3s ease both",
        }}>
          <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"14px",fontWeight:700,letterSpacing:"5px",textShadow:`0 0 12px ${C.a}`}}>MATCH RESULTS</div>
          <div style={{color:C.textDim,fontSize:"11px",fontFamily:C.font,letterSpacing:"2px"}}>NEXUS CORE · TDM · 8:34 ELAPSED</div>
        </div>

        <div style={{flex:1,padding:"28px 32px",display:"flex",flexDirection:"column",gap:"20px",overflow:"auto"}}>
          {/* Winner */}
          <CPanel style={{
            padding:"28px 36px",display:"flex",alignItems:"center",gap:"32px",
            boxShadow:`0 0 40px ${C.a}18`,
            animation:"scaleIn .4s .1s cubic-bezier(.16,1,.3,1) both",
          }}>
            <div>
              <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"4px",fontFamily:C.font,marginBottom:"8px"}}>MATCH WINNER</div>
              <GlitchText size={48}>TEAM A</GlitchText>
              <div style={{display:"flex",gap:"12px",marginTop:"10px",alignItems:"baseline"}}>
                <AnimNumber target={PLAYERS.filter(p=>p.team==="A").reduce((s,p)=>s+p.k,0)} color={C.a2} size={28}/>
                <span style={{color:C.textDim,fontFamily:C.font,fontSize:"20px"}}> : </span>
                <AnimNumber target={PLAYERS.filter(p=>p.team==="B").reduce((s,p)=>s+p.k,0)} color={C.a} size={28}/>
              </div>
            </div>
            <div style={{flex:1}}/>
            {/* MVP card */}
            <CPanel style={{padding:"20px 28px",textAlign:"center",boxShadow:`0 0 24px ${C.warn}22`,animation:"scaleIn .4s .25s ease both"}}>
              <div style={{color:C.warn,fontSize:"9px",letterSpacing:"4px",fontFamily:C.font,marginBottom:"8px",animation:"pulse 2s infinite"}}>⭐ MVP</div>
              <div style={{fontFamily:"'Orbitron',var(--font)",color:C.textBright,fontSize:"20px",fontWeight:700,letterSpacing:"2px",marginBottom:"10px"}}>{mvp.name}</div>
              <div style={{display:"flex",gap:"16px",justifyContent:"center"}}>
                {[{v:mvp.k,c:C.ok,l:"K"},{v:mvp.d,c:C.danger,l:"D"},{v:mvp.a,c:C.warn,l:"A"}].map(s=>(
                  <div key={s.l} style={{textAlign:"center"}}>
                    <AnimNumber target={s.v} color={s.c} size={20} duration={1400}/>
                    <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"2px",fontFamily:C.font}}>{s.l}</div>
                  </div>
                ))}
              </div>
            </CPanel>
          </CPanel>

          {/* Stats row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px"}}>
            {/* Top 3 */}
            <div style={{animation:"slideLeft .4s .2s ease both"}}>
              <div className="clabel" style={{marginBottom:"12px"}}>// TOP FRAGGERS</div>
              {top3.map((p,i)=>(
                <CPanel key={p.id} style={{
                  padding:"14px 18px",marginBottom:"8px",
                  display:"flex",alignItems:"center",gap:"14px",
                  boxShadow:i===0?`0 0 16px ${C.warn}22`:undefined,
                  animation:`slideLeft .35s ${0.2+i*0.08}s ease both`,
                }}>
                  <div style={{fontSize:"18px",width:"28px"}}>{i===0?"🥇":i===1?"🥈":"🥉"}</div>
                  <div style={{flex:1}}>
                    <div style={{fontFamily:"'Orbitron',var(--font)",color:C.textBright,fontSize:"14px",fontWeight:700}}>{p.name}</div>
                    <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"2px",fontFamily:C.font,marginTop:"2px"}}>K/D: {(p.k/Math.max(p.d,1)).toFixed(2)}</div>
                  </div>
                  <AnimNumber target={p.k} color={C.ok} size={20} duration={1000+i*200}/>
                  <span style={{color:C.textDim,fontFamily:C.font,fontSize:"12px"}}> K</span>
                </CPanel>
              ))}
            </div>

            {/* Your stats + XP */}
            <div style={{animation:"slideRight .4s .2s ease both"}}>
              <div className="clabel" style={{marginBottom:"12px"}}>// YOUR SESSION</div>
              <CPanel style={{padding:"20px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"16px"}}>
                  {[{l:"KILLS",v:mvp.k,c:C.ok},{l:"DEATHS",v:mvp.d,c:C.danger},{l:"ASSISTS",v:mvp.a,c:C.warn},{l:"SCORE",v:mvp.sc,c:C.a}].map(s=>(
                    <div key={s.l} style={{
                      textAlign:"center",padding:"12px",
                      background:C.panel,border:`1px solid ${C.border}`,
                      animation:`scaleIn .4s ${0.3}s ease both`,
                    }}>
                      <AnimNumber target={s.v} color={s.c} size={22} duration={1200}/>
                      <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font,marginTop:"4px"}}>{s.l}</div>
                    </div>
                  ))}
                </div>
                {/* XP bar */}
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
                    <div className="clabel">XP EARNED +2,400</div>
                    <span style={{color:C.a,fontSize:"10px",fontFamily:"'Orbitron',var(--font)"}}>LVL 24</span>
                  </div>
                  <div style={{height:"6px",background:`${C.textDim}33`,position:"relative",overflow:"hidden"}}>
                    <div style={{
                      position:"absolute",inset:0,height:"100%",
                      background:`linear-gradient(90deg,${C.a3},${C.a})`,
                      boxShadow:`0 0 10px ${C.a}`,
                      animationName:"xpFill",animationDuration:"1.2s",animationTimingFunction:"cubic-bezier(.16,1,.3,1)",animationDelay:".4s",animationFillMode:"both",
                    }}/>
                    {/* Shimmer */}
                    <div style={{
                      position:"absolute",inset:0,
                      backgroundImage:`linear-gradient(90deg,transparent,${C.textBright}44,transparent)`,
                      animationName:"shimmer",animationDuration:"1.5s",animationTimingFunction:"linear",animationIterationCount:"infinite",animationDelay:"1.2s",backgroundSize:"200% 100%",
                    }}/>
                  </div>
                  <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"2px",marginTop:"4px",fontFamily:C.font}}>→ LVL 25 · 68%</div>
                </div>
              </CPanel>
            </div>
          </div>

          {/* Actions */}
          <div style={{display:"flex",gap:"12px",justifyContent:"center",animation:"fadeUp .4s .5s ease both"}}>
            <CBtn primary onClick={()=>go("loading")}><span>REMATCH</span></CBtn>
            <CBtn onClick={()=>go("lobby")}><span>RETURN TO LOBBY</span></CBtn>
            <CBtn onClick={()=>go("main")}><span>MAIN MENU</span></CBtn>
            <CBtn onClick={()=>{}}><span>📋 SHARE</span></CBtn>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: LOADING / CONNECTING
───────────────────────────────────────────────────────────────── */
function LoadingScreen({go}){
  const [phase,setPhase]=useState(0)
  const phases=[
    {l:"CONNECTING TO SERVER",  p:15},
    {l:"AUTHENTICATING",        p:30},
    {l:"JOINING ROOM",          p:55},
    {l:"LOADING MAP — NEXUS CORE", p:74},
    {l:"SPAWNING PLAYERS",      p:90},
    {l:"MATCH STARTING...",     p:100},
  ]
  const [chars,setChars]=useState("")
  const cur=phases[phase]

  useEffect(()=>{
    if(phase<phases.length-1){
      const to=setTimeout(()=>setPhase(p=>p+1),950)
      return()=>clearTimeout(to)
    } else {
      const to=setTimeout(()=>go("hud"),700)
      return()=>clearTimeout(to)
    }
  },[phase])

  // Scramble effect on status text
  const CHARS="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-."
  useEffect(()=>{
    let frame=0
    const target=cur.l
    const iv=setInterval(()=>{
      frame++
      if(frame>target.length+6){ clearInterval(iv); setChars(target); return; }
      setChars(target.split("").map((ch,i)=>{
        if(i<frame-6) return ch
        if(i<=frame) return CHARS[Math.floor(Math.random()*CHARS.length)]
        return " "
      }).join(""))
    },40)
    return()=>clearInterval(iv)
  },[phase])

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",backgroundColor:C.bg,position:"relative",overflow:"hidden"}}>
      <HexBg/>

      {/* Data streams — extra intense on loading */}
      {Array.from({length:12},(_,i)=>(
        <div key={i} style={{
          position:"absolute",left:`${(i+0.5)*8.3}%`,top:0,
          width:"1px",height:"160px",
          background:`linear-gradient(transparent,${i%3===0?C.a:i%3===1?C.a2:C.a3}66,transparent)`,
          animationName:"dataStream",
          animationDuration:`${3+i*0.7}s`,
          animationDelay:`${i*0.3}s`,
          animationTimingFunction:"linear",
          animationIterationCount:"infinite",
          opacity:0,
          zIndex:1,
        }}/>
      ))}

      <div style={{position:"relative",zIndex:2,textAlign:"center",width:"520px"}}>
        {/* Logo */}
        <div style={{marginBottom:"44px",animation:"fadeUp .5s ease both"}}>
          <GlitchText size={72}>ARENA</GlitchText>
        </div>

        {/* Spinning hex ring */}
        <div style={{position:"relative",display:"inline-block",marginBottom:"36px",animation:"fadeIn .4s .2s ease both"}}>
          <svg width="80" height="80" viewBox="0 0 80 80" style={{animation:"spin 2s linear infinite"}}>
            <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="none" stroke={`${C.a}33`} strokeWidth="1"/>
            <polygon points="40,4 72,22 72,58 40,76 8,58 8,22" fill="none" stroke={C.a} strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>
          <div style={{
            position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",
            fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"11px",fontWeight:700,letterSpacing:"2px",
          }}>SYS</div>
        </div>

        {/* Scrambled status */}
        <div style={{
          fontFamily:"'Orbitron',var(--font)",color:C.textBright,
          fontSize:"13px",letterSpacing:"2px",marginBottom:"28px",
          minHeight:"26px",textTransform:"uppercase",
          textShadow:`0 0 12px ${C.a}66`,
        }}>
          {chars}<span className="blink" style={{color:C.a}}>█</span>
        </div>

        {/* Progress bar */}
        <div style={{marginBottom:"12px",animation:"fadeIn .4s .3s ease both"}}>
          <div style={{height:"3px",background:`${C.textDim}22`,position:"relative",overflow:"hidden",marginBottom:"8px"}}>
            <div style={{
              position:"absolute",left:0,top:0,height:"100%",
              width:`${cur.p}%`,
              background:`linear-gradient(90deg,${C.a3},${C.a})`,
              boxShadow:`0 0 10px ${C.a}`,
              transition:"width .7s cubic-bezier(.16,1,.3,1)",
            }}/>
            {/* Shimmer */}
            <div style={{
              position:"absolute",inset:0,
              backgroundImage:`linear-gradient(90deg,transparent,${C.textBright}44,transparent)`,
              animationName:"shimmer",animationDuration:"1.2s",animationTimingFunction:"linear",animationIterationCount:"infinite",backgroundSize:"200% 100%",
            }}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:C.font,fontSize:"9px",color:C.textDim,letterSpacing:"2px"}}>
            <span>ROOM {RC}</span>
            <span style={{color:C.a,fontFamily:"'Orbitron',var(--font)"}}>{cur.p}%</span>
          </div>
        </div>

        {/* Step list */}
        <div style={{display:"flex",flexDirection:"column",gap:"5px",alignItems:"flex-start",padding:"0 60px",animation:"fadeIn .4s .4s ease both"}}>
          {phases.map((ph,i)=>(
            <div key={i} style={{
              display:"flex",gap:"12px",alignItems:"center",
              fontFamily:C.font,fontSize:"11px",
              opacity:i<=phase?1:0.25,
              transition:"opacity 0.4s",
              animation:i===phase?"fadeIn .3s ease both":undefined,
            }}>
              <span style={{
                color:i<phase?C.ok:i===phase?C.a:C.textDim,
                fontSize:"13px",
                textShadow:i===phase?`0 0 8px ${C.a}`:i<phase?`0 0 6px ${C.ok}`:"none",
                animation:i===phase?"pulse 1s infinite":undefined,
              }}>
                {i<phase?"✓":i===phase?"▶":"○"}
              </span>
              <span style={{color:i===phase?C.textBright:i<phase?`${C.ok}88`:C.textDim,letterSpacing:"2px"}}>{ph.l}</span>
            </div>
          ))}
        </div>

        <div style={{marginTop:"28px",animation:"fadeIn .4s .5s ease both"}}>
          <CBtn small onClick={()=>go("main")}><span>CANCEL</span></CBtn>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   SCREEN: SPECTATOR
───────────────────────────────────────────────────────────────── */
function Spectator({go}){
  const [watching,setWatching]=useState(0)
  const cur=PLAYERS[watching]
  const teamA=PLAYERS.filter(p=>p.team==="A").reduce((s,p)=>s+p.k,0)
  const teamB=PLAYERS.filter(p=>p.team==="B").reduce((s,p)=>s+p.k,0)

  return(
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden",backgroundColor:C.bg}}>
      <HexBg/>
      <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse at center,transparent 40%,${C.bg}dd 100%)`,pointerEvents:"none",zIndex:2}}/>

      {/* ── TOP OBSERVER BAR ── */}
      <div style={{
        position:"absolute",top:0,left:0,right:0,zIndex:10,
        background:"rgba(2,11,20,0.95)",backdropFilter:"blur(12px)",
        borderBottom:`1px solid ${C.border}`,
        padding:"8px 20px",display:"flex",alignItems:"center",gap:"24px",
        animation:"fadeUp .3s ease both",
      }}>
        <div style={{
          background:C.danger,color:"#fff",
          padding:"3px 10px",fontSize:"9px",fontWeight:"bold",letterSpacing:"3px",
          fontFamily:"'Orbitron',var(--font)",
          animation:"pulse 1.5s infinite",
        }}>● SPECTATING</div>
        <div style={{fontFamily:"'Orbitron',var(--font)",color:C.textBright,fontSize:"13px",fontWeight:700,textShadow:`0 0 8px ${C.a2}`}}>{cur.name}</div>
        <div style={{flex:1}}/>
        {/* Score */}
        <div style={{display:"flex",gap:"20px",alignItems:"center"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a2,fontSize:"18px",fontWeight:700,textShadow:`0 0 10px ${C.a2}`}}>{teamA}</div>
            <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font}}>TEAM A</div>
          </div>
          <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"20px",fontWeight:700,letterSpacing:"3px",textShadow:`0 0 16px ${C.a}`}}>08:34</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Orbitron',var(--font)",color:C.a,fontSize:"18px",fontWeight:700,textShadow:`0 0 10px ${C.a}`}}>{teamB}</div>
            <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font}}>TEAM B</div>
          </div>
        </div>
        <div style={{flex:1}}/>
        <div style={{color:C.textDim,fontSize:"9px",fontFamily:C.font,letterSpacing:"2px"}}>NEXUS CORE · TDM · 12ms</div>
        <CBtn small onClick={()=>go("hud")}><span>EXIT</span></CBtn>
      </div>

      {/* ── LEFT: player roster ── */}
      <div style={{position:"absolute",top:"56px",left:"16px",zIndex:10,width:"190px",animation:"slideLeft .4s .1s ease both"}}>
        <div className="clabel" style={{marginBottom:"8px"}}>// PLAYERS</div>
        {PLAYERS.map((p,i)=>(
          <div key={p.id} onClick={()=>setWatching(i)} style={{
            background:i===watching?`${C.a}12`:C.panel,
            border:`1px solid ${i===watching?C.a:C.border}`,
            padding:"8px 12px",marginBottom:"4px",cursor:"pointer",
            display:"flex",justifyContent:"space-between",alignItems:"center",
            transition:"all 0.2s",
            boxShadow:i===watching?`0 0 12px ${C.a}22`:undefined,
            animation:`slideLeft .3s ${0.1+i*0.04}s ease both`,
          }}>
            <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:p.team==="A"?C.a2:C.a,animation:i===watching?"pulse 1.5s infinite":undefined}}/>
              <span style={{fontFamily:C.font,color:i===watching?C.a:C.text,fontSize:"11px",letterSpacing:"1px"}}>{p.name}</span>
            </div>
            <div style={{display:"flex",gap:"6px",fontFamily:"'Orbitron',var(--font)",fontSize:"11px"}}>
              <span style={{color:C.ok}}>{p.k}</span>
              <span style={{color:C.textDim}}>/</span>
              <span style={{color:C.danger}}>{p.d}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── MINIMAP ── */}
      <div style={{position:"absolute",top:"56px",right:"16px",zIndex:10,animation:"slideRight .4s .1s ease both"}}>
        <RadarMap/>
      </div>

      {/* ── KILL FEED ── */}
      <div style={{position:"absolute",top:"200px",right:"16px",zIndex:10,display:"flex",flexDirection:"column",gap:"4px",maxWidth:"260px"}}>
        {KFEED_STATIC.map((k,i)=><KFeedItem key={k.id} k={k} delay={i}/>)}
      </div>

      {/* ── LOWER-THIRD player card ── */}
      <div style={{
        position:"absolute",bottom:"20px",left:"50%",transform:"translateX(-50%)",zIndex:10,
        animation:"fadeUp .4s .3s ease both",
      }}>
        <CPanel style={{
          padding:"16px 28px",display:"flex",gap:"28px",alignItems:"center",
          backdropFilter:"blur(16px)",
          boxShadow:`0 0 32px ${C.a}18`,
          minWidth:"560px",
        }}>
          <div style={{borderRight:`1px solid ${C.border}`,paddingRight:"24px",minWidth:"160px"}}>
            <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"3px",fontFamily:C.font,marginBottom:"4px"}}>WATCHING</div>
            <div style={{fontFamily:"'Orbitron',var(--font)",color:cur.team==="A"?C.a2:C.a,fontSize:"18px",fontWeight:700,letterSpacing:"2px",textShadow:`0 0 12px ${cur.team==="A"?C.a2:C.a}`}}>{cur.name}</div>
            <div style={{color:C.textDim,fontSize:"9px",letterSpacing:"2px",fontFamily:C.font,marginTop:"3px"}}>TEAM {cur.team} · <PingDot ping={cur.ping}/></div>
          </div>
          {[{l:"KILLS",v:cur.k,c:C.ok},{l:"DEATHS",v:cur.d,c:C.danger},{l:"ASSISTS",v:cur.a,c:C.warn},{l:"SCORE",v:cur.sc,c:C.a}].map(s=>(
            <div key={s.l} style={{textAlign:"center",minWidth:"52px"}}>
              <div style={{fontFamily:"'Orbitron',var(--font)",color:s.c,fontSize:"22px",fontWeight:700,textShadow:`0 0 10px ${s.c}88`}}>{s.v}</div>
              <div style={{color:C.textDim,fontSize:"8px",letterSpacing:"3px",fontFamily:C.font}}>{s.l}</div>
            </div>
          ))}
          <div style={{marginLeft:"auto",display:"flex",gap:"6px"}}>
            <CBtn small onClick={()=>setWatching(w=>(w-1+PLAYERS.length)%PLAYERS.length)}><span>←</span></CBtn>
            <CBtn small onClick={()=>setWatching(w=>(w+1)%PLAYERS.length)}><span>→</span></CBtn>
          </div>
        </CPanel>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────
   APP ROOT
───────────────────────────────────────────────────────────────── */
const SCREENS={
  main:MainMenu, lobby:Lobby, hud:HUD, score:Scoreboard,
  pause:PauseMenu, settings:Settings, death:Death,
  post:PostMatch, loading:LoadingScreen, spec:Spectator,
}
const NAV=[
  {k:"main",   l:"MAIN MENU"},
  {k:"lobby",  l:"LOBBY"},
  {k:"hud",    l:"IN-GAME HUD"},
  {k:"score",  l:"SCOREBOARD"},
  {k:"pause",  l:"PAUSE"},
  {k:"settings",l:"SETTINGS"},
  {k:"death",  l:"DEATH / RESPAWN"},
  {k:"post",   l:"POST-MATCH"},
  {k:"loading",l:"LOADING"},
  {k:"spec",   l:"SPECTATOR"},
]

export default function App(){
  const [screen,setScreen]=useState("main")
  const [panelOpen,setPanelOpen]=useState(true)
  const Screen=SCREENS[screen]||MainMenu

  useEffect(()=>{
    const h=(e)=>{
      if(e.key==="`") setPanelOpen(o=>!o)
    }
    window.addEventListener("keydown",h)
    return()=>window.removeEventListener("keydown",h)
  },[])

  return(
    <div style={{minHeight:"100vh",position:"relative"}}>
      <style>{CSS}</style>
      <div className="scanlines"/>
      <div className="scan-sweep"/>

      <Screen go={setScreen}/>

      {/* ── SCREEN NAV PANEL ── */}
      {panelOpen&&(
        <div style={{
          position:"fixed",bottom:"16px",right:"16px",zIndex:9999,
          background:"rgba(2,11,20,0.96)",
          border:`1px solid ${C.border}`,
          padding:"16px",
          backdropFilter:"blur(16px)",
          fontFamily:C.font,
          boxShadow:`0 8px 40px rgba(0,0,0,0.6), 0 0 20px ${C.a}11`,
          width:"200px",
          animation:"slideRight .3s cubic-bezier(.16,1,.3,1) both",
        }}>
          {/* Corner decorations */}
          <div style={{position:"absolute",top:"-1px",left:"-1px",width:"10px",height:"10px",borderTop:`2px solid ${C.a}`,borderLeft:`2px solid ${C.a}`}}/>
          <div style={{position:"absolute",bottom:"-1px",right:"-1px",width:"10px",height:"10px",borderBottom:`2px solid ${C.a}`,borderRight:`2px solid ${C.a}`}}/>

          <div style={{color:C.a,fontSize:"9px",letterSpacing:"3px",marginBottom:"10px",paddingBottom:"10px",borderBottom:`1px solid ${C.border}`,fontFamily:"'Orbitron',var(--font)"}}>
            SCREENS
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:"3px"}}>
            {NAV.map(s=>(
              <button key={s.k} onClick={()=>setScreen(s.k)} style={{
                fontFamily:C.font,
                background:screen===s.k?`${C.a}15`:"transparent",
                border:"none",borderLeft:`2px solid ${screen===s.k?C.a:C.textDim}`,
                color:screen===s.k?C.a:C.text,
                padding:"6px 10px",fontSize:"10px",letterSpacing:"1px",
                textAlign:"left",cursor:"pointer",textTransform:"uppercase",
                width:"100%",transition:"all 0.15s",
                textShadow:screen===s.k?`0 0 6px ${C.a}66`:undefined,
              }}>{s.l}</button>
            ))}
          </div>
          <div style={{marginTop:"10px",paddingTop:"8px",borderTop:`1px solid ${C.border}`,color:C.textDim,fontSize:"8px",letterSpacing:"1px"}}>
            ` key toggles panel
          </div>
        </div>
      )}
    </div>
  )
}
