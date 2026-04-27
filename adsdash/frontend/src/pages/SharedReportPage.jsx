// ============================================================
// SharedReportPage.jsx — Página pública de informe por token
// Accesible sin login — muestra bloques del Constructor
// ============================================================
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const API = import.meta.env.VITE_API_URL || '';

const $   = n => '$' + Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const N   = n => Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:1});
const P   = n => Number(n||0).toFixed(2)+'%';
const R   = n => Number(n||0).toFixed(2)+'x';

const METRIC_LABELS = {
  impressions:'Impresiones', clicks:'Clics', ctr:'CTR', spend:'Inversión',
  purchases:'Compras', purchase_value:'Valor de compras', add_to_cart:'Ag. al carrito',
  checkout_initiated:'Pagos iniciados', frequency:'Frecuencia',
  cost_per_purchase:'Costo por compra', roas:'ROAS', ig_follows:'Seg. Instagram',
  conversions:'Conversiones', revenue:'Revenue', cpa:'CPA',
  reach:'Alcance', cpc:'CPC', cpm:'CPM',
};

const METRIC_FMT = {
  impressions:N, clicks:N, ctr:P, spend:$, purchases:N, purchase_value:$,
  add_to_cart:N, checkout_initiated:N, frequency:n=>Number(n||0).toFixed(2),
  cost_per_purchase:$, roas:R, ig_follows:N, conversions:N, revenue:$,
  cpa:$, reach:N, cpc:$, cpm:$,
};

const COLORS = ['#E8A020','#378ADD','#7F77DD','#34C78A','#FF6B6B','#4ECDC4'];

function Delta({curr,prev,invert=false}){
  if(prev==null||prev===0||curr==null) return null;
  const pct=((curr-prev)/Math.abs(prev))*100;
  const up=pct>=0; const good=invert?!up:up;
  return <span style={{fontSize:11,color:good?'#34C78A':'#FF4D6A',fontWeight:600,marginLeft:6}}>{up?'▲':'▼'} {Math.abs(pct).toFixed(1)}%</span>;
}

function CenteredMessage({icon,title,subtitle}){
  return(
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:12,padding:40,background:'#0A1628'}}>
      <div style={{fontSize:48}}>{icon}</div>
      <div style={{fontSize:20,fontWeight:700,color:'#fff'}}>{title}</div>
      <p style={{color:'#6B8AB8',textAlign:'center',maxWidth:400}}>{subtitle}</p>
      <div style={{marginTop:20,fontSize:13,color:'#4A6B9A'}}>PTI Analytics — pticonsultingpartner.com</div>
    </div>
  );
}

// ── Render de cada bloque ────────────────────────────────────
function SharedBlock({block, kpis={}, prevKpis={}, campaigns=[], timeSeries=[], ads=[]}){
  const cfg = block.config || {};

  // KPI Grid
  if(block.type==='kpi_grid'){
    const metrics = cfg.metrics || ['impressions','clicks','ctr','spend','purchases','purchase_value','roas'];
    return(
      <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(metrics.length,4)},1fr)`,gap:12}}>
        {metrics.map((key,i)=>{
          const label = METRIC_LABELS[key]||key;
          const fmt   = METRIC_FMT[key]||N;
          const val   = kpis[key]||0;
          const prev  = prevKpis[key];
          return(
            <div key={key} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderTop:`3px solid ${COLORS[i%COLORS.length]}`,borderRadius:12,padding:'14px 18px'}}>
              <div style={{fontSize:10,color:'#6B8AB8',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>{label}</div>
              <div style={{fontSize:22,fontWeight:700,color:'#fff',display:'flex',alignItems:'baseline',flexWrap:'wrap',gap:2}}>
                <span>{fmt(val)}</span>
                {prev!=null&&<Delta curr={parseFloat(val)} prev={parseFloat(prev)} invert={['cpa','cost_per_purchase','cpm','cpc','frequency'].includes(key)}/>}
              </div>
              {prev!=null&&<div style={{fontSize:11,color:'#4A6B9A',marginTop:4}}>Anterior: {fmt(prev)}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  // Campaigns table
  if(block.type==='campaigns'){
    const cols = cfg.columns||['name','platform','status','spend','purchases','purchase_value','add_to_cart','checkout_initiated','cost_per_purchase','roas','ctr'];
    const statusFilter = cfg.statusFilter||'all';
    const platFilter   = cfg.platform||'both';
    const filtered = campaigns.filter(c=>{
      const platOk = platFilter==='both'||(platFilter==='google'&&c.platform==='google_ads')||(platFilter==='meta'&&c.platform==='meta_ads');
      if(!platOk) return false;
      if(statusFilter==='active') return ['ENABLED','ACTIVE'].includes(c.status?.toUpperCase());
      if(statusFilter==='paused') return ['PAUSED','INACTIVE'].includes(c.status?.toUpperCase());
      if(statusFilter==='with_spend') return Number(c.spend||0)>0;
      return true;
    });
    const COL_RENDER = {
      name:c=><td style={{padding:'9px 12px',fontWeight:500,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#fff'}}>{c.name}</td>,
      platform:c=><td style={{padding:'9px 12px'}}><span style={{fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:700,background:c.platform==='google_ads'?'rgba(66,133,244,0.15)':'rgba(127,119,221,0.15)',color:c.platform==='google_ads'?'#378ADD':'#7F77DD'}}>{c.platform==='google_ads'?'Google':'Meta'}</span></td>,
      status:c=>{const a=['ENABLED','ACTIVE'].includes(c.status?.toUpperCase());return<td style={{padding:'9px 12px'}}><span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:'#ccc'}}><span style={{width:6,height:6,borderRadius:'50%',background:a?'#34C78A':'#FFB547'}}/>{a?'Activa':'Pausada'}</span></td>;},
      spend:c=><td style={{padding:'9px 12px',fontWeight:600,color:'#fff'}}>{$(c.spend)}</td>,
      impressions:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{N(c.impressions)}</td>,
      clicks:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{N(c.clicks)}</td>,
      ctr:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{P(c.ctr)}</td>,
      purchases:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{N(c.purchases||c.conversions)}</td>,
      purchase_value:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{$(c.purchase_value||c.revenue)}</td>,
      add_to_cart:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{N(c.add_to_cart)}</td>,
      checkout_initiated:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{N(c.checkout_initiated)}</td>,
      cost_per_purchase:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{$(c.cost_per_purchase||c.cpa)}</td>,
      roas:c=><td style={{padding:'9px 12px',color:c.roas>=4?'#34C78A':c.roas>0?'#E8A020':'#666',fontWeight:600}}>{R(c.roas)}</td>,
      frequency:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{Number(c.frequency||0).toFixed(2)}</td>,
      cpm:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{$(c.cpm)}</td>,
      cpc:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{$(c.cpc)}</td>,
      reach:c=><td style={{padding:'9px 12px',color:'#ccc'}}>{N(c.reach)}</td>,
    };
    return(
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr>{cols.map(k=><th key={k} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'#4A6B9A',borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap'}}>{METRIC_LABELS[k]||k}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((c,i)=><tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}>{cols.map(k=>{const r=COL_RENDER[k];return r?r(c):<td key={k} style={{padding:'9px 12px',color:'#ccc'}}>—</td>;})}</tr>)}
            {!filtered.length&&<tr><td colSpan={cols.length} style={{padding:30,textAlign:'center',color:'#4A6B9A'}}>Sin campañas</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  // Timeseries
  if(block.type==='timeseries'){
    const metric = cfg.metric||'spend';
    const kind   = cfg.chartKind||'line';
    const label  = METRIC_LABELS[metric]||metric;
    const fmt    = METRIC_FMT[metric]||N;
    if(!timeSeries.length) return <div style={{padding:30,textAlign:'center',color:'#4A6B9A'}}>Sin datos</div>;
    const Comp = kind==='bar'?BarChart:LineChart;
    return(
      <ResponsiveContainer width="100%" height={220}>
        <Comp data={timeSeries}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
          <XAxis dataKey="date" tick={{fontSize:10,fill:'#4A6B9A'}} tickFormatter={d=>d.slice(5)}/>
          <YAxis tick={{fontSize:10,fill:'#4A6B9A'}} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)}/>
          <Tooltip contentStyle={{background:'#1B2E4A',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontSize:12}} formatter={v=>[fmt(v),label]}/>
          {kind==='bar'?<Bar dataKey={metric} fill="#E8A020" radius={[4,4,0,0]}/>:<Line type="monotone" dataKey={metric} stroke="#E8A020" strokeWidth={2} dot={false}/>}
        </Comp>
      </ResponsiveContainer>
    );
  }

  // Meta ads
  if(block.type==='meta_ads'){
    const [sel,setSel] = useState(null);
    if(!ads.length) return <div style={{padding:30,textAlign:'center',color:'#4A6B9A'}}>Sin anuncios disponibles</div>;
    const thumbSize = cfg.thumbSize||'medium';
    const td = {small:{w:52,h:36},medium:{w:90,h:64},large:{w:140,h:100}}[thumbSize]||{w:90,h:64};
    const visibleCols = cfg.visibleCols||['spend','roas','purchases','purchase_value','add_to_cart','ctr'];
    return(
      <>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr>
              {['#','Creatividad','Anuncio','Campaña'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'#4A6B9A',borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap'}}>{h}</th>)}
              {visibleCols.map(k=><th key={k} style={{padding:'8px 12px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'#4A6B9A',borderBottom:'1px solid rgba(255,255,255,0.06)',whiteSpace:'nowrap'}}>{METRIC_LABELS[k]||k}</th>)}
            </tr></thead>
            <tbody>
              {ads.map((ad,i)=>(
                <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',cursor:'pointer'}}
                  onClick={()=>setSel(ad)}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={{padding:'9px 12px',color:'#4A6B9A',fontWeight:600}}>{i+1}</td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{width:td.w,height:td.h,borderRadius:5,overflow:'hidden',background:'#000',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      {ad.image_url?<img src={ad.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>:<span style={{opacity:0.3,fontSize:16}}>{ad.creative_type==='video'?'▶':'🖼'}</span>}
                    </div>
                  </td>
                  <td style={{padding:'9px 12px',fontWeight:500,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#fff'}}>{ad.name}</td>
                  <td style={{padding:'9px 12px',maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#4A6B9A',fontSize:11}}>{ad.campaign_name}</td>
                  {visibleCols.map(k=>{
                    const fmt=METRIC_FMT[k]||N;
                    const v=ad[k]??0;
                    const isRoas=k==='roas';
                    return<td key={k} style={{padding:'9px 12px',color:isRoas?(v>=4?'#34C78A':v>0?'#E8A020':'#666'):'#ccc',fontWeight:isRoas?600:400}}>{fmt(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sel&&(
          <div onClick={()=>setSel(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{background:'#1B2E4A',borderRadius:16,padding:24,maxWidth:600,width:'100%',maxHeight:'90vh',overflow:'auto',border:'1px solid rgba(255,255,255,0.1)'}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:14}}>
                <div>
                  <div style={{fontWeight:700,fontSize:15,color:'#fff'}}>{sel.name}</div>
                  <div style={{fontSize:12,color:'#4A6B9A',marginTop:3}}>{sel.campaign_name}</div>
                </div>
                <button onClick={()=>setSel(null)} style={{background:'none',border:'none',color:'#4A6B9A',fontSize:20,cursor:'pointer'}}>✕</button>
              </div>
              {sel.image_url&&(
                <div style={{borderRadius:10,overflow:'hidden',marginBottom:16,background:'#000',display:'flex',alignItems:'center',justifyContent:'center',maxHeight:360}}>
                  {sel.creative_type==='video'?<video src={sel.image_url} controls style={{maxWidth:'100%',maxHeight:360}}/>:<img src={sel.image_url} alt="" style={{maxWidth:'100%',maxHeight:360,objectFit:'contain'}}/>}
                </div>
              )}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
                {[['Inversión',$(sel.spend)],['ROAS',R(sel.roas)],['Compras',N(sel.purchases)],['Valor compras',$(sel.purchase_value)],['Ag. carrito',N(sel.add_to_cart)],['Checkout',N(sel.checkout_initiated)],['CTR',P(sel.ctr)],['Frecuencia',Number(sel.frequency||0).toFixed(2)],['CPM',$(sel.cpm)]].map(([l,v])=>(
                  <div key={l} style={{background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'8px 10px'}}>
                    <div style={{fontSize:9,color:'#4A6B9A',textTransform:'uppercase',marginBottom:3}}>{l}</div>
                    <div style={{fontSize:15,fontWeight:700,color:'#fff'}}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Custom text
  if(block.type==='custom_text'){
    return <div style={{fontSize:14,lineHeight:1.8,color:'#ccc',whiteSpace:'pre-wrap'}}>{cfg.text||''}</div>;
  }

  return null;
}

// ── Página principal ─────────────────────────────────────────
export default function SharedReportPage() {
  const { token } = useParams();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    axios.get(`${API}/api/reports/share/${token}`)
      .then(r => setData(r.data))
      .catch(e => {
        if (e.response?.status === 410) setExpired(true);
        else setError(e.response?.data?.error || 'Reporte no encontrado');
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <CenteredMessage icon="📊" title="Cargando reporte…" subtitle="Un momento por favor"/>;
  if (expired)  return <CenteredMessage icon="⏰" title="Link expirado" subtitle="Pedí un nuevo link al consultor de PTI."/>;
  if (error || !data) return <CenteredMessage icon="❌" title="Reporte no encontrado" subtitle={error||'El link no es válido.'}/>;

  const { report, metrics } = data;
  const config = report.config_json || {};
  const blocks = config.blocks || [];
  const clientName = report.client_name || 'Cliente';
  const startDate  = config.start_date || '';
  const endDate    = config.end_date   || '';

  // Armar kpis desde métricas guardadas
  const kpis = {};
  const byDate = {};
  for(const m of metrics){
    if(!byDate[m.date]) byDate[m.date]={date:m.date,spend:0,clicks:0,impressions:0,conversions:0,revenue:0};
    byDate[m.date].spend       += Number(m.spend       ||0);
    byDate[m.date].clicks      += Number(m.clicks      ||0);
    byDate[m.date].impressions += Number(m.impressions ||0);
    byDate[m.date].conversions += Number(m.conversions ||0);
    byDate[m.date].revenue     += Number(m.revenue     ||0);
    kpis.spend       = (kpis.spend       ||0) + Number(m.spend       ||0);
    kpis.clicks      = (kpis.clicks      ||0) + Number(m.clicks      ||0);
    kpis.impressions = (kpis.impressions ||0) + Number(m.impressions ||0);
    kpis.conversions = (kpis.conversions ||0) + Number(m.conversions ||0);
    kpis.revenue     = (kpis.revenue     ||0) + Number(m.revenue     ||0);
  }
  kpis.roas = kpis.spend > 0 ? kpis.revenue / kpis.spend : 0;
  kpis.ctr  = kpis.impressions > 0 ? (kpis.clicks / kpis.impressions) * 100 : 0;
  const timeSeries = Object.values(byDate).sort((a,b)=>a.date.localeCompare(b.date));

  return (
    <div style={{background:'#0A1628',minHeight:'100vh',fontFamily:'Inter,sans-serif'}}>
      {/* Header */}
      <div style={{background:'#0D1F35',borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'16px 32px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{width:10,height:10,borderRadius:'50%',background:'#E8A020',display:'inline-block'}}/>
          <span style={{fontWeight:700,fontSize:16,color:'#fff'}}>PTI Analytics</span>
        </div>
        <div style={{fontSize:12,color:'#4A6B9A'}}>pticonsultingpartner.com</div>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'32px 24px'}}>
        {/* Título del informe */}
        <div style={{marginBottom:28,paddingBottom:16,borderBottom:'2px solid #E8A020',display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
          <div>
            <div style={{fontSize:12,color:'#4A6B9A',marginBottom:4}}>{clientName} · {startDate} → {endDate}</div>
            <div style={{fontSize:24,fontWeight:700,color:'#fff'}}>{report.name||'Informe de performance'}</div>
          </div>
          <div style={{fontSize:11,color:'#4A6B9A',textAlign:'right'}}>
            <div>Generado por PTI Analytics</div>
            <div style={{color:'#E8A020',fontWeight:600,marginTop:2}}>{report.created_by_name||''}</div>
          </div>
        </div>

        {/* Si no hay bloques, mostrar vista básica */}
        {blocks.length===0?(
          <div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
              {[['Inversión',$(kpis.spend)],['ROAS',R(kpis.roas)],['Conversiones',N(kpis.conversions)],['CTR',P(kpis.ctr)]].map(([l,v])=>(
                <div key={l} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'16px 18px'}}>
                  <div style={{fontSize:10,color:'#4A6B9A',textTransform:'uppercase',marginBottom:6}}>{l}</div>
                  <div style={{fontSize:22,fontWeight:700,color:'#fff'}}>{v}</div>
                </div>
              ))}
            </div>
            {timeSeries.length>0&&(
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:20,marginBottom:20}}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)"/>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:'#4A6B9A'}} tickFormatter={d=>d.slice(5)}/>
                    <YAxis tick={{fontSize:10,fill:'#4A6B9A'}}/>
                    <Tooltip contentStyle={{background:'#1B2E4A',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontSize:12}}/>
                    <Line type="monotone" dataKey="spend" stroke="#E8A020" strokeWidth={2} dot={false} name="Inversión"/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ):(
          // Renderizar bloques del Constructor
          blocks.map((block,i)=>(
            <div key={i} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,overflow:'hidden',marginBottom:18}}>
              <div style={{padding:'12px 18px',borderBottom:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)'}}>
                <span style={{fontWeight:600,fontSize:14,color:'#fff'}}>{block.config?.title||block.label}</span>
              </div>
              <div style={{padding:18}}>
                <SharedBlock
                  block={block}
                  kpis={kpis}
                  prevKpis={{}}
                  campaigns={[]}
                  timeSeries={timeSeries}
                  ads={[]}
                />
              </div>
            </div>
          ))
        )}

        {/* Footer */}
        <div style={{marginTop:40,paddingTop:20,borderTop:'1px solid rgba(255,255,255,0.06)',textAlign:'center',color:'#2A4A6A',fontSize:12}}>
          PTI Analytics — pticonsultingpartner.com — contacto@pticonsultingpartner.com
        </div>
      </div>
    </div>
  );
}
