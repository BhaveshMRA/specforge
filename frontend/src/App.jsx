import React, { useState, useEffect, useRef } from "react";

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

// ── Step Scene (visual micro-animations per step) ────────────────────────────

function detectStepType(text){
  const t=(text||"").toLowerCase();
  if(t.match(/stream.*back|result.*back|response.*view|deliver.*user|return.*user|back.*to.*user/)) return "stream_back";
  if(t.match(/rank|score|sort|filter|top.?\d|match|priorit/)) return "ranking";
  if(t.match(/llm|synthes|generat|language.model|model.*answer|ai.*answer|answer.*using/)) return "ai_process";
  if(t.match(/vector|embed|semantic|similarity|encod/)) return "transform";
  if(t.match(/search|retriev|fetch|doc.?store|knowl|lookup/)) return "data_fetch";
  if(t.match(/pars|extract|convert|transform|process|chunk/)) return "transform";
  if(t.match(/auth|session|token|validat|securit|permiss/)) return "auth";
  if(t.match(/memory|histor|cache|store.*chat|convers.*manag/)) return "memory";
  if(t.match(/agent|orchestrat|coordinat|manag.*flow|dispatch/)) return "agent";
  if(t.match(/api.?gate|gateway|route|load.?balanc|forward/)) return "api_route";
  if(t.match(/submit|upload|input|type|send|user.*msg|query.*via|msg_input|user.*sub/)) return "user_input";
  return "default";
}

const SCENES={
  user_input: {
    src:["ti-user","User","#378ADD"],
    mid:["ti-file-description","sending"],
    dst:["ti-forms","Input","#378ADD"],
  },
  api_route:{
    src:["ti-server-2","API GW","#1D9E75"],
    mid:["ti-arrows-split","routing"],
    dst:["ti-sitemap","Router","#1D9E75"],
  },
  auth:{
    src:["ti-key","Auth","#D85A30"],
    mid:["ti-lock-open","token"],
    dst:["ti-shield-check","Secure","#D85A30"],
  },
  ai_process:{
    src:["ti-brain","Context","#7F77DD"],
    mid:["ti-sparkles","thinking"],
    dst:["ti-robot","LLM","#7F77DD"],
  },
  data_fetch:{
    src:["ti-zoom-code","Query","#1D9E75"],
    mid:["ti-arrows-right","fetching"],
    dst:["ti-database","Store","#1D9E75"],
  },
  transform:{
    src:["ti-file","Raw Data","#BA7517"],
    mid:["ti-settings","parsing"],
    dst:["ti-table","Structured","#BA7517"],
  },
  stream_back:{
    src:["ti-robot","AI","#7F77DD"],
    mid:["ti-wave-square","streaming"],
    dst:["ti-user","User","#378ADD"],
  },
  memory:{
    src:["ti-history","History","#1D9E75"],
    mid:["ti-arrow-bar-up","loading"],
    dst:["ti-database","Memory","#1D9E75"],
  },
  agent:{
    src:["ti-robot","Agent","#7F77DD"],
    mid:["ti-arrows-split","planning"],
    dst:["ti-subtask","Tasks","#7F77DD"],
  },
  ranking:{
    src:["ti-list-details","Results","#BA7517"],
    mid:["ti-sort-descending","ranking"],
    dst:["ti-trophy","Top K","#BA7517"],
  },
  default:{
    src:["ti-circle","Input","#888780"],
    mid:["ti-arrow-right","process"],
    dst:["ti-circle-check","Output","#888780"],
  },
};

function StepScene({text,color,isActive,isDone}){
  const type=detectStepType(text);
  const cfg=SCENES[type]||SCENES.default;
  const [sc,dc]=[cfg.src[2],cfg.dst[2]];

  if(isDone){
    return(
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          <i className={"ti "+cfg.src[0]} style={{fontSize:13,color:sc}}/>
          <span style={{fontSize:10,color:"var(--color-border-secondary)"}}>›</span>
          <i className={"ti "+cfg.dst[0]} style={{fontSize:13,color:dc}}/>
        </div>
        <p style={{margin:0,fontSize:12,color:"var(--color-text-tertiary)",lineHeight:1.4,flex:1,
          overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
          {text}
        </p>
      </div>
    );
  }

  if(!isActive){
    return(
      <p style={{margin:0,fontSize:13,color:"var(--color-text-tertiary)",lineHeight:1.5}}>{text}</p>
    );
  }

  // ── ACTIVE: full animated scene ───────────────────────────────────────────
  return(
    <div>
      <div style={{display:"flex",alignItems:"center",gap:0,height:72,padding:"0 4px"}}>

        {/* Source node */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,minWidth:62}}>
          <div style={{
            width:42,height:42,borderRadius:"50%",
            background:sc+"18",border:"1.5px solid "+sc+"70",
            display:"flex",alignItems:"center",justifyContent:"center",
            animation:"nodePulse 2s ease-in-out infinite",
            "--pulse-color":sc+"33",
          }}>
            <i className={"ti "+cfg.src[0]} style={{fontSize:19,color:sc}}/>
          </div>
          <span style={{fontSize:9,color:sc,fontWeight:700,letterSpacing:"0.4px",textTransform:"uppercase",textAlign:"center",lineHeight:1.1}}>
            {cfg.src[1]}
          </span>
        </div>

        {/* Animated track */}
        <div style={{flex:1,position:"relative",height:2,
          background:"linear-gradient(90deg, "+sc+"50, "+dc+"50)",
          borderRadius:2,marginBottom:12,
        }}>
          {/* Shimmer overlay */}
          <div style={{
            position:"absolute",inset:0,borderRadius:2,
            background:"linear-gradient(90deg, transparent 0%, "+color+"cc 50%, transparent 100%)",
            backgroundSize:"200% 100%",
            animation:"trackShimmer 3.2s linear infinite",
          }}/>
          {/* Traveling particle */}
          <div style={{
            position:"absolute",
            top:"50%",left:"-10%",
            transform:"translateY(-50%)",
            width:30,height:30,borderRadius:"50%",
            background:"var(--color-background-primary)",
            border:"1.5px solid "+color+"90",
            display:"flex",alignItems:"center",justifyContent:"center",
            animation:"particleFlow 3s ease-in-out infinite",
            zIndex:3,
            boxShadow:"0 0 8px "+color+"55",
          }}>
            <i className={"ti "+cfg.mid[0]} style={{fontSize:13,color:color}}/>
          </div>
          {/* Track label */}
          <span style={{
            position:"absolute",top:5,left:"50%",
            transform:"translateX(-50%)",
            fontSize:9,color:"var(--color-text-tertiary)",
            background:"var(--color-background-primary)",
            padding:"0 5px",whiteSpace:"nowrap",
          }}>
            {cfg.mid[1]}
          </span>
        </div>

        {/* Destination node */}
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,minWidth:62}}>
          <div style={{
            width:42,height:42,borderRadius:"50%",
            background:dc+"18",border:"1.5px solid "+dc+"70",
            display:"flex",alignItems:"center",justifyContent:"center",
          }}>
            <i className={"ti "+cfg.dst[0]} style={{fontSize:19,color:dc}}/>
          </div>
          <span style={{fontSize:9,color:dc,fontWeight:700,letterSpacing:"0.4px",textTransform:"uppercase",textAlign:"center",lineHeight:1.1}}>
            {cfg.dst[1]}
          </span>
        </div>
      </div>

      {/* Step description below scene */}
      <p style={{
        margin:"4px 0 0",fontSize:12,
        color:"var(--color-text-secondary)",lineHeight:1.45,
        textAlign:"center",fontStyle:"italic",
      }}>
        {text}
      </p>
    </div>
  );
}

// ── Animate View ──────────────────────────────────────────────────────────────

function AnimateView({arch}){
  const rawFlows=arch.key_flows||[];
  const layers=arch.layers||[];
  const sampleMsg=arch.sample_query||"Processing your request...";

  // Parse "Step 1: … → Step 2: …" into individual step strings
  const steps=[];
  rawFlows.forEach(flow=>{
    const parts=flow.split(/ → (?=Step\s*\d+:)/i);
    parts.forEach(p=>{if(p.trim())steps.push(p.trim());});
  });
  const total=steps.length;

  const stepColors=steps.map((_,i)=>{
    const li=Math.min(Math.floor(i*layers.length/Math.max(total,1)),layers.length-1);
    return COLORS[layers[li]?.color]||COLORS.gray;
  });

  const [phase,setPhase]=useState("idle");
  const [typed,setTyped]=useState("");
  const [activeStep,setActiveStep]=useState(-1);

  useEffect(()=>{
    if(phase!=="typing")return;
    let i=0; setTyped("");
    const iv=setInterval(()=>{
      i++;
      setTyped(sampleMsg.slice(0,i));
      if(i>=sampleMsg.length){
        clearInterval(iv);
        setTimeout(()=>{setPhase("stepping");setActiveStep(0);},500);
      }
    },38);
    return()=>clearInterval(iv);
  },[phase]);

  function start(){setPhase("typing");setTyped("");setActiveStep(-1);}
  function next(){
    if(activeStep<total-1) setActiveStep(s=>s+1);
    else setPhase("done");
  }
  function reset(){setPhase("idle");setTyped("");setActiveStep(-1);}

  const progressPct=
    phase==="idle"?0:
    phase==="typing"?0:
    phase==="done"?100:
    Math.round(((activeStep+0.5)/total)*100);

  const dotColor=
    phase==="stepping"&&activeStep>=0?stepColors[activeStep]:
    phase==="done"?"#1D9E75":COLORS.blue;

  const isTyping=phase==="typing";
  const isStepping=phase==="stepping";
  const isDone=phase==="done";

  return(
    <div style={{padding:"20px 16px"}}>

      {/* User message bubble */}
      <div style={{display:"flex",gap:12,alignItems:"flex-end",marginBottom:16}}>
        <div style={{width:46,height:46,borderRadius:"50%",flexShrink:0,background:"#378ADD15",border:"2px solid #378ADD",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <i className="ti ti-user" style={{fontSize:22,color:"#378ADD"}}/>
          {isTyping&&<span style={{position:"absolute",bottom:1,right:1,width:11,height:11,borderRadius:"50%",background:"#1D9E75",border:"2px solid var(--color-background-primary)"}}/>}
        </div>
        <div style={{
          flex:1,
          background:phase!=="idle"?"#378ADD08":"var(--color-background-secondary)",
          border:`0.5px solid ${phase!=="idle"?"#378ADD55":"var(--color-border-tertiary)"}`,
          borderRadius:"16px 16px 16px 4px",
          padding:"10px 14px",fontSize:13.5,lineHeight:1.5,
          color:phase!=="idle"?"var(--color-text-primary)":"var(--color-text-tertiary)",
          fontStyle:phase==="idle"?"italic":"normal",
          minHeight:44,display:"flex",alignItems:"center",
          transition:"all 0.35s ease",
        }}>
          {phase==="idle"?"Press Start to walk through the data flow step by step...":typed||" "}
          {isTyping&&<span className="cursor-blink" style={{marginLeft:1}}>|</span>}
        </div>
      </div>

      {/* Pipeline: vertical line + step cards */}
      <div style={{display:"flex",gap:14}}>

        {/* Vertical progress line */}
        <div style={{width:24,display:"flex",flexDirection:"column",alignItems:"center",paddingTop:2}}>
          <div style={{position:"relative",flex:1,width:2,background:"var(--color-border-tertiary)",borderRadius:1}}>
            <div style={{
              position:"absolute",top:0,left:0,width:"100%",
              height:progressPct+"%",
              background:"linear-gradient(to bottom, #1D9E75, "+dotColor+")",
              borderRadius:1,
              transition:"height 0.55s ease",
            }}/>
            {(isStepping||isDone)&&(
              <div style={{
                position:"absolute",left:"50%",
                top:progressPct+"%",
                transform:"translate(-50%, -50%)",
                width:14,height:14,borderRadius:"50%",
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
          {steps.map((step,i)=>{
            const isActive=isStepping&&activeStep===i;
            const isStepDone=isDone||(isStepping&&activeStep>i);
            const isPending=!isActive&&!isStepDone;
            const color=stepColors[i];
            return(
              <div key={i} style={{
                padding:isActive?"16px 16px 14px":"10px 14px",
                borderRadius:"var(--radius-md)",
                border:`0.5px solid ${isActive?color:isStepDone?"#1D9E7544":"var(--color-border-tertiary)"}`,
                background:isActive?color+"0e":isStepDone?"#1D9E7506":"var(--color-background-primary)",
                opacity:isPending&&phase!=="idle"?0.28:1,
                transition:"all 0.45s cubic-bezier(0.4,0,0.2,1)",
              }}>
                <div style={{display:"flex",gap:10,alignItems:isActive?"flex-start":"center"}}>
                  {/* Step badge */}
                  <div style={{
                    width:22,height:22,borderRadius:"50%",flexShrink:0,
                    background:isStepDone?"#1D9E75":isActive?color:"var(--color-background-secondary)",
                    border:`1.5px solid ${isStepDone?"#1D9E75":isActive?color:"var(--color-border-secondary)"}`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:10,fontWeight:600,
                    color:isStepDone||isActive?"#fff":"var(--color-text-tertiary)",
                    transition:"all 0.4s ease",
                    flexShrink:0,
                    marginTop:isActive?2:0,
                  }}>
                    {isStepDone?<i className="ti ti-check" style={{fontSize:11}}/>:i+1}
                  </div>

                  {/* Visual scene or text */}
                  <div style={{flex:1,minWidth:0}}>
                    <StepScene
                      text={step}
                      color={color}
                      isActive={isActive}
                      isDone={isStepDone}
                    />
                  </div>

                  {/* Active pulse dot */}
                  {isActive&&(
                    <span style={{width:8,height:8,borderRadius:"50%",background:color,flexShrink:0,marginTop:6,animation:"pulse 1s ease infinite"}}/>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI response bubble */}
      <div style={{
        display:"flex",gap:12,alignItems:"flex-start",marginTop:16,
        opacity:isDone?1:0,
        transform:isDone?"translateY(0)":"translateY(8px)",
        transition:"all 0.5s ease",
        pointerEvents:isDone?"auto":"none",
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
        {phase==="idle"&&(
          <button onClick={start} className="run-btn" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 22px"}}>
            <i className="ti ti-player-play" aria-hidden="true"/> Start
          </button>
        )}
        {isStepping&&(
          <>
            <button onClick={reset} className="run-btn" style={{
              display:"flex",alignItems:"center",gap:6,
              background:"transparent",border:"1px solid var(--color-border-secondary)",
              color:"var(--color-text-secondary)",
            }}>
              <i className="ti ti-refresh" aria-hidden="true"/> Reset
            </button>
            <button onClick={next} className="run-btn" style={{display:"flex",alignItems:"center",gap:6,padding:"8px 22px"}}>
              {activeStep<total-1?"Next":"Finish"} <i className="ti ti-arrow-right" aria-hidden="true"/>
            </button>
          </>
        )}
        {isDone&&(
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

// ── Feedback Panel ────────────────────────────────────────────────────────────

function computeChangelog(oldArch, newArch){
  const changes=[];
  // Always: summary comparison
  const ol=(oldArch.layers||[]), nl=(newArch.layers||[]);
  const oc_total=ol.reduce((s,l)=>s+(l.components||[]).length,0);
  const nc_total=nl.reduce((s,l)=>s+(l.components||[]).length,0);
  changes.push({type:"modified",label:`Layers: ${ol.length} → ${nl.length}  ·  Components: ${oc_total} → ${nc_total}  ·  Flows: ${(oldArch.key_flows||[]).length} → ${(newArch.key_flows||[]).length}`});
  
  // Project rename
  if(oldArch.project_name!==newArch.project_name) changes.push({type:"modified",label:`Project renamed: "${oldArch.project_name}" → "${newArch.project_name}"`});
  if(oldArch.summary!==newArch.summary) changes.push({type:"modified",label:`Project summary updated`});

  // Structural layer diff by ID
  const oldMap=new Map(ol.map(l=>[l.id,l]));
  const newMap=new Map(nl.map(l=>[l.id,l]));
  
  for(const [id,l] of newMap) {
    if(!oldMap.has(id)) changes.push({type:"added",label:`New layer: ${l.name}`});
    else {
      const o=oldMap.get(id);
      if(o.name!==l.name) changes.push({type:"modified",label:`Layer renamed: ${o.name} → ${l.name}`});
      if(o.description!==l.description) changes.push({type:"modified",label:`Layer description updated: ${l.name}`});
    }
  }
  for(const [id,l] of oldMap) if(!newMap.has(id)) changes.push({type:"removed",label:`Removed layer: ${l.name}`});
  
  // Component diff per layer
  for(const [id,olay] of oldMap){
    const nlay=newMap.get(id); if(!nlay) continue;
    const ocm=new Map((olay.components||[]).map(c=>[c.id,c]));
    const ncm=new Map((nlay.components||[]).map(c=>[c.id,c]));
    for(const [cid,c] of ncm) {
      if(!ocm.has(cid)) changes.push({type:"added",label:`Added to ${nlay.name}: ${c.name} (${c.tech})`});
      else {
        const o=ocm.get(cid);
        if(o.name!==c.name) changes.push({type:"modified",label:`Renamed in ${nlay.name}: ${o.name} → ${c.name}`});
        if(o.tech!==c.tech) changes.push({type:"modified",label:`Tech changed for ${c.name}: ${o.tech} → ${c.tech}`});
        if(o.purpose!==c.purpose) changes.push({type:"modified",label:`Purpose updated for ${c.name}`});
        const oc_conn = (o.connects_to||[]).join(",");
        const nc_conn = (c.connects_to||[]).join(",");
        if(oc_conn!==nc_conn) changes.push({type:"modified",label:`Connections updated for ${c.name}`});
      }
    }
    for(const [cid,c] of ocm) if(!ncm.has(cid)) changes.push({type:"removed",label:`Removed from ${olay.name}: ${c.name}`});
  }
  return changes;
}

function FeedbackPanel({arch,onRefine}){
  const [open,setOpen]=useState(false);
  const [feedback,setFeedback]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);
  const [changelog,setChangelog]=useState([]);
  const [chatHistory,setChatHistory]=useState([]);
  const [previousArch,setPreviousArch]=useState(null);
  const [attachedFiles,setAttachedFiles]=useState([]);
  const [uploading,setUploading]=useState(false);
  const fileRef=React.useRef(null);

  function handleFile(e){
    const files=Array.from(e.target.files||[]);
    if(files.length) setAttachedFiles(prev=>[...prev,...files.map(f=>({file:f,name:f.name}))]);
    e.target.value="";
  }
  function removeFile(i){setAttachedFiles(prev=>prev.filter((_,idx)=>idx!==i));}

  async function submit(){
    if((!feedback.trim()&&!attachedFiles.length)||loading)return;
    setLoading(true);setErr(null);
    try{
      const promptText = feedback.trim();
      let ctx = promptText;
      if(attachedFiles.length){
        setUploading(true);
        for(const af of attachedFiles){
          const form=new FormData();form.append("file",af.file);
          const ur=await fetch("/api/upload",{method:"POST",body:form});
          const ud=await ur.json();
          if(!ur.ok)throw new Error(ud.detail||"File upload failed");
          ctx+=`\n\n[DOCUMENT: ${af.name}]\n${ud.extracted_text}`;
        }
        if(!promptText) ctx="Reason based on attached documents."+ctx;
        setUploading(false);
      }
      
      setChatHistory(prev=>[...prev,{role:"user",message:promptText || "Attached documents."}]);
      setFeedback("");setAttachedFiles([]);
      
      const res=await fetch("/api/reason",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({existing_arch:arch,feedback:ctx,chat_history:chatHistory})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Reasoning failed");
      
      if(data.type==="chat"){
        setChatHistory(prev=>[...prev,{role:"assistant",message:data.message}]);
      }else if(data.type==="architecture" && data.architecture){
        setChatHistory(prev=>[...prev,{role:"system",message:"Architecture updated. See Change Log below."}]);
        setPreviousArch(arch);
        setChangelog(computeChangelog(arch,data.architecture));
        onRefine(data.architecture);
      }
    }catch(e){setErr(e.message||"Reasoning failed.");}
    finally{setLoading(false);setUploading(false);}
  }

  const CLR={added:"#1D9E75",removed:"#D85A30",modified:"#378ADD"};
  const ICO={added:"ti-plus",removed:"ti-minus",modified:"ti-arrows-exchange"};

  return(
    <div style={{marginTop:16,borderTop:"0.5px solid var(--color-border-tertiary)",paddingTop:12}}>
      <button onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:open?"var(--color-text-primary)":"var(--color-text-tertiary)",padding:"4px 0",transition:"color 0.2s",fontFamily:"var(--font-sans)"}}>
        <i className={"ti "+(open?"ti-chevron-up":"ti-brain")} style={{fontSize:14}}/>
        {open?"Close":"Reason Architecture 🧠"}
      </button>

      {open&&(
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8}} className="fade-up">
          {chatHistory.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,padding:"10px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--radius-md)",maxHeight:250,overflowY:"auto"}}>
              {chatHistory.map((msg,i)=>(
                <div key={i} style={{fontSize:12,fontFamily:"var(--font-sans)",display:"flex",gap:6,alignItems:"flex-start",color:msg.role==="user"?"var(--color-text-primary)":msg.role==="system"?"#1D9E75":"var(--color-text-secondary)"}}>
                  <i className={"ti "+(msg.role==="user"?"ti-user":msg.role==="system"?"ti-check":"ti-robot")} style={{marginTop:2,fontSize:14,opacity:0.8}}/>
                  <div style={{lineHeight:1.45,flex:1,wordBreak:"break-word"}}>{msg.message}</div>
                </div>
              ))}
            </div>
          )}
          <textarea value={feedback} onChange={e=>setFeedback(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")submit();}}
            placeholder={"Ask a question or request a change...\n\nExamples:\n• Where is the database located?\n• Add a Redis cache layer"}
            style={{width:"100%",minHeight:90,resize:"vertical",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--radius-md)",color:"var(--color-text-primary)",fontFamily:"var(--font-sans)",fontSize:13,padding:"10px 12px",lineHeight:1.55,outline:"none",boxSizing:"border-box"}}
          />
          {attachedFiles.map((af,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 10px",background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--radius-sm)"}}>
              <i className={uploading?"ti ti-loader":"ti ti-paperclip"} style={{fontSize:12,color:"var(--color-text-tertiary)",animation:uploading?"spin 1s linear infinite":"none"}}/>
              <span style={{fontSize:12,color:"var(--color-text-secondary)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{af.name}</span>
              <button onClick={()=>removeFile(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:15,lineHeight:1}}>×</button>
            </div>
          ))}
          {err&&<p style={{margin:0,fontSize:12,color:"#D85A30"}}>{err}</p>}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp" style={{display:"none"}} onChange={handleFile}/>
            <button onClick={()=>fileRef.current?.click()} disabled={loading} title="Attach file" style={{background:"none",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--radius-sm)",padding:"5px 10px",fontSize:11,color:"var(--color-text-tertiary)",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:"var(--font-sans)"}}>
              <i className="ti ti-paperclip" style={{fontSize:13}}/> Attach
            </button>
            <div style={{flex:1}}/>
            <button onClick={()=>{setOpen(false);setFeedback("");setErr(null);setAttachedFiles([]);setChatHistory([]);}} style={{background:"none",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--radius-sm)",padding:"6px 14px",fontSize:12,color:"var(--color-text-secondary)",cursor:"pointer",fontFamily:"var(--font-sans)"}}>Cancel</button>
            <button onClick={submit} disabled={loading||(!feedback.trim()&&!attachedFiles.length)} className="run-btn" style={{padding:"6px 16px",fontSize:12}}>
              {loading?(<span style={{display:"flex",alignItems:"center",gap:6}}><span className="dots">{[0,1,2].map(i=><span key={i} className={"dot dot"+i}/>)}</span>{uploading?"Extracting...":"Reasoning..."}</span>):<><i className="ti ti-brain"/> Reason ↗</>}
            </button>
          </div>
        </div>
      )}

      {changelog.length>0&&(
        <div style={{marginTop:12,padding:"12px 14px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--radius-md)"}} className="fade-up">
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,fontSize:12,fontWeight:600,color:"var(--color-text-primary)",fontFamily:"var(--font-sans)"}}>
            <i className="ti ti-git-compare" style={{fontSize:14,color:"var(--color-text-secondary)"}}/>
            Change Log
            <span style={{marginLeft:"auto",fontSize:10,fontWeight:400,color:"var(--color-text-tertiary)"}}>{changelog.length} change{changelog.length!==1?"s":""}</span>
            {previousArch&&(
              <button onClick={()=>{onRefine(previousArch);setChangelog([]);setPreviousArch(null);}} title="Undo this refinement" style={{marginLeft:10,background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--radius-sm)",padding:"3px 8px",fontSize:10,color:"var(--color-text-primary)",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:"var(--font-sans)",transition:"all 0.15s"}}>
                <i className="ti ti-arrow-back-up" style={{fontSize:12}}/> Rollback
              </button>
            )}
          </div>
          {changelog.map((c,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,padding:"4px 0",borderTop:i>0?"0.5px solid var(--color-border-tertiary)":"none"}}>
              <i className={"ti "+ICO[c.type]} style={{fontSize:11,color:CLR[c.type],marginTop:2,flexShrink:0}}/>
              <span style={{fontSize:12,color:"var(--color-text-secondary)",lineHeight:1.45,fontFamily:"var(--font-sans)"}}>{c.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SavePanel({arch, activeSaveId, onSaveComplete}){
  const [open,setOpen]=useState(false);
  const [name,setName]=useState("");
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState(false);
  const [err,setErr]=useState(null);

  async function save(){
    if(!name.trim()||saving)return;
    setSaving(true);setErr(null);
    try{
      const res=await fetch("/api/saves",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:name.trim(),arch}),
      });
      const d=await res.json();
      if(!res.ok)throw new Error(d.detail||"Save failed");
      if(onSaveComplete) onSaveComplete(d.id);
      setOpen(false);setName("");
      setToast(true);
      setTimeout(()=>setToast(false),2500);
    }catch(e){
      setErr(e.message||"Save failed.");
    }finally{
      setSaving(false);
    }
  }

  async function overwrite(){
    if(!activeSaveId)return;
    setSaving(true);setErr(null);
    try{
      const r=await fetch(`/api/saves/${activeSaveId}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"overwrite",arch})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.detail||"Overwrite failed");
      setToast(true);setTimeout(()=>setToast(false),2500);
      setOpen(false);
    }catch(e){setErr(e.message||"Failed to overwrite");}
    finally{setSaving(false);}
  }

  return(
    <div style={{position:"relative"}}>
      {/* Toast */}
      {toast&&(
        <div style={{
          position:"fixed",bottom:24,right:24,
          background:"#1D9E75",color:"#fff",
          borderRadius:"var(--radius-md)",
          padding:"10px 18px",fontSize:13,fontWeight:600,
          display:"flex",alignItems:"center",gap:8,
          boxShadow:"0 4px 20px #00000044",
          zIndex:200,animation:"fadeUp 0.3s ease",
        }}>
          <i className="ti ti-check"/> Saved!
        </div>
      )}

      <div style={{
        marginTop:12,
        display:"flex",alignItems:"center",justifyContent:"center",
        borderTop:"0.5px solid var(--color-border-tertiary)",
        paddingTop:14,gap:10,
      }}>
        {!open?(
          <div style={{display:"flex",gap:8}}>
            {activeSaveId && (
              <button onClick={overwrite} disabled={saving} style={{
                display:"flex",alignItems:"center",gap:6,
                background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",
                borderRadius:"var(--radius-sm)",padding:"7px 16px",
                fontSize:12,color:"var(--color-text-secondary)",cursor:"pointer",
                fontFamily:"var(--font-sans)",transition:"all 0.2s ease",
              }}>
                <i className={saving?"ti ti-loader":"ti ti-refresh"} style={{animation:saving?"spin 1s linear infinite":"none", fontSize:13}}/> Overwrite
              </button>
            )}
            <button onClick={()=>setOpen(true)} style={{
              display:"flex",alignItems:"center",gap:6,
              background:"none",border:"0.5px solid var(--color-border-secondary)",
              borderRadius:"var(--radius-sm)",padding:"7px 16px",
              fontSize:12,color:"var(--color-text-secondary)",cursor:"pointer",
              fontFamily:"var(--font-sans)",transition:"all 0.2s ease",
            }}>
              <i className="ti ti-device-floppy" style={{fontSize:13}}/> {activeSaveId ? "Save As" : "Save Architecture"}
            </button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:8,flex:1,maxWidth:420}} className="fade-up">
            <input
              autoFocus
              value={name}
              onChange={e=>setName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")save();if(e.key==="Escape"){setOpen(false);setName("");}}}
              placeholder={"Name this architecture..."}
              style={{
                flex:1,height:34,
                background:"var(--color-background-secondary)",
                border:"0.5px solid var(--color-border-secondary)",
                borderRadius:"var(--radius-sm)",
                color:"var(--color-text-primary)",
                fontFamily:"var(--font-sans)",fontSize:13,
                padding:"0 10px",outline:"none",
              }}
            />
            <button onClick={()=>{setOpen(false);setName("");setErr(null);}} style={{
              background:"none",border:"none",cursor:"pointer",
              color:"var(--color-text-tertiary)",padding:"0 4px",fontSize:16,
            }}>×</button>
            <button onClick={save} disabled={saving||!name.trim()} className="run-btn" style={{padding:"6px 14px",fontSize:12,height:34}}>
              {saving?"Saving...":"Save ↗"}
            </button>
          </div>
        )}
      </div>
      {err&&<p style={{textAlign:"center",margin:"6px 0 0",fontSize:12,color:"#D85A30"}}>{err}</p>}
    </div>
  );
}

// ── Hamburger Sidebar ──────────────────────────────────────────────────────────

function HamburgerSidebar({onLoad,theme,onToggleTheme}){
  const [open,setOpen]=useState(false);
  const [saves,setSaves]=useState([]);
  const [loadingList,setLoadingList]=useState(false);
  const [deletingId,setDeletingId]=useState(null);

  async function fetchSaves(){setLoadingList(true);try{const d=await fetch("/api/saves").then(r=>r.json());setSaves(Array.isArray(d)?d:[]);}catch{setSaves([]);}finally{setLoadingList(false);}}
  function toggle(){if(!open)fetchSaves();setOpen(o=>!o);}
  async function loadSave(id){const d=await fetch(`/api/saves/${id}`).then(r=>r.json());onLoad(d.arch, id);setOpen(false);}
  async function deleteSave(e,id){e.stopPropagation();setDeletingId(id);await fetch(`/api/saves/${id}`,{method:"DELETE"});setSaves(s=>s.filter(x=>x.id!==id));setDeletingId(null);}
  function fmt(iso){return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}

  return(
    <>
      <button onClick={toggle} aria-label="Menu" style={{position:"fixed",top:16,left:16,zIndex:300,width:38,height:38,borderRadius:"var(--radius-md)",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-secondary)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 2px 8px #00000033"}}>
        <i className={"ti "+(open?"ti-x":"ti-menu-2")} style={{fontSize:17,color:"var(--color-text-secondary)"}}/>
      </button>

      {open&&<div onClick={()=>setOpen(false)} style={{position:"fixed",inset:0,background:"#00000055",zIndex:290,animation:"fadeIn 0.2s ease"}}/>}

      <div style={{position:"fixed",top:0,left:0,bottom:0,width:280,background:"var(--color-background-secondary)",borderRight:"0.5px solid var(--color-border-secondary)",zIndex:295,transform:open?"translateX(0)":"translateX(-100%)",transition:"transform 0.3s cubic-bezier(0.4,0,0.2,1)",display:"flex",flexDirection:"column",boxShadow:open?"4px 0 24px #00000044":"none"}}>
        
        {/* Header */}
        <div style={{padding:"20px 16px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <i className="ti ti-code-circle-2" style={{fontSize:16,color:"var(--color-text-secondary)"}}/>
            <span style={{fontWeight:700,fontSize:14,color:"var(--color-text-primary)",fontFamily:"var(--font-sans)"}}>SpecForge</span>
          </div>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)",fontFamily:"var(--font-sans)"}}>Architect Agent</span>
        </div>

        {/* Theme toggle */}
        <div style={{padding:"12px 16px",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:"var(--color-text-secondary)",fontFamily:"var(--font-sans)"}}>Appearance</span>
            <button onClick={onToggleTheme} style={{display:"flex",alignItems:"center",gap:6,background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--radius-sm)",padding:"5px 10px",cursor:"pointer",fontSize:11,color:"var(--color-text-primary)",fontFamily:"var(--font-sans)",transition:"all 0.2s ease"}}>
              <i className={"ti "+(theme==="dark"?"ti-sun":"ti-moon")} style={{fontSize:13}}/>
              {theme==="dark"?"Light":"Dark"}
            </button>
          </div>
        </div>

        {/* Saves list */}
        <div style={{flex:1,overflowY:"auto",padding:"12px 0"}}>
          <div style={{padding:"0 16px 8px",fontSize:10,fontWeight:700,letterSpacing:"0.8px",color:"var(--color-text-tertiary)",textTransform:"uppercase",fontFamily:"var(--font-sans)"}}>Saved Architectures</div>
          {loadingList&&<div style={{padding:"20px 16px",color:"var(--color-text-tertiary)",fontSize:13,textAlign:"center"}}>Loading...</div>}
          {!loadingList&&saves.length===0&&(
            <div style={{padding:"20px 16px",color:"var(--color-text-tertiary)",fontSize:13,textAlign:"center"}}>
              <i className="ti ti-database-off" style={{fontSize:22,display:"block",marginBottom:8,opacity:0.4}}/>No saved architectures yet
            </div>
          )}
          {saves.map(s=>(
            <div key={s.id} onClick={()=>loadSave(s.id)} style={{padding:"10px 16px",cursor:"pointer",display:"flex",alignItems:"flex-start",gap:10,borderLeft:"2px solid transparent",transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="var(--color-background-primary)";e.currentTarget.style.borderLeftColor="#378ADD";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderLeftColor="transparent";}}>
              <i className="ti ti-topology-star-2" style={{fontSize:14,color:"var(--color-text-tertiary)",marginTop:2,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,color:"var(--color-text-primary)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"var(--font-sans)"}}>{s.name}</div>
                <div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:2,fontFamily:"var(--font-sans)"}}>
                  {s.project_name&&<span style={{marginRight:6,color:"var(--color-text-secondary)"}}>{s.project_name}</span>}{fmt(s.created_at)}
                </div>
              </div>
              <button onClick={e=>deleteSave(e,s.id)} disabled={deletingId===s.id} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:14,padding:"2px 4px",opacity:0.5}} onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.5"} aria-label="Delete">
                {deletingId===s.id?<i className="ti ti-loader" style={{animation:"spin 1s linear infinite"}}/>:<i className="ti ti-trash"/>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ArchDiagram({arch,onRefine,checkpoints,onCheckpoint,onLoadCheckpoint,activeSaveId,onSaveComplete}){
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
          {checkpoints && checkpoints.length > 0 && (
            <select onChange={e=>{const cp=checkpoints[e.target.value]; if(cp)onLoadCheckpoint(cp.arch);}} style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-secondary)",borderRadius:"var(--radius-md)",padding:"4px 8px",fontSize:11,color:"var(--color-text-secondary)",fontFamily:"var(--font-sans)",cursor:"pointer",outline:"none"}}>
              <option value="">Jump to Checkpoint...</option>
              {checkpoints.map((cp,i)=>(
                <option key={i} value={i}>🚩 {cp.time}</option>
              ))}
            </select>
          )}
          <button className="json-btn" onClick={onCheckpoint} title="Create Checkpoint">
            <i className="ti ti-flag"/> Checkpoint
          </button>
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

      {/* Feedback + Save */}
      <FeedbackPanel arch={arch} onRefine={onRefine}/>
      <SavePanel arch={arch} activeSaveId={activeSaveId} onSaveComplete={onSaveComplete}/>
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
  const [activeSaveId,setActiveSaveId]=useState(null);
  const [checkpoints,setCheckpoints]=useState([]);
  // ── Theme ───────────────────────────────────────────────────────────────
  const prefersDark=window.matchMedia("(prefers-color-scheme:dark)").matches;
  const [theme,setTheme]=useState(prefersDark?"dark":"light");
  React.useEffect(()=>{document.documentElement.setAttribute("data-theme",theme);},[theme]);
  function toggleTheme(){setTheme(t=>t==="dark"?"light":"dark");}

  // ── File attachment state ──────────────────────────────────────────────────
  const [attachedFiles,setAttachedFiles]=useState([]);   // [{file, name, charCount, extractedText}]
  const [uploading,setUploading]=useState(false);
  const fileInputRef=React.useRef(null);

  function handleFileSelect(e){
    const files=Array.from(e.target.files||[]);
    if(files.length) setAttachedFiles(prev=>[...prev,...files.map(f=>({file:f,name:f.name,charCount:null,extractedText:null}))]);
    e.target.value="";
  }

  function removeFile(i){setAttachedFiles(prev=>prev.filter((_,idx)=>idx!==i));}

  // ── Run ───────────────────────────────────────────────────────────────────
  async function run(){
    if((!spec.trim()&&!attachedFiles.length)||loading)return;
    setLoading(true);setError(null);setArch(null);setCheckpoints([]);setActiveSaveId(null);

    const phases=["Parsing spec...","Identifying layers...","Mapping components...","Building diagram..."];
    let pi=0; setPhase(phases[0]);
    const iv=setInterval(()=>{pi=(pi+1)%phases.length;setPhase(phases[pi]);},950);

    try{
      let combinedSpec=spec.trim();

      // Step 1: If files attached, extract text from each
      if(attachedFiles.length){
        setUploading(true);
        setPhase("Extracting document...");
        for(let i=0;i<attachedFiles.length;i++){
          const af=attachedFiles[i];
          const form=new FormData();form.append("file",af.file);
          const upRes=await fetch("/api/upload",{method:"POST",body:form});
          const upData=await upRes.json();
          if(!upRes.ok)throw new Error(upData.detail||"File extraction failed");
          setAttachedFiles(prev=>prev.map((f,idx)=>idx===i?{...f,charCount:upData.char_count}:f));
          combinedSpec+=`\n\n[DOCUMENT: ${af.name}]\n${upData.extracted_text}`;
        }
        if(!spec.trim()) combinedSpec="Architect a system based on attached documents."+combinedSpec;
        setUploading(false);
      }

      // Step 2: Generate architecture
      setPhase(phases[0]);
      const res=await fetch("/api/architect",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({spec:combinedSpec}),
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.detail||"Architecture generation failed");
      setArch(data);
    }catch(e){
      setError(e.message||"Architecture generation failed.");
    }finally{
      clearInterval(iv);setLoading(false);setUploading(false);
    }
  }

  const canRun=!loading&&(spec.trim().length>0||attachedFiles.length>0);

  return(
    <div className="app">
      <HamburgerSidebar onLoad={(data, id)=>{setArch(data);setActiveSaveId(id);setSpec("");setAttachedFiles([]);setCheckpoints([]);}} theme={theme} onToggleTheme={toggleTheme}/>
      <div className="app-header">
        <div className="app-title-row">
          <i className="ti ti-code-circle-2" aria-hidden="true"/>
          <span className="app-title">SpecForge</span>
          <span className="phase-badge">Phase 1 · Architect</span>
        </div>
        <p className="app-subtitle">Describe your idea in plain English. Attach a PDF, Word, or PPT for extra context.</p>
      </div>

      <div className="input-panel">
        <textarea value={spec} onChange={e=>setSpec(e.target.value)}
          onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==="Enter")run();}}
          placeholder={"Describe your product idea...\n\nExamples:\n• Build me an ATS app using the inputs of this PDF\n• AI-powered chatbot for customer support\n• Research agent that reads arXiv papers"}
        />

        {/* File badge */}
        {attachedFiles.map((af,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",background:"var(--color-background-primary)",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
            <i className={uploading?"ti ti-loader":"ti ti-paperclip"} style={{fontSize:13,color:"var(--color-text-tertiary)",animation:uploading?"spin 1s linear infinite":"none"}}/>
            <span style={{fontSize:12,color:"var(--color-text-secondary)",fontFamily:"var(--font-sans)",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {af.name}
              {af.charCount&&<span style={{marginLeft:6,color:"var(--color-text-tertiary)",fontSize:11}}>· {(af.charCount/1000).toFixed(1)}k chars</span>}
            </span>
            <button onClick={()=>removeFile(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--color-text-tertiary)",fontSize:16,padding:"0 2px",lineHeight:1}}>×</button>
          </div>
        ))}

        <div className="input-footer">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp"
            multiple
            style={{display:"none"}}
            onChange={handleFileSelect}
          />
          {/* Attach button */}
          <button
            onClick={()=>fileInputRef.current?.click()}
            disabled={loading}
            title="Attach PDF, Word, PPT, or image"
            style={{
              background:"none",border:"none",cursor:"pointer",
              color:attachedFiles.length?"var(--color-text-primary)":"var(--color-text-tertiary)",
              display:"flex",alignItems:"center",gap:5,
              fontSize:12,padding:"4px 6px",borderRadius:"var(--radius-sm)",
              fontFamily:"var(--font-sans)",transition:"color 0.2s ease",
            }}>
            <i className="ti ti-paperclip" style={{fontSize:15}}/>
            {!attachedFiles.length&&<span style={{fontSize:11}}>Attach</span>}
          </button>

          <span className="shortcut-hint" style={{marginLeft:"auto"}}>⌘↩ to run</span>
          <button onClick={run} disabled={!canRun} className="run-btn">
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
      {arch&&<ArchDiagram arch={arch} onRefine={setArch} checkpoints={checkpoints} onCheckpoint={()=>{setCheckpoints(prev=>[...prev,{time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),arch}])}} onLoadCheckpoint={setArch} activeSaveId={activeSaveId} onSaveComplete={setActiveSaveId}/>}
    </div>
  );
}
