import { useState, useEffect } from "react";

const COLORS = {
  blue:"#378ADD", purple:"#7F77DD", teal:"#1D9E75",
  amber:"#BA7517", coral:"#D85A30", green:"#3B6D11", gray:"#888780",
};

function getIcon(id) {
  const s=(id||"").toLowerCase();
  if(s.includes("frontend")||s.includes("ui")||s.includes("client")||s.includes("user")||s.includes("msg")||s.includes("response")) return "ti-layout-2";
  if(s.includes("api")||s.includes("backend")||s.includes("server")||s.includes("gateway")) return "ti-server";
  if(s.includes("agent")||s.includes("logic")||s.includes("orchestrat")||s.includes("graph")) return "ti-robot";
  if(s.includes("llm")||s.includes("ai")||s.includes("model")||s.includes("inference")) return "ti-brain";
  if(s.includes("data")||s.includes("storage")||s.includes("db")||s.includes("vector")) return "ti-database";
  if(s.includes("auth")||s.includes("security")) return "ti-lock";
  if(s.includes("infra")||s.includes("deploy")||s.includes("cloud")) return "ti-cloud";
  return "ti-stack-2";
}

function layoutLayer(components,totalW,leftPad,gap){
  const n=components.length; if(n===0)return[];
  const maxNodeW=170;
  const totalIfMax=n*maxNodeW+(n-1)*gap;
  const nodeW=totalIfMax<=totalW?maxNodeW:Math.floor((totalW-(n-1)*gap)/n);
  const totalUsed=n*nodeW+(n-1)*gap;
  const startX=leftPad+(totalW-totalUsed)/2;
  return components.map((comp,i)=>({...comp,nodeW,x:startX+i*(nodeW+gap),cx:startX+i*(nodeW+gap)+nodeW/2}));
}

function trunc(s,nodeW,charW){
  const max=Math.floor((nodeW-22)/charW);
  const str=s||"";
  return str.length>max?str.slice(0,max-1)+"…":str;
}

// ── SVG Diagram ───────────────────────────────────────────────────────────────

function ArchSVG({arch}){
  const W=660,NODE_H=60,SLOT_H=112,LABEL_H=26,TOP_PAD=16,BOT_PAD=28;
  const layers=arch.layers||[];
  const H=TOP_PAD+layers.length*SLOT_H+BOT_PAD;
  const posMap={};
  const layerLayouts=layers.map((layer,li)=>{
    const color=COLORS[layer.color]||COLORS.gray;
    const layerY=TOP_PAD+li*SLOT_H;
    const nodeY=layerY+LABEL_H;
    const positions=layoutLayer(layer.components||[],620,20,16);
    positions.forEach(pos=>{posMap[pos.id]={...pos,y:nodeY,bottom:nodeY+NODE_H,cy:nodeY+NODE_H/2,color};});
    return{...layer,color,layerY,nodeY,positions};
  });
  let arrows=[];
  layers.forEach(layer=>{
    (layer.components||[]).forEach(comp=>{
      const from=posMap[comp.id]; if(!from)return;
      (comp.connects_to||[]).forEach(tid=>{const to=posMap[tid];if(to)arrows.push({from,to,color:from.color});});
    });
  });
  if(arrows.length===0){
    layers.forEach((layer,li)=>{
      const next=layers[li+1]; if(!next)return;
      (layer.components||[]).forEach(comp=>{
        const from=posMap[comp.id]; if(!from)return;
        (next.components||[]).forEach(nc=>{const to=posMap[nc.id];if(to)arrows.push({from,to,color:from.color});});
      });
    });
  }
  return(
    <svg width="100%" viewBox={"0 0 "+W+" "+H} role="img">
      <title>{"Architecture — "+arch.project_name}</title>
      <defs>
        <marker id="da" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
      </defs>
      {arrows.map((a,i)=>{
        const x1=a.from.cx,y1=a.from.bottom+2,x2=a.to.cx,y2=a.to.y-2,my=(y1+y2)/2,bx=(x1+x2)/2;
        return(
          <g key={i}>
            <path d={"M "+x1+" "+y1+" C "+x1+" "+my+", "+x2+" "+my+", "+x2+" "+y2} fill="none" stroke={a.color} strokeWidth="1.5" strokeOpacity="0.4" markerEnd="url(#da)"/>
            <circle cx={bx} cy={my} r="10" fill="var(--color-background-primary)" stroke={a.color} strokeWidth="0.75"/>
            <text x={bx} y={my} textAnchor="middle" dominantBaseline="central" style={{fontSize:"9px",fontWeight:600,fill:a.color,fontFamily:"var(--font-sans)"}}>
              {i+1}
            </text>
          </g>
        );
      })}
      {layerLayouts.map(layer=>(
        <g key={layer.id}>
          <text x="20" y={layer.layerY+17} style={{fontSize:"10px",fontFamily:"var(--font-sans)",fontWeight:600,fill:layer.color}}>
            {layer.name.toUpperCase()}
          </text>
          {layer.positions.map(pos=>{
            const p=posMap[pos.id]; if(!p)return null;
            return(
              <g key={pos.id}>
                <rect x={p.x} y={p.y} width={p.nodeW} height={NODE_H} rx="8" fill={layer.color+"14"} stroke={layer.color} strokeWidth="0.75"/>
                <text x={p.cx} y={p.y+24} textAnchor="middle" style={{fontSize:"13px",fontWeight:500,fontFamily:"var(--font-sans)",fill:"var(--color-text-primary)"}}>
                  {trunc(pos.name,p.nodeW,7.5)}
                </text>
                <text x={p.cx} y={p.y+44} textAnchor="middle" style={{fontSize:"10px",fontFamily:"var(--font-mono)",fill:layer.color,opacity:0.88}}>
                  {trunc(pos.tech||"",p.nodeW,6.5)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// ── Animate View ──────────────────────────────────────────────────────────────

function AnimateView({arch}){
  const flows=arch.key_flows||[];
  const layers=arch.layers||[];
  const total=flows.length;
  const sampleMsg=arch.sample_query||"Processing your request...";

  const flowColors=flows.map((_,i)=>{
    const li=Math.min(Math.floor(i*layers.length/Math.max(total,1)),layers.length-1);
    return COLORS[layers[li]?.color]||COLORS.gray;
  });

  const [step,setStep]=useState(-1);
  const [typed,setTyped]=useState("");
  const [playing,setPlaying]=useState(false);
  const [done,setDone]=useState(false);

  useEffect(()=>{
    if(!playing)return;
    if(step===0){
      let i=0; setTyped("");
      const iv=setInterval(()=>{
        i++;
        setTyped(sampleMsg.slice(0,i));
        if(i>=sampleMsg.length){clearInterval(iv);setTimeout(()=>setStep(1),700);}
      },38);
      return()=>clearInterval(iv);
    } else if(step>0&&step<=total){
      const t=setTimeout(()=>{
        if(step<total)setStep(s=>s+1);
        else{setPlaying(false);setDone(true);}
      },1800);
      return()=>clearTimeout(t);
    }
  },[step,playing]);

  const progressPct=step<=0?0:Math.min(((step-0.5)/total)*100,100);
  const dotColor=step>0&&step<=total?flowColors[step-1]:"#1D9E75";

  function play(){setStep(0);setTyped("");setDone(false);setPlaying(true);}
  function reset(){setStep(-1);setTyped("");setDone(false);setPlaying(false);}

  return(
    <div style={{padding:"20px 16px"}}>

      {/* User bubble */}
      <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:16}}>
        <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,background:"#378ADD15",border:"2px solid #378ADD",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <i className="ti ti-user" style={{fontSize:22,color:"#378ADD"}}/>
          {step===0&&playing&&<span style={{position:"absolute",bottom:1,right:1,width:11,height:11,borderRadius:"50%",background:"#1D9E75",border:"2px solid var(--color-background-primary)"}}/>}
        </div>
        <div style={{
          flex:1,
          background:step>=0?"#378ADD08":"var(--color-background-secondary)",
          border:`0.5px solid ${step>=0?"#378ADD55":"var(--color-border-tertiary)"}`,
          borderRadius:"16px 16px 16px 4px",
          padding:"10px 14px",fontSize:13.5,lineHeight:1.5,
          color:step>=0?"var(--color-text-primary)":"var(--color-text-tertiary)",
          fontStyle:step===-1?"italic":"normal",
          minHeight:44,display:"flex",alignItems:"center",
          transition:"all 0.35s ease",
        }}>
          {step===-1?"Hit play to simulate the data flow...":typed||" "}
          {step===0&&playing&&<span className="cursor-blink" style={{marginLeft:1}}>|</span>}
        </div>
      </div>

      {/* Pipeline: progress line + step cards */}
      <div style={{display:"flex",gap:14}}>

        {/* Vertical animated line */}
        <div style={{width:24,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:2}}>
          <div style={{position:"relative",flex:1,width:2,background:"var(--color-border-tertiary)",borderRadius:1}}>
            {/* Green fill trail */}
            <div style={{
              position:"absolute",top:0,left:0,width:"100%",
              height:progressPct+"%",
              background:"linear-gradient(to bottom, #1D9E75, "+dotColor+")",
              borderRadius:1,
              transition:"height 0.55s ease",
            }}/>
            {/* Moving dot */}
            {step>0&&(
              <div style={{
                position:"absolute",
                left:"50%",
                top:progressPct+"%",
                transform:"translate(-50%, -50%)",
                width:14,height:14,
                borderRadius:"50%",
                background:dotColor,
                boxShadow:"0 0 10px "+dotColor+"99",
                transition:"top 0.55s ease, background 0.3s ease, box-shadow 0.3s ease",
                zIndex:2,
              }}/>
            )}
          </div>
        </div>

        {/* Step cards */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
          {flows.map((flow,i)=>{
            const s=i+1;
            const isActive=step===s;
            const isDone=step>s||done;
            const isPending=step<s&&step>0;
            const color=flowColors[i];
            return(
              <div key={i} style={{
                padding:"11px 14px",
                borderRadius:"var(--radius-md)",
                border:`0.5px solid ${isActive?color:isDone?"#1D9E7544":"var(--color-border-tertiary)"}`,
                background:isActive?color+"12":isDone?"#1D9E7506":"var(--color-background-primary)",
                opacity:isPending?0.3:1,
                transition:"all 0.45s ease",
                display:"flex",gap:10,alignItems:"flex-start",
              }}>
                {/* Badge */}
                <div style={{
                  width:22,height:22,borderRadius:"50%",flexShrink:0,
                  background:isDone?"#1D9E75":isActive?color:"var(--color-background-secondary)",
                  border:`1.5px solid ${isDone?"#1D9E75":isActive?color:"var(--color-border-secondary)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:600,
                  color:isDone||isActive?"#fff":"var(--color-text-tertiary)",
                  transition:"all 0.4s ease",
                }}>
                  {isDone?<i className="ti ti-check" style={{fontSize:11}}/>:s}
                </div>

                {/* Text */}
                <p style={{
                  margin:0,fontSize:13,lineHeight:1.5,flex:1,
                  color:isActive?"var(--color-text-primary)":isDone?"var(--color-text-secondary)":"var(--color-text-tertiary)",
                  transition:"color 0.35s ease",
                }}>
                  {flow}
                </p>

                {/* Active pulse dot */}
                {isActive&&(
                  <span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0,marginTop:5,animation:"pulse 1s ease infinite"}}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI response bubble */}
      <div style={{
        display:"flex",gap:12,alignItems:"flex-start",marginTop:16,
        opacity:done?1:0,
        transform:done?"translateY(0)":"translateY(8px)",
        transition:"all 0.5s ease",
        pointerEvents:done?"auto":"none",
      }}>
        <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,background:"#7F77DD15",border:"2px solid #7F77DD",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <i className="ti ti-robot" style={{fontSize:22,color:"#7F77DD"}}/>
        </div>
        <div style={{
          flex:1,background:"#7F77DD10",border:"0.5px solid #7F77DD44",
          borderRadius:"16px 16px 4px 16px",
          padding:"10px 14px",fontSize:13.5,
          color:"var(--color-text-primary)",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{color:"#1D9E75",fontWeight:600,fontSize:15}}>✓</span>
          Response delivered through all {total} steps.
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",justifyContent:"center",marginTop:22,gap:8}}>
        {step===-1?(
          <button onClick={play} className="run-btn" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 20px"}}>
            <i className="ti ti-player-play" aria-hidden="true"/> Play flow animation
          </button>
        ):(
          <button onClick={reset} className="run-btn" style={{display:"flex",alignItems:"center",gap:6}}>
            <i className="ti ti-refresh" aria-hidden="true"/> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Cards View ────────────────────────────────────────────────────────────────

function ComponentCard({comp,color,delay}){
  return(
    <div className="comp-card" style={{animationDelay:delay+"s"}}>
      <div className="comp-name">{comp.name}</div>
      <span className="comp-tech" style={{background:color+"22",color}}>{comp.tech}</span>
      <div className="comp-purpose">{comp.purpose}</div>
    </div>
  );
}

function LayerRow({layer,idx,total}){
  const color=COLORS[layer.color]||COLORS.gray;
  const base=0.06+idx*0.13;
  return(
    <div>
      <div className="layer-row" style={{borderLeft:"3px solid "+color,animationDelay:base+"s"}}>
        <div className="layer-header">
          <div className="layer-icon" style={{background:color+"1e"}}>
            <i className={"ti "+getIcon(layer.id)} style={{fontSize:14,color}} aria-hidden="true"/>
          </div>
          <div className="layer-meta">
            <span className="layer-name">{layer.name}</span>
            {layer.description&&<span className="layer-desc">{layer.description}</span>}
          </div>
          <span className="layer-badge">L{idx+1}</span>
        </div>
        <div className="comp-grid">
          {(layer.components||[]).map((comp,ci)=>(
            <ComponentCard key={comp.id||ci} comp={comp} color={color} delay={base+0.07+ci*0.06}/>
          ))}
        </div>
      </div>
      {idx<total-1&&(
        <div className="layer-connector" style={{animationDelay:(base+0.12)+"s"}}>
          <svg width="18" height="26" viewBox="0 0 18 26" fill="none">
            <line x1="9" y1="0" x2="9" y2="17" stroke="var(--color-border-secondary)" strokeWidth="1.5" strokeDasharray="4 3"/>
            <polyline points="4,14 9,21 14,14" stroke="var(--color-border-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Architecture Output ───────────────────────────────────────────────────────

function ArchDiagram({arch}){
  const [view,setView]=useState("diagram");
  const [showJSON,setShowJSON]=useState(false);
  const numLayers=(arch.layers||[]).length;
  const flowDelay=0.06+numLayers*0.13+0.2;
  return(
    <div className="arch-output">
      <div className="arch-header fade-up">
        <div className="arch-header-left">
          <h3 className="arch-title">{arch.project_name}</h3>
          <p className="arch-summary">{arch.summary}</p>
        </div>
        <div className="arch-controls">
          <div className="view-toggle">
            {[
              ["diagram","ti-topology-star-2","Diagram"],
              ["cards","ti-layout-rows","Cards"],
              ["animate","ti-player-play","Animate"],
            ].map(([v,ic,label])=>(
              <button key={v} onClick={()=>setView(v)} className={"toggle-btn"+(view===v?" active":"")}>
                <i className={"ti "+ic} aria-hidden="true"/>{label}
              </button>
            ))}
          </div>
          <button className="json-btn" onClick={()=>setShowJSON(p=>!p)}>
            <i className="ti ti-code" aria-hidden="true"/> {showJSON?"Hide":"JSON"}
          </button>
        </div>
      </div>

      {showJSON&&<pre className="json-block fade-up">{JSON.stringify(arch,null,2)}</pre>}

      {view==="diagram"&&(
        <div className="diagram-wrap fade-up">
          <ArchSVG arch={arch}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 4px 0",fontSize:11,color:"var(--color-text-tertiary)"}}>
            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",border:"0.75px solid var(--color-border-secondary)",fontSize:9,fontWeight:600}}>1</span>
            <span>Numbers show the order of data flow through the system</span>
          </div>
        </div>
      )}

      {view==="cards"&&(
        <div className="cards-wrap">
          {(arch.layers||[]).map((layer,idx)=>(
            <LayerRow key={layer.id||idx} layer={layer} idx={idx} total={numLayers}/>
          ))}
        </div>
      )}

      {view==="animate"&&(
        <div className="diagram-wrap fade-up">
          <AnimateView arch={arch}/>
        </div>
      )}

      {view!=="animate"&&(arch.key_flows||[]).length>0&&(
        <div className="flows-section" style={{animationDelay:flowDelay+"s"}}>
          <div className="flows-header">
            <i className="ti ti-route" aria-hidden="true"/>
            <span>Message journey</span>
          </div>
          {arch.key_flows.map((flow,i)=>(
            <div key={i} className={"flow-item"+(i>0?" bordered":"")}>
              <span className="flow-num">{String(i+1).padStart(2,"0")}</span>
              <p className="flow-text">{flow}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SpecForge(){
  const [spec,setSpec]=useState("");
  const [loading,setLoading]=useState(false);
  const [phase,setPhase]=useState("");
  const [arch,setArch]=useState(null);
  const [error,setError]=useState(null);

  async function run(){
    if(!spec.trim()||loading)return;
    setLoading(true);setError(null);setArch(null);
    const phases=["Parsing spec...","Identifying layers...","Mapping components...","Building diagram..."];
    let pi=0; setPhase(phases[0]);
    const iv=setInterval(()=>{pi=(pi+1)%phases.length;setPhase(phases[pi]);},950);
    try{
      const res=await fetch("/api/architect",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({spec}),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Architecture generation failed");
      setArch(data);
    }catch(e){
      setError(e.message||"Architecture generation failed.");
    }finally{
      clearInterval(iv);setLoading(false);
    }
  }

  return(
    <div className="app">
      <div className="app-header">
        <div className="app-title-row">
          <i className="ti ti-code-circle-2" aria-hidden="true"/>
          <span className="app-title">SpecForge</span>
          <span className="phase-badge">Phase 1 · Architect</span>
        </div>
        <p className="app-subtitle">Describe your idea in plain English. Get a layered architecture with visual flow diagram.</p>
      </div>
      <div className="input-panel">
        <textarea value={spec} onChange={e=>setSpec(e.target.value)}
          onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")run();}}
          placeholder={"Describe your product idea...\n\nExamples:\n• AI-powered ATS\n• Chatbot application\n• Research agent that reads arXiv papers"}
        />
        <div className="input-footer">
          <span className="shortcut-hint">⌘↩ to run</span>
          <button onClick={run} disabled={loading||!spec.trim()} className="run-btn">
            {loading?(
              <span className="loading-row">
                <span className="dots">{[0,1,2].map(i=><span key={i} className={"dot dot"+i}/>)}</span>
                {phase}
              </span>
            ):"Architect this ↗"}
          </button>
        </div>
      </div>
      {error&&<p className="error-msg"><i className="ti ti-alert-triangle" aria-hidden="true"/> {error}</p>}
      {arch&&<ArchDiagram arch={arch}/>}
    </div>
  );
}
EOFcd /Applications/Projects-Claudcode/SpecForge/specforge/frontend
cat > src/App.jsx << 'EOF'
import { useState, useEffect } from "react";

const COLORS = {
  blue:"#378ADD", purple:"#7F77DD", teal:"#1D9E75",
  amber:"#BA7517", coral:"#D85A30", green:"#3B6D11", gray:"#888780",
};

function getIcon(id) {
  const s=(id||"").toLowerCase();
  if(s.includes("frontend")||s.includes("ui")||s.includes("client")||s.includes("user")||s.includes("msg")||s.includes("response")) return "ti-layout-2";
  if(s.includes("api")||s.includes("backend")||s.includes("server")||s.includes("gateway")) return "ti-server";
  if(s.includes("agent")||s.includes("logic")||s.includes("orchestrat")||s.includes("graph")) return "ti-robot";
  if(s.includes("llm")||s.includes("ai")||s.includes("model")||s.includes("inference")) return "ti-brain";
  if(s.includes("data")||s.includes("storage")||s.includes("db")||s.includes("vector")) return "ti-database";
  if(s.includes("auth")||s.includes("security")) return "ti-lock";
  if(s.includes("infra")||s.includes("deploy")||s.includes("cloud")) return "ti-cloud";
  return "ti-stack-2";
}

function layoutLayer(components,totalW,leftPad,gap){
  const n=components.length; if(n===0)return[];
  const maxNodeW=170;
  const totalIfMax=n*maxNodeW+(n-1)*gap;
  const nodeW=totalIfMax<=totalW?maxNodeW:Math.floor((totalW-(n-1)*gap)/n);
  const totalUsed=n*nodeW+(n-1)*gap;
  const startX=leftPad+(totalW-totalUsed)/2;
  return components.map((comp,i)=>({...comp,nodeW,x:startX+i*(nodeW+gap),cx:startX+i*(nodeW+gap)+nodeW/2}));
}

function trunc(s,nodeW,charW){
  const max=Math.floor((nodeW-22)/charW);
  const str=s||"";
  return str.length>max?str.slice(0,max-1)+"…":str;
}

// ── SVG Diagram ───────────────────────────────────────────────────────────────

function ArchSVG({arch}){
  const W=660,NODE_H=60,SLOT_H=112,LABEL_H=26,TOP_PAD=16,BOT_PAD=28;
  const layers=arch.layers||[];
  const H=TOP_PAD+layers.length*SLOT_H+BOT_PAD;
  const posMap={};
  const layerLayouts=layers.map((layer,li)=>{
    const color=COLORS[layer.color]||COLORS.gray;
    const layerY=TOP_PAD+li*SLOT_H;
    const nodeY=layerY+LABEL_H;
    const positions=layoutLayer(layer.components||[],620,20,16);
    positions.forEach(pos=>{posMap[pos.id]={...pos,y:nodeY,bottom:nodeY+NODE_H,cy:nodeY+NODE_H/2,color};});
    return{...layer,color,layerY,nodeY,positions};
  });
  let arrows=[];
  layers.forEach(layer=>{
    (layer.components||[]).forEach(comp=>{
      const from=posMap[comp.id]; if(!from)return;
      (comp.connects_to||[]).forEach(tid=>{const to=posMap[tid];if(to)arrows.push({from,to,color:from.color});});
    });
  });
  if(arrows.length===0){
    layers.forEach((layer,li)=>{
      const next=layers[li+1]; if(!next)return;
      (layer.components||[]).forEach(comp=>{
        const from=posMap[comp.id]; if(!from)return;
        (next.components||[]).forEach(nc=>{const to=posMap[nc.id];if(to)arrows.push({from,to,color:from.color});});
      });
    });
  }
  return(
    <svg width="100%" viewBox={"0 0 "+W+" "+H} role="img">
      <title>{"Architecture — "+arch.project_name}</title>
      <defs>
        <marker id="da" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </marker>
      </defs>
      {arrows.map((a,i)=>{
        const x1=a.from.cx,y1=a.from.bottom+2,x2=a.to.cx,y2=a.to.y-2,my=(y1+y2)/2,bx=(x1+x2)/2;
        return(
          <g key={i}>
            <path d={"M "+x1+" "+y1+" C "+x1+" "+my+", "+x2+" "+my+", "+x2+" "+y2} fill="none" stroke={a.color} strokeWidth="1.5" strokeOpacity="0.4" markerEnd="url(#da)"/>
            <circle cx={bx} cy={my} r="10" fill="var(--color-background-primary)" stroke={a.color} strokeWidth="0.75"/>
            <text x={bx} y={my} textAnchor="middle" dominantBaseline="central" style={{fontSize:"9px",fontWeight:600,fill:a.color,fontFamily:"var(--font-sans)"}}>
              {i+1}
            </text>
          </g>
        );
      })}
      {layerLayouts.map(layer=>(
        <g key={layer.id}>
          <text x="20" y={layer.layerY+17} style={{fontSize:"10px",fontFamily:"var(--font-sans)",fontWeight:600,fill:layer.color}}>
            {layer.name.toUpperCase()}
          </text>
          {layer.positions.map(pos=>{
            const p=posMap[pos.id]; if(!p)return null;
            return(
              <g key={pos.id}>
                <rect x={p.x} y={p.y} width={p.nodeW} height={NODE_H} rx="8" fill={layer.color+"14"} stroke={layer.color} strokeWidth="0.75"/>
                <text x={p.cx} y={p.y+24} textAnchor="middle" style={{fontSize:"13px",fontWeight:500,fontFamily:"var(--font-sans)",fill:"var(--color-text-primary)"}}>
                  {trunc(pos.name,p.nodeW,7.5)}
                </text>
                <text x={p.cx} y={p.y+44} textAnchor="middle" style={{fontSize:"10px",fontFamily:"var(--font-mono)",fill:layer.color,opacity:0.88}}>
                  {trunc(pos.tech||"",p.nodeW,6.5)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// ── Animate View ──────────────────────────────────────────────────────────────

function AnimateView({arch}){
  const flows=arch.key_flows||[];
  const layers=arch.layers||[];
  const total=flows.length;
  const sampleMsg=arch.sample_query||"Processing your request...";

  const flowColors=flows.map((_,i)=>{
    const li=Math.min(Math.floor(i*layers.length/Math.max(total,1)),layers.length-1);
    return COLORS[layers[li]?.color]||COLORS.gray;
  });

  const [step,setStep]=useState(-1);
  const [typed,setTyped]=useState("");
  const [playing,setPlaying]=useState(false);
  const [done,setDone]=useState(false);

  useEffect(()=>{
    if(!playing)return;
    if(step===0){
      let i=0; setTyped("");
      const iv=setInterval(()=>{
        i++;
        setTyped(sampleMsg.slice(0,i));
        if(i>=sampleMsg.length){clearInterval(iv);setTimeout(()=>setStep(1),700);}
      },38);
      return()=>clearInterval(iv);
    } else if(step>0&&step<=total){
      const t=setTimeout(()=>{
        if(step<total)setStep(s=>s+1);
        else{setPlaying(false);setDone(true);}
      },1800);
      return()=>clearTimeout(t);
    }
  },[step,playing]);

  const progressPct=step<=0?0:Math.min(((step-0.5)/total)*100,100);
  const dotColor=step>0&&step<=total?flowColors[step-1]:"#1D9E75";

  function play(){setStep(0);setTyped("");setDone(false);setPlaying(true);}
  function reset(){setStep(-1);setTyped("");setDone(false);setPlaying(false);}

  return(
    <div style={{padding:"20px 16px"}}>

      {/* User bubble */}
      <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:16}}>
        <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,background:"#378ADD15",border:"2px solid #378ADD",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <i className="ti ti-user" style={{fontSize:22,color:"#378ADD"}}/>
          {step===0&&playing&&<span style={{position:"absolute",bottom:1,right:1,width:11,height:11,borderRadius:"50%",background:"#1D9E75",border:"2px solid var(--color-background-primary)"}}/>}
        </div>
        <div style={{
          flex:1,
          background:step>=0?"#378ADD08":"var(--color-background-secondary)",
          border:`0.5px solid ${step>=0?"#378ADD55":"var(--color-border-tertiary)"}`,
          borderRadius:"16px 16px 16px 4px",
          padding:"10px 14px",fontSize:13.5,lineHeight:1.5,
          color:step>=0?"var(--color-text-primary)":"var(--color-text-tertiary)",
          fontStyle:step===-1?"italic":"normal",
          minHeight:44,display:"flex",alignItems:"center",
          transition:"all 0.35s ease",
        }}>
          {step===-1?"Hit play to simulate the data flow...":typed||" "}
          {step===0&&playing&&<span className="cursor-blink" style={{marginLeft:1}}>|</span>}
        </div>
      </div>

      {/* Pipeline: progress line + step cards */}
      <div style={{display:"flex",gap:14}}>

        {/* Vertical animated line */}
        <div style={{width:24,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:2}}>
          <div style={{position:"relative",flex:1,width:2,background:"var(--color-border-tertiary)",borderRadius:1}}>
            {/* Green fill trail */}
            <div style={{
              position:"absolute",top:0,left:0,width:"100%",
              height:progressPct+"%",
              background:"linear-gradient(to bottom, #1D9E75, "+dotColor+")",
              borderRadius:1,
              transition:"height 0.55s ease",
            }}/>
            {/* Moving dot */}
            {step>0&&(
              <div style={{
                position:"absolute",
                left:"50%",
                top:progressPct+"%",
                transform:"translate(-50%, -50%)",
                width:14,height:14,
                borderRadius:"50%",
                background:dotColor,
                boxShadow:"0 0 10px "+dotColor+"99",
                transition:"top 0.55s ease, background 0.3s ease, box-shadow 0.3s ease",
                zIndex:2,
              }}/>
            )}
          </div>
        </div>

        {/* Step cards */}
        <div style={{flex:1,display:"flex",flexDirection:"column",gap:8}}>
          {flows.map((flow,i)=>{
            const s=i+1;
            const isActive=step===s;
            const isDone=step>s||done;
            const isPending=step<s&&step>0;
            const color=flowColors[i];
            return(
              <div key={i} style={{
                padding:"11px 14px",
                borderRadius:"var(--radius-md)",
                border:`0.5px solid ${isActive?color:isDone?"#1D9E7544":"var(--color-border-tertiary)"}`,
                background:isActive?color+"12":isDone?"#1D9E7506":"var(--color-background-primary)",
                opacity:isPending?0.3:1,
                transition:"all 0.45s ease",
                display:"flex",gap:10,alignItems:"flex-start",
              }}>
                {/* Badge */}
                <div style={{
                  width:22,height:22,borderRadius:"50%",flexShrink:0,
                  background:isDone?"#1D9E75":isActive?color:"var(--color-background-secondary)",
                  border:`1.5px solid ${isDone?"#1D9E75":isActive?color:"var(--color-border-secondary)"}`,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  fontSize:10,fontWeight:600,
                  color:isDone||isActive?"#fff":"var(--color-text-tertiary)",
                  transition:"all 0.4s ease",
                }}>
                  {isDone?<i className="ti ti-check" style={{fontSize:11}}/>:s}
                </div>

                {/* Text */}
                <p style={{
                  margin:0,fontSize:13,lineHeight:1.5,flex:1,
                  color:isActive?"var(--color-text-primary)":isDone?"var(--color-text-secondary)":"var(--color-text-tertiary)",
                  transition:"color 0.35s ease",
                }}>
                  {flow}
                </p>

                {/* Active pulse dot */}
                {isActive&&(
                  <span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0,marginTop:5,animation:"pulse 1s ease infinite"}}/>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI response bubble */}
      <div style={{
        display:"flex",gap:12,alignItems:"flex-start",marginTop:16,
        opacity:done?1:0,
        transform:done?"translateY(0)":"translateY(8px)",
        transition:"all 0.5s ease",
        pointerEvents:done?"auto":"none",
      }}>
        <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,background:"#7F77DD15",border:"2px solid #7F77DD",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <i className="ti ti-robot" style={{fontSize:22,color:"#7F77DD"}}/>
        </div>
        <div style={{
          flex:1,background:"#7F77DD10",border:"0.5px solid #7F77DD44",
          borderRadius:"16px 16px 4px 16px",
          padding:"10px 14px",fontSize:13.5,
          color:"var(--color-text-primary)",
          display:"flex",alignItems:"center",gap:8,
        }}>
          <span style={{color:"#1D9E75",fontWeight:600,fontSize:15}}>✓</span>
          Response delivered through all {total} steps.
        </div>
      </div>

      {/* Controls */}
      <div style={{display:"flex",justifyContent:"center",marginTop:22,gap:8}}>
        {step===-1?(
          <button onClick={play} className="run-btn" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 20px"}}>
            <i className="ti ti-player-play" aria-hidden="true"/> Play flow animation
          </button>
        ):(
          <button onClick={reset} className="run-btn" style={{display:"flex",alignItems:"center",gap:6}}>
            <i className="ti ti-refresh" aria-hidden="true"/> Reset
          </button>
        )}
      </div>
    </div>
  );
}

// ── Cards View ────────────────────────────────────────────────────────────────

function ComponentCard({comp,color,delay}){
  return(
    <div className="comp-card" style={{animationDelay:delay+"s"}}>
      <div className="comp-name">{comp.name}</div>
      <span className="comp-tech" style={{background:color+"22",color}}>{comp.tech}</span>
      <div className="comp-purpose">{comp.purpose}</div>
    </div>
  );
}

function LayerRow({layer,idx,total}){
  const color=COLORS[layer.color]||COLORS.gray;
  const base=0.06+idx*0.13;
  return(
    <div>
      <div className="layer-row" style={{borderLeft:"3px solid "+color,animationDelay:base+"s"}}>
        <div className="layer-header">
          <div className="layer-icon" style={{background:color+"1e"}}>
            <i className={"ti "+getIcon(layer.id)} style={{fontSize:14,color}} aria-hidden="true"/>
          </div>
          <div className="layer-meta">
            <span className="layer-name">{layer.name}</span>
            {layer.description&&<span className="layer-desc">{layer.description}</span>}
          </div>
          <span className="layer-badge">L{idx+1}</span>
        </div>
        <div className="comp-grid">
          {(layer.components||[]).map((comp,ci)=>(
            <ComponentCard key={comp.id||ci} comp={comp} color={color} delay={base+0.07+ci*0.06}/>
          ))}
        </div>
      </div>
      {idx<total-1&&(
        <div className="layer-connector" style={{animationDelay:(base+0.12)+"s"}}>
          <svg width="18" height="26" viewBox="0 0 18 26" fill="none">
            <line x1="9" y1="0" x2="9" y2="17" stroke="var(--color-border-secondary)" strokeWidth="1.5" strokeDasharray="4 3"/>
            <polyline points="4,14 9,21 14,14" stroke="var(--color-border-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </div>
  );
}

// ── Architecture Output ───────────────────────────────────────────────────────

function ArchDiagram({arch}){
  const [view,setView]=useState("diagram");
  const [showJSON,setShowJSON]=useState(false);
  const numLayers=(arch.layers||[]).length;
  const flowDelay=0.06+numLayers*0.13+0.2;
  return(
    <div className="arch-output">
      <div className="arch-header fade-up">
        <div className="arch-header-left">
          <h3 className="arch-title">{arch.project_name}</h3>
          <p className="arch-summary">{arch.summary}</p>
        </div>
        <div className="arch-controls">
          <div className="view-toggle">
            {[
              ["diagram","ti-topology-star-2","Diagram"],
              ["cards","ti-layout-rows","Cards"],
              ["animate","ti-player-play","Animate"],
            ].map(([v,ic,label])=>(
              <button key={v} onClick={()=>setView(v)} className={"toggle-btn"+(view===v?" active":"")}>
                <i className={"ti "+ic} aria-hidden="true"/>{label}
              </button>
            ))}
          </div>
          <button className="json-btn" onClick={()=>setShowJSON(p=>!p)}>
            <i className="ti ti-code" aria-hidden="true"/> {showJSON?"Hide":"JSON"}
          </button>
        </div>
      </div>

      {showJSON&&<pre className="json-block fade-up">{JSON.stringify(arch,null,2)}</pre>}

      {view==="diagram"&&(
        <div className="diagram-wrap fade-up">
          <ArchSVG arch={arch}/>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 4px 0",fontSize:11,color:"var(--color-text-tertiary)"}}>
            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,borderRadius:"50%",border:"0.75px solid var(--color-border-secondary)",fontSize:9,fontWeight:600}}>1</span>
            <span>Numbers show the order of data flow through the system</span>
          </div>
        </div>
      )}

      {view==="cards"&&(
        <div className="cards-wrap">
          {(arch.layers||[]).map((layer,idx)=>(
            <LayerRow key={layer.id||idx} layer={layer} idx={idx} total={numLayers}/>
          ))}
        </div>
      )}

      {view==="animate"&&(
        <div className="diagram-wrap fade-up">
          <AnimateView arch={arch}/>
        </div>
      )}

      {view!=="animate"&&(arch.key_flows||[]).length>0&&(
        <div className="flows-section" style={{animationDelay:flowDelay+"s"}}>
          <div className="flows-header">
            <i className="ti ti-route" aria-hidden="true"/>
            <span>Message journey</span>
          </div>
          {arch.key_flows.map((flow,i)=>(
            <div key={i} className={"flow-item"+(i>0?" bordered":"")}>
              <span className="flow-num">{String(i+1).padStart(2,"0")}</span>
              <p className="flow-text">{flow}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SpecForge(){
  const [spec,setSpec]=useState("");
  const [loading,setLoading]=useState(false);
  const [phase,setPhase]=useState("");
  const [arch,setArch]=useState(null);
  const [error,setError]=useState(null);

  async function run(){
    if(!spec.trim()||loading)return;
    setLoading(true);setError(null);setArch(null);
    const phases=["Parsing spec...","Identifying layers...","Mapping components...","Building diagram..."];
    let pi=0; setPhase(phases[0]);
    const iv=setInterval(()=>{pi=(pi+1)%phases.length;setPhase(phases[pi]);},950);
    try{
      const res=await fetch("/api/architect",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({spec}),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Architecture generation failed");
      setArch(data);
    }catch(e){
      setError(e.message||"Architecture generation failed.");
    }finally{
      clearInterval(iv);setLoading(false);
    }
  }

  return(
    <div className="app">
      <div className="app-header">
        <div className="app-title-row">
          <i className="ti ti-code-circle-2" aria-hidden="true"/>
          <span className="app-title">SpecForge</span>
          <span className="phase-badge">Phase 1 · Architect</span>
        </div>
        <p className="app-subtitle">Describe your idea in plain English. Get a layered architecture with visual flow diagram.</p>
      </div>
      <div className="input-panel">
        <textarea value={spec} onChange={e=>setSpec(e.target.value)}
          onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")run();}}
          placeholder={"Describe your product idea...\n\nExamples:\n• AI-powered ATS\n• Chatbot application\n• Research agent that reads arXiv papers"}
        />
        <div className="input-footer">
          <span className="shortcut-hint">⌘↩ to run</span>
          <button onClick={run} disabled={loading||!spec.trim()} className="run-btn">
            {loading?(
              <span className="loading-row">
                <span className="dots">{[0,1,2].map(i=><span key={i} className={"dot dot"+i}/>)}</span>
                {phase}
              </span>
            ):"Architect this ↗"}
          </button>
        </div>
      </div>
      {error&&<p className="error-msg"><i className="ti ti-alert-triangle" aria-hidden="true"/> {error}</p>}
      {arch&&<ArchDiagram arch={arch}/>}
    </div>
  );
}
