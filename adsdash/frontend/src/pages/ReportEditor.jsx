// ============================================================
// ReportEditor.jsx — Constructor de informes personalizable
// Métricas a elección, comparación de períodos, top anuncios
// ============================================================
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format, subDays, subMonths, subYears, startOfMonth, endOfMonth } from 'date-fns';
import { clientsAPI, dashboardAPI, reportsAPI } from '../services/api';
import api from '../services/api';

const fmtUSD  = n => '$' + Number(n||0).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtNum  = n => Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:1});
const fmtPct  = n => Number(n||0).toFixed(2)+'%';
const fmtRoas = n => Number(n||0).toFixed(2)+'x';
const today   = () => format(new Date(),'yyyy-MM-dd');
const nDaysAgo = n => format(subDays(new Date(),n),'yyyy-MM-dd');

const ALL_METRICS = [
  {key:'total_spend',       label:'Inversión total',   fmt:fmtUSD,  color:'#E8A020'},
  {key:'roas',              label:'ROAS',              fmt:fmtRoas, color:'#34C78A'},
  {key:'total_conversions', label:'Conversiones',      fmt:fmtNum,  color:'#7F77DD'},
  {key:'ctr',               label:'CTR',               fmt:fmtPct,  color:'#378ADD'},
  {key:'cpa',               label:'CPA',               fmt:fmtUSD,  color:'#FF6B6B'},
  {key:'total_clicks',      label:'Clics',             fmt:fmtNum,  color:'#4ECDC4'},
  {key:'total_impressions', label:'Impresiones',       fmt:fmtNum,  color:'#95A5A6'},
  {key:'total_revenue',     label:'Revenue',           fmt:fmtUSD,  color:'#2ECC71'},
];

const CAMPAIGN_COLS = [
  {key:'name',        label:'Campaña'},
  {key:'platform',    label:'Plataforma'},
  {key:'status',      label:'Estado'},
  {key:'spend',       label:'Inversión',    fmt:fmtUSD},
  {key:'clicks',      label:'Clics',        fmt:fmtNum},
  {key:'impressions', label:'Impresiones',  fmt:fmtNum},
  {key:'conversions', label:'Conversiones', fmt:fmtNum},
  {key:'ctr',         label:'CTR',          fmt:fmtPct},
  {key:'cpc',         label:'CPC',          fmt:fmtUSD},
  {key:'roas',        label:'ROAS',         fmt:fmtRoas},
  {key:'revenue',     label:'Revenue',      fmt:fmtUSD},
];

const COMPARISON_OPTIONS = [
  {value:'prev',              label:'Período anterior equivalente'},
  {value:'prev_month',        label:'Mes anterior'},
  {value:'same_month_last_year',label:'Mismo mes año anterior'},
  {value:'prev_year',         label:'Año anterior (mismo período)'},
  {value:'custom',            label:'Período personalizado'},
];

const PRESETS = [
  {label:'Últimos 7 días',  value:'7d'},
  {label:'Últimos 14 días', value:'14d'},
  {label:'Últimos 30 días', value:'30d'},
  {label:'Este mes',        value:'this_month'},
  {label:'Mes pasado',      value:'last_month'},
  {label:'Personalizado',   value:'custom'},
];

function getDateRange(p){
  const now=new Date();
  switch(p){
    case '7d':        return {start:nDaysAgo(6),end:today()};
    case '14d':       return {start:nDaysAgo(13),end:today()};
    case '30d':       return {start:nDaysAgo(29),end:today()};
    case 'this_month':return {start:format(startOfMonth(now),'yyyy-MM-dd'),end:today()};
    case 'last_month':return {start:format(startOfMonth(subMonths(now,1)),'yyyy-MM-dd'),end:format(endOfMonth(subMonths(now,1)),'yyyy-MM-dd')};
    default:          return {start:nDaysAgo(29),end:today()};
  }
}

function getCompRange(type,s,e,cs,ce){
  const start=new Date(s),end=new Date(e);
  const days=Math.round((end-start)/(1000*60*60*24))+1;
  switch(type){
    case 'prev': return {start:format(subDays(start,days),'yyyy-MM-dd'),end:format(subDays(start,1),'yyyy-MM-dd')};
    case 'prev_month': return {start:format(startOfMonth(subMonths(start,1)),'yyyy-MM-dd'),end:format(endOfMonth(subMonths(start,1)),'yyyy-MM-dd')};
    case 'same_month_last_year': return {start:format(startOfMonth(subYears(start,1)),'yyyy-MM-dd'),end:format(endOfMonth(subYears(start,1)),'yyyy-MM-dd')};
    case 'prev_year': return {start:format(subYears(start,1),'yyyy-MM-dd'),end:format(subYears(end,1),'yyyy-MM-dd')};
    case 'custom': return {start:cs,end:ce};
    default: return null;
  }
}

function Delta({current,previous,invertColors=false}){
  if(!previous||previous===0) return null;
  const pct=((current-previous)/Math.abs(previous))*100;
  const up=pct>=0;
  const good=invertColors?!up:up;
  return <span style={{fontSize:11,color:good?'#34C78A':'#FF4D6A',fontWeight:600,marginLeft:4}}>{up?'▲':'▼'} {Math.abs(pct).toFixed(1)}%</span>;
}

function Toggle({checked,onChange,label}){
  return(
    <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',userSelect:'none'}}>
      <div onClick={onChange} style={{width:36,height:20,borderRadius:10,background:checked?'#E8A020':'var(--border)',position:'relative',transition:'background 0.2s',cursor:'pointer',flexShrink:0}}>
        <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,left:checked?18:2,transition:'left 0.2s'}}/>
      </div>
      <span style={{fontSize:13,color:'var(--text)'}}>{label}</span>
    </label>
  );
}

function CreativeModal({ad,onClose}){
  if(!ad) return null;
  const isVideo=ad.creative_type==='video'||(ad.creative_url&&(ad.creative_url.includes('.mp4')||ad.creative_url.includes('video')));
  return(
    <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000,padding:24}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--surface)',borderRadius:16,padding:24,maxWidth:640,width:'100%',maxHeight:'90vh',overflow:'auto',border:'1px solid var(--border)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{ad.name||ad.ad_name||'Anuncio'}</div>
            <div style={{fontSize:12,color:'var(--muted)'}}>{ad.campaign_name}</div>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--muted)',padding:4}}>✕</button>
        </div>
        <div style={{borderRadius:10,overflow:'hidden',marginBottom:16,background:'#000',minHeight:200,display:'flex',alignItems:'center',justifyContent:'center'}}>
          {ad.creative_url?(
            isVideo?(
              <video src={ad.creative_url} controls style={{maxWidth:'100%',maxHeight:400}}/>
            ):(
              <img src={ad.creative_url} alt="Creatividad" style={{maxWidth:'100%',maxHeight:400,objectFit:'contain'}}/>
            )
          ):ad.image_url?(
            <img src={ad.image_url} alt="Creatividad" style={{maxWidth:'100%',maxHeight:400,objectFit:'contain'}}/>
          ):(
            <div style={{color:'#fff',fontSize:14,opacity:0.5,padding:40,textAlign:'center'}}>
              Sin previsualización disponible.<br/>
              <span style={{fontSize:12}}>Conectá la cuenta de Meta para ver creatividades.</span>
            </div>
          )}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {[['Inversión',fmtUSD(ad.spend)],['ROAS',fmtRoas(ad.roas)],['Conversiones',fmtNum(ad.conversions)],['Clics',fmtNum(ad.clicks)],['CTR',fmtPct(ad.ctr)],['CPC',fmtUSD(ad.cpc)]].map(([l,v])=>(
            <div key={l} style={{background:'var(--bg)',borderRadius:8,padding:'10px 12px',border:'1px solid var(--border)'}}>
              <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',marginBottom:4}}>{l}</div>
              <div style={{fontSize:16,fontWeight:700}}>{v}</div>
            </div>
          ))}
        </div>
        {ad.ad_url&&<a href={ad.ad_url} target="_blank" rel="noopener noreferrer" style={{display:'block',marginTop:14,textAlign:'center',fontSize:13,color:'#E8A020',textDecoration:'none'}}>Ver anuncio en plataforma →</a>}
      </div>
    </div>
  );
}

function TopAdsSection({clientId,start,end,platform,limit}){
  const [ads,setAds]=useState([]);
  const [loading,setLoading]=useState(false);
  const [sortBy,setSortBy]=useState('roas');
  const [selectedAd,setSelectedAd]=useState(null);

  useEffect(()=>{
    if(!clientId||!start||!end) return;
    setLoading(true);
    api.get(`/ads/top/${clientId}`,{params:{start,end,platform:platform==='all'?undefined:platform,sort:sortBy,limit}})
      .then(r=>setAds(r.data||[]))
      .catch(()=>setAds([]))
      .finally(()=>setLoading(false));
  },[clientId,start,end,platform,sortBy,limit]);

  return(
    <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',marginTop:20}}>
      <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>Top anuncios</div>
          <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>Hacé clic en una fila para ver la imagen o video del anuncio</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:'var(--muted)'}}>Ordenar por:</span>
          <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',color:'var(--text)',fontSize:12,outline:'none'}}>
            {[['roas','ROAS'],['spend','Inversión'],['conversions','Conversiones'],['ctr','CTR'],['clicks','Clics']].map(([v,l])=>(
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      {loading?(
        <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>Cargando anuncios…</div>
      ):ads.length===0?(
        <div style={{padding:40,textAlign:'center',color:'var(--muted)',fontSize:13}}>
          No hay datos de anuncios disponibles.<br/>
          <span style={{fontSize:12}}>Importá datos vía Excel o conectá Meta Ads.</span>
        </div>
      ):(
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr>{['#','Anuncio','Campaña','Plataforma','Inversión','ROAS','Conv.','CTR','Creatividad'].map(h=>(
                <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {ads.map((ad,i)=>(
                <tr key={ad.ad_id||i} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  onClick={()=>setSelectedAd(ad)}>
                  <td style={{padding:'10px 14px',color:'var(--muted)',fontWeight:600}}>{i+1}</td>
                  <td style={{padding:'10px 14px',fontWeight:500,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ad.name||ad.ad_name||'—'}</td>
                  <td style={{padding:'10px 14px',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--muted)',fontSize:11}}>{ad.campaign_name||'—'}</td>
                  <td style={{padding:'10px 14px'}}>
                    <span style={{fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:700,background:ad.platform==='google_ads'?'rgba(66,133,244,0.15)':'rgba(127,119,221,0.15)',color:ad.platform==='google_ads'?'#378ADD':'#7F77DD'}}>
                      {ad.platform==='google_ads'?'Google':'Meta'}
                    </span>
                  </td>
                  <td style={{padding:'10px 14px',fontWeight:600}}>{fmtUSD(ad.spend)}</td>
                  <td style={{padding:'10px 14px',color:ad.roas>=3?'#34C78A':ad.roas>0?'#E8A020':'var(--muted)',fontWeight:600}}>{fmtRoas(ad.roas)}</td>
                  <td style={{padding:'10px 14px'}}>{fmtNum(ad.conversions)}</td>
                  <td style={{padding:'10px 14px'}}>{fmtPct(ad.ctr)}</td>
                  <td style={{padding:'10px 14px'}}>
                    {(ad.creative_url||ad.image_url)?(
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div style={{width:40,height:30,borderRadius:4,overflow:'hidden',background:'#111',flexShrink:0}}>
                          <img src={ad.image_url||ad.creative_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{e.target.style.display='none';}}/>
                        </div>
                        <span style={{fontSize:11,color:'#E8A020'}}>{ad.creative_type==='video'?'▶ Video':'🖼 Imagen'}</span>
                      </div>
                    ):(
                      <span style={{fontSize:11,color:'var(--muted)'}}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selectedAd&&<CreativeModal ad={selectedAd} onClose={()=>setSelectedAd(null)}/>}
    </div>
  );
}

export default function ReportEditor(){
  const navigate=useNavigate();
  const [clients,setClients]=useState([]);
  const [selectedClient,setSelectedClient]=useState('');
  const [preset,setPreset]=useState('30d');
  const [customStart,setCustomStart]=useState(nDaysAgo(29));
  const [customEnd,setCustomEnd]=useState(today());
  const [compType,setCompType]=useState('prev');
  const [compCustomStart,setCompCustomStart]=useState(nDaysAgo(59));
  const [compCustomEnd,setCompCustomEnd]=useState(nDaysAgo(30));
  const [showComparison,setShowComparison]=useState(true);
  const [platform,setPlatform]=useState('all');
  const [selectedKpis,setSelectedKpis]=useState(['total_spend','roas','total_conversions','ctr']);
  const [selectedCols,setSelectedCols]=useState(['name','platform','status','spend','clicks','conversions','roas','ctr']);
  const [chartType,setChartType]=useState('area');
  const [chartMetric,setChartMetric]=useState('total_spend');
  const [showKpis,setShowKpis]=useState(true);
  const [showChart,setShowChart]=useState(true);
  const [showCampaigns,setShowCampaigns]=useState(true);
  const [showTopAds,setShowTopAds]=useState(true);
  const [topAdsLimit,setTopAdsLimit]=useState(10);
  const [data,setData]=useState(null);
  const [prevData,setPrevData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [configTab,setConfigTab]=useState('metricas');
  const [reportName,setReportName]=useState('');
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    clientsAPI.list().then(r=>{
      const list=r.data||[];
      setClients(list);
      if(list.length>0) setSelectedClient(String(list[0].id));
    });
  },[]);

  const getRange=()=>preset==='custom'?{start:customStart,end:customEnd}:getDateRange(preset);

  const loadData=useCallback(async()=>{
    if(!selectedClient) return;
    setLoading(true); setData(null); setPrevData(null);
    try{
      const {start,end}=getRange();
      const res=await dashboardAPI.overview(selectedClient,start,end);
      setData(res.data);
      if(showComparison){
        const cr=getCompRange(compType,start,end,compCustomStart,compCustomEnd);
        if(cr){
          const pr=await dashboardAPI.overview(selectedClient,cr.start,cr.end);
          setPrevData(pr.data);
        }
      }
    }catch(e){console.error(e);}
    finally{setLoading(false);}
  },[selectedClient,preset,customStart,customEnd,showComparison,compType,compCustomStart,compCustomEnd]);

  const handlePrint=()=>{
    const {start,end}=getRange();
    const clientName=clients.find(c=>String(c.id)===selectedClient)?.name||'Cliente';
    const kpis=data?.kpis||{};
    const prevKpis=prevData?.kpis||{};
    const compLabel=COMPARISON_OPTIONS.find(o=>o.value===compType)?.label||'';
    const campaigns=(data?.campaigns||[]).filter(c=>platform==='all'||c.platform===platform);

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe PTI Analytics — ${clientName}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a2e;background:#fff;}@page{size:A4;margin:0;}
.cover{background:#0A1628;color:#fff;min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:60px;}
.dot{display:inline-block;width:12px;height:12px;border-radius:50%;background:#E8A020;margin-right:8px;vertical-align:middle;}
.logo{font-size:22px;font-weight:700;vertical-align:middle;}
.cover h1{font-size:32px;font-weight:700;margin:40px 0 16px;}
.meta{color:#8AAFD4;font-size:14px;line-height:2.2;}.meta strong{color:#fff;}
.page{padding:36px 44px;page-break-before:always;}
.ph{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #E8A020;padding-bottom:10px;margin-bottom:24px;}
.ls{font-size:13px;font-weight:700;color:#0A1628;}.ls span{color:#E8A020;}
h2{font-size:16px;color:#0A1628;margin:24px 0 14px;font-weight:700;border-left:3px solid #E8A020;padding-left:10px;}
.kg{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;}
.kc{background:#f8f9fc;border-radius:8px;padding:14px;border-top:3px solid #E8A020;}
.kl{font-size:9px;text-transform:uppercase;color:#6B8AB8;letter-spacing:1px;margin-bottom:6px;}
.kv{font-size:20px;font-weight:700;color:#0A1628;}.kp{font-size:10px;color:#999;margin-top:4px;}
.du{color:#34C78A;}.dd{color:#FF4D6A;}
table{width:100%;border-collapse:collapse;font-size:10px;}
th{background:#0A1628;color:#fff;padding:7px 9px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;}
td{padding:6px 9px;border-bottom:1px solid #e8edf5;}tr:nth-child(even) td{background:#f8f9fc;}
.bg{display:inline-block;padding:2px 7px;border-radius:10px;font-size:8px;font-weight:700;}
.goo{background:#EBF3FD;color:#378ADD;}.met{background:#F0EFFE;color:#7F77DD;}
.footer{margin-top:30px;padding-top:14px;border-top:1px solid #e0e8f0;text-align:center;color:#9AAFCC;font-size:9px;}
</style></head><body>
<div class="cover">
  <div><span class="dot"></span><span class="logo">PTI Analytics</span></div>
  <h1>Reporte de Performance Publicitario</h1>
  <div class="meta">
    <div><strong>Cliente:</strong> ${clientName}</div>
    <div><strong>Período:</strong> ${start} al ${end}</div>
    ${showComparison?`<div><strong>Comparación:</strong> ${compLabel}</div>`:''}
    <div><strong>Plataforma:</strong> ${platform==='all'?'Todas':platform==='google_ads'?'Google Ads':'Meta Ads'}</div>
    <div><strong>Generado:</strong> ${format(new Date(),'dd/MM/yyyy HH:mm')}</div>
  </div>
</div>
<div class="page">
  <div class="ph"><div class="ls">PTI <span>Analytics</span></div><div style="font-size:12px;color:#6B8AB8;">${clientName} · ${start} → ${end}</div></div>
  ${showKpis?`<h2>KPIs Principales</h2><div class="kg">
  ${selectedKpis.map(key=>{
    const m=ALL_METRICS.find(x=>x.key===key);
    const val=kpis[key];const prev=prevKpis[key];
    const pct=prev&&prev>0?((val-prev)/Math.abs(prev)*100).toFixed(1):null;
    return `<div class="kc"><div class="kl">${m?.label}</div><div class="kv">${m?.fmt(val)||'—'}${pct!==null?` <span class="${parseFloat(pct)>=0?'du':'dd'}" style="font-size:11px">${parseFloat(pct)>=0?'▲':'▼'}${Math.abs(pct)}%</span>`:''}</div>${showComparison&&prev?`<div class="kp">Anterior: ${m?.fmt(prev)}</div>`:''}</div>`;
  }).join('')}</div>`:''}
  ${showCampaigns?`<h2>Detalle de Campañas</h2><table><thead><tr>${selectedCols.map(k=>{const c=CAMPAIGN_COLS.find(x=>x.key===k);return`<th>${c?.label||k}</th>`;}).join('')}</tr></thead><tbody>
  ${campaigns.slice(0,30).map(c=>`<tr>${selectedCols.map(k=>{
    const col=CAMPAIGN_COLS.find(x=>x.key===k);
    if(k==='platform') return`<td><span class="bg ${c.platform==='google_ads'?'goo':'met'}">${c.platform==='google_ads'?'Google':'Meta'}</span></td>`;
    const v=c[k];return`<td>${col?.fmt?col.fmt(v):(v??'—')}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table>`:''}
  <div class="footer">PTI Analytics — pticonsultingpartner.com — contacto@pticonsultingpartner.com</div>
</div></body></html>`;

    const win=window.open('','_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(()=>win.print(),600);
  };

  const handleSave=async()=>{
    if(!reportName.trim()||!selectedClient) return;
    setSaving(true);
    try{
      const {start,end}=getRange();
      await reportsAPI.create({client_id:selectedClient,name:reportName,config:{
        start_date:start,end_date:end,platform,preset,comparison_type:compType,
        selected_kpis:selectedKpis,selected_cols:selectedCols,
        chart_type:chartType,chart_metric:chartMetric,
        show_kpis:showKpis,show_chart:showChart,show_campaigns:showCampaigns,show_top_ads:showTopAds,
      }});
      setSaved(true);setTimeout(()=>setSaved(false),3000);
    }catch(e){console.error(e);}finally{setSaving(false);}
  };

  const {start,end}=getRange();
  const kpis=data?.kpis||{};
  const prevKpis=prevData?.kpis||{};
  const timeSeries=Object.values(
    (data?.timeSeries||[]).reduce((m,r)=>{
      if(!m[r.date]) m[r.date]={date:r.date,spend:0,clicks:0,impressions:0,conversions:0,revenue:0};
      m[r.date].spend+=r.spend||0;m[r.date].clicks+=r.clicks||0;m[r.date].impressions+=r.impressions||0;
      m[r.date].conversions+=r.conversions||0;m[r.date].revenue+=r.revenue||0;
      return m;
    },{})
  ).sort((a,b)=>a.date.localeCompare(b.date));

  const campaigns=(data?.campaigns||[]).filter(c=>platform==='all'||c.platform===platform);
  const ChartWrapper=chartType==='bar'?BarChart:chartType==='line'?LineChart:AreaChart;
  const DataComp=chartType==='bar'?Bar:chartType==='line'?Line:Area;
  const chartMeta=ALL_METRICS.find(m=>m.key===chartMetric)||ALL_METRICS[0];
  const tsKey={'total_spend':'spend','total_clicks':'clicks','total_impressions':'impressions','total_conversions':'conversions','total_revenue':'revenue'}[chartMetric]||chartMetric;
  const compLabel=COMPARISON_OPTIONS.find(o=>o.value===compType)?.label||'';

  const TABS=[{id:'metricas',label:'KPIs'},{id:'tabla',label:'Tabla'},{id:'grafico',label:'Gráfico'},{id:'secciones',label:'Secciones'}];

  return(
    <div style={{display:'flex',height:'calc(100vh - 60px)',overflow:'hidden',background:'var(--bg)'}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* ── Panel izquierdo ── */}
      <div style={{width:272,flexShrink:0,background:'var(--surface)',borderRight:'1px solid var(--border)',overflow:'auto',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'16px 16px 0'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>Constructor de informe</div>
          <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>Personalizá cada sección</div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Cliente</div>
            <select value={selectedClient} onChange={e=>setSelectedClient(e.target.value)}
              style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Período</div>
            <select value={preset} onChange={e=>setPreset(e.target.value)}
              style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:13,outline:'none'}}>
              {PRESETS.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {preset==='custom'&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:6}}>
                <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
                <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
              </div>
            )}
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--muted)',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.5px'}}>Plataforma</div>
            <div style={{display:'flex',gap:4}}>
              {[['all','Todas'],['google_ads','Google'],['meta_ads','Meta']].map(([v,l])=>(
                <button key={v} onClick={()=>setPlatform(v)} style={{flex:1,padding:'6px 4px',borderRadius:6,border:'1px solid var(--border)',background:platform===v?'#E8A020':'var(--bg)',color:platform===v?'#fff':'var(--text)',cursor:'pointer',fontSize:11,fontWeight:platform===v?600:400}}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:14}}>
            <Toggle checked={showComparison} onChange={()=>setShowComparison(!showComparison)} label="Comparar períodos"/>
            {showComparison&&(
              <div style={{marginTop:8}}>
                <select value={compType} onChange={e=>setCompType(e.target.value)}
                  style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:12,outline:'none',marginTop:4}}>
                  {COMPARISON_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {compType==='custom'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:6}}>
                    <input type="date" value={compCustomStart} onChange={e=>setCompCustomStart(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
                    <input type="date" value={compCustomEnd} onChange={e=>setCompCustomEnd(e.target.value)} style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:11,outline:'none',width:'100%'}}/>
                  </div>
                )}
              </div>
            )}
          </div>

          <button onClick={loadData} disabled={loading||!selectedClient} style={{width:'100%',padding:'10px',borderRadius:8,border:'none',background:'#E8A020',color:'#fff',cursor:loading?'not-allowed':'pointer',fontSize:13,fontWeight:700,opacity:loading?0.6:1,marginBottom:14}}>
            {loading?'Cargando…':'Generar informe'}
          </button>
        </div>

        {/* Tabs de personalización */}
        <div style={{borderTop:'1px solid var(--border)'}}>
          <div style={{display:'flex',borderBottom:'1px solid var(--border)',padding:'0 8px'}}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setConfigTab(t.id)} style={{flex:1,padding:'8px 2px',border:'none',background:'none',cursor:'pointer',fontSize:10,fontWeight:configTab===t.id?700:400,color:configTab===t.id?'#E8A020':'var(--muted)',borderBottom:configTab===t.id?'2px solid #E8A020':'2px solid transparent'}}>{t.label}</button>
            ))}
          </div>
          <div style={{padding:14}}>
            {configTab==='metricas'&&(
              <div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:10}}>KPIs a mostrar en el informe</div>
                {ALL_METRICS.map(m=>(
                  <label key={m.key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                    <input type="checkbox" checked={selectedKpis.includes(m.key)} onChange={()=>setSelectedKpis(prev=>prev.includes(m.key)?prev.filter(k=>k!==m.key):[...prev,m.key])}/>
                    <span style={{width:8,height:8,borderRadius:'50%',background:m.color,flexShrink:0}}/>
                    <span style={{fontSize:12}}>{m.label}</span>
                  </label>
                ))}
              </div>
            )}
            {configTab==='tabla'&&(
              <div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:10}}>Columnas de la tabla</div>
                {CAMPAIGN_COLS.map(c=>(
                  <label key={c.key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                    <input type="checkbox" checked={selectedCols.includes(c.key)} onChange={()=>setSelectedCols(prev=>prev.includes(c.key)?prev.filter(k=>k!==c.key):[...prev,c.key])}/>
                    <span style={{fontSize:12}}>{c.label}</span>
                  </label>
                ))}
              </div>
            )}
            {configTab==='grafico'&&(
              <div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>Tipo de gráfico</div>
                <div style={{display:'flex',gap:4,marginBottom:14}}>
                  {[['area','Área'],['line','Líneas'],['bar','Barras']].map(([v,l])=>(
                    <button key={v} onClick={()=>setChartType(v)} style={{flex:1,padding:'6px 2px',borderRadius:6,border:'1px solid var(--border)',background:chartType===v?'#E8A020':'var(--bg)',color:chartType===v?'#fff':'var(--text)',cursor:'pointer',fontSize:11}}>{l}</button>
                  ))}
                </div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:8}}>Métrica del gráfico</div>
                {ALL_METRICS.map(m=>(
                  <label key={m.key} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,cursor:'pointer'}}>
                    <input type="radio" name="cm" checked={chartMetric===m.key} onChange={()=>setChartMetric(m.key)}/>
                    <span style={{fontSize:12}}>{m.label}</span>
                  </label>
                ))}
              </div>
            )}
            {configTab==='secciones'&&(
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                <Toggle checked={showKpis} onChange={()=>setShowKpis(!showKpis)} label="KPIs"/>
                <Toggle checked={showChart} onChange={()=>setShowChart(!showChart)} label="Gráfico"/>
                <Toggle checked={showCampaigns} onChange={()=>setShowCampaigns(!showCampaigns)} label="Tabla de campañas"/>
                <Toggle checked={showTopAds} onChange={()=>setShowTopAds(!showTopAds)} label="Top anuncios"/>
                {showTopAds&&(
                  <div>
                    <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>Cantidad de anuncios</div>
                    <select value={topAdsLimit} onChange={e=>setTopAdsLimit(Number(e.target.value))}
                      style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 8px',color:'var(--text)',fontSize:12,outline:'none'}}>
                      {[5,10,15,20].map(n=><option key={n} value={n}>Top {n}</option>)}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Guardar / exportar */}
        <div style={{marginTop:'auto',padding:14,borderTop:'1px solid var(--border)'}}>
          <input type="text" placeholder="Nombre del informe…" value={reportName} onChange={e=>setReportName(e.target.value)}
            style={{width:'100%',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 10px',color:'var(--text)',fontSize:12,outline:'none',marginBottom:8}}/>
          <div style={{display:'flex',gap:6}}>
            <button onClick={handleSave} disabled={saving||!data||!reportName.trim()} style={{flex:1,padding:'8px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',cursor:'pointer',fontSize:12,opacity:(!data||!reportName.trim())?0.4:1}}>
              {saved?'✓ Guardado':saving?'Guardando…':'💾 Guardar'}
            </button>
            <button onClick={handlePrint} disabled={!data} style={{flex:1,padding:'8px',borderRadius:7,border:'none',background:'#0A1628',color:'#fff',cursor:data?'pointer':'not-allowed',fontSize:12,opacity:data?1:0.4}}>
              ⬇ PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Área de vista previa ── */}
      <div style={{flex:1,overflow:'auto',padding:24}}>
        {!data&&!loading&&(
          <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'var(--muted)'}}>
            <div style={{fontSize:48,marginBottom:16}}>📊</div>
            <div style={{fontWeight:700,fontSize:18,marginBottom:8,color:'var(--text)'}}>Construí tu informe</div>
            <p style={{fontSize:14,textAlign:'center',maxWidth:360,lineHeight:1.6}}>Elegí el cliente, período y métricas en el panel izquierdo, luego hacé clic en <strong>Generar informe</strong>.</p>
          </div>
        )}

        {loading&&(
          <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:12,color:'var(--muted)'}}>
            <div style={{width:32,height:32,border:'3px solid var(--border)',borderTopColor:'#E8A020',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            <div style={{fontSize:14}}>Cargando datos…</div>
          </div>
        )}

        {data&&!loading&&(
          <>
            {/* Header */}
            <div style={{marginBottom:18,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>
                  {clients.find(c=>String(c.id)===selectedClient)?.name} · {start} → {end}
                  {showComparison&&<span style={{marginLeft:10,padding:'2px 8px',background:'rgba(232,160,32,0.1)',borderRadius:4,color:'#E8A020',fontSize:11}}>vs {compLabel}</span>}
                </div>
                <div style={{fontSize:20,fontWeight:700}}>{reportName||'Informe sin título'}</div>
              </div>
            </div>

            {/* KPIs */}
            {showKpis&&selectedKpis.length>0&&(
              <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(selectedKpis.length,4)},1fr)`,gap:12,marginBottom:18}}>
                {selectedKpis.map(key=>{
                  const m=ALL_METRICS.find(x=>x.key===key);
                  const val=kpis[key];const prev=prevKpis[key];
                  return(
                    <div key={key} style={{background:'var(--surface)',border:'1px solid var(--border)',borderTop:`3px solid ${m?.color}`,borderRadius:12,padding:'14px 18px'}}>
                      <div style={{fontSize:10,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'0.5px',marginBottom:6}}>{m?.label}</div>
                      <div style={{fontSize:22,fontWeight:700,display:'flex',alignItems:'baseline',flexWrap:'wrap',gap:2}}>
                        <span style={{color:m?.color}}>{m?.fmt(val)}</span>
                        {showComparison&&prev!=null&&<Delta current={parseFloat(val||0)} previous={parseFloat(prev||0)} invertColors={key==='cpa'}/>}
                      </div>
                      {showComparison&&prev!=null&&(
                        <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Anterior: {m?.fmt(prev)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Gráfico */}
            {showChart&&timeSeries.length>0&&(
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:20,marginBottom:18}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>Evolución — {chartMeta?.label}</div>
                <ResponsiveContainer width="100%" height={200}>
                  <ChartWrapper data={timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={d=>d.slice(5)}/>
                    <YAxis tick={{fontSize:10,fill:'var(--muted)'}} tickFormatter={v=>v>=1000?(v/1000).toFixed(0)+'k':v.toFixed(0)}/>
                    <Tooltip contentStyle={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}} formatter={v=>[chartMeta?.fmt(v),chartMeta?.label]}/>
                    {chartType==='area'&&<Area type="monotone" dataKey={tsKey} stroke={chartMeta?.color} fill={chartMeta?.color+'25'} strokeWidth={2} dot={false}/>}
                    {chartType==='bar'&&<Bar dataKey={tsKey} fill={chartMeta?.color} radius={[4,4,0,0]}/>}
                    {chartType==='line'&&<Line type="monotone" dataKey={tsKey} stroke={chartMeta?.color} strokeWidth={2} dot={false}/>}
                  </ChartWrapper>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabla campañas */}
            {showCampaigns&&(
              <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,overflow:'hidden',marginBottom:18}}>
                <div style={{padding:'12px 18px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:700,fontSize:14}}>Campañas ({campaigns.length})</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{start} → {end}</div>
                </div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead><tr>{selectedCols.map(k=>{const c=CAMPAIGN_COLS.find(x=>x.key===k);return(<th key={k} style={{padding:'9px 14px',textAlign:'left',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>{c?.label}</th>);})}</tr></thead>
                    <tbody>
                      {campaigns.map((c,i)=>(
                        <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                          {selectedCols.map(k=>{
                            const col=CAMPAIGN_COLS.find(x=>x.key===k);
                            if(k==='platform') return<td key={k} style={{padding:'10px 14px'}}><span style={{fontSize:10,padding:'2px 7px',borderRadius:4,fontWeight:700,background:c.platform==='google_ads'?'rgba(66,133,244,0.15)':'rgba(127,119,221,0.15)',color:c.platform==='google_ads'?'#378ADD':'#7F77DD'}}>{c.platform==='google_ads'?'Google':'Meta'}</span></td>;
                            if(k==='status') return<td key={k} style={{padding:'10px 14px'}}><span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11}}><span style={{width:6,height:6,borderRadius:'50%',background:['ENABLED','ACTIVE'].includes(c.status?.toUpperCase())?'#34C78A':'#FFB547'}}/>{['ENABLED','ACTIVE'].includes(c.status?.toUpperCase())?'Activa':'Pausada'}</span></td>;
                            if(k==='name') return<td key={k} style={{padding:'10px 14px',fontWeight:500,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c[k]}</td>;
                            const v=c[k];const isRoas=k==='roas';
                            return<td key={k} style={{padding:'10px 14px',color:isRoas?(v>=3?'#34C78A':v>0?'#E8A020':'var(--muted)'):'var(--text)',fontWeight:isRoas&&v>0?600:400}}>{col?.fmt?col.fmt(v):(v??'—')}</td>;
                          })}
                        </tr>
                      ))}
                      {campaigns.length===0&&<tr><td colSpan={selectedCols.length} style={{padding:40,textAlign:'center',color:'var(--muted)'}}>Sin campañas para este período</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top anuncios */}
            {showTopAds&&(
              <TopAdsSection clientId={selectedClient} start={start} end={end} platform={platform} limit={topAdsLimit}/>
            )}
          </>
        )}
      </div>
    </div>
  );
}
