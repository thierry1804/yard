import { useEffect, useRef, useState } from 'react';
import Inventory from './Inventory';
import Tasks from './Tasks';
import Reorganization from './Reorganization';
import Records from './Records';
import Journal from './Journal';
import Exchanges from './Exchanges';
import Settings from './Settings';
import Reefers from './Reefers';
import { useOps } from './shared';
import './operations.css';
const NAV=[['inventory','Inventaire'],['departures','Sorties prévues'],['tasks','Tâches terrain'],['reorganization','Réorganisation'],['gate','Passages camions'],['appointments','Rendez-vous'],['inspections','Inspections / réparations'],['stock','Contrôles physiques'],['reefers','Suivi reefer'],['journal','Journal / audit'],['exchanges','Échanges'],['settings','Paramètres métier']];
export default function OperationsHub({initialTab='inventory',zoneFilter,containers,stacks,zones,user,onClose,onLocate,onChanged}) {
 const [tab,setTab]=useState(initialTab);const [stamp,setStamp]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
 const hubRef=useRef(null);const mainRef=useRef(null);const closeRef=useRef(onClose);closeRef.current=onClose;
 const canWrite=['ADMIN','OPERATOR'].includes(user.role);const isAdmin=user.role==='ADMIN';
 useEffect(()=>{
   const previous=document.activeElement;
   hubRef.current?.querySelector('button')?.focus();
   const handler=e=>{
     const dialog=hubRef.current?.querySelector('.ops-confirm');
     if(e.key==='Escape'&&!dialog){e.preventDefault();closeRef.current();}
     if(e.key==='Tab'){
       const nodes=[...(dialog||hubRef.current)?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary')||[]].filter(el=>el.getClientRects().length);
       const first=nodes[0],last=nodes[nodes.length-1];
       if(e.shiftKey&&(document.activeElement===first||!hubRef.current?.contains(document.activeElement))){e.preventDefault();last?.focus();}
       else if(!e.shiftKey&&(document.activeElement===last||!hubRef.current?.contains(document.activeElement))){e.preventDefault();first?.focus();}
     }
   };
   document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
 },[]);
 useEffect(()=>{mainRef.current?.scrollTo(0,0);},[tab]);
 const action=async fn=>{if(busy)return false;setBusy(true);setError('');setSuccess('');try{await fn();await onChanged();setStamp(s=>s+1);setSuccess('Enregistrement effectué.');return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}};
 const taskData=useOps('task-summary',{},stamp);
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Indian/Antananarivo'});
 const common={taskSummary:taskData.data,containers,stacks,zones,user,action,stamp,canWrite,isAdmin,onLocate};
 return <section ref={hubRef} className="operations-hub" role="dialog" aria-modal="true" aria-labelledby="operations-title"><header className="ops-header"><div><p>CCIS · TOAMASINA</p><h2 id="operations-title">Opérations du dépôt</h2></div><span>{user.email} · {canWrite?'Exploitation':'Lecture seule'}</span><button onClick={onClose}>Retour au plan</button></header><div className="ops-layout"><nav aria-label="Modules d’exploitation">{NAV.map(([key,label])=><button key={key} aria-current={tab===key?'page':undefined} onClick={()=>{setTab(key);setError('');setSuccess('');}}>{label}</button>)}</nav><main ref={mainRef} className="ops-main"><div className="ops-page-heading"><h2>{NAV.find(([key])=>key===tab)?.[1]}</h2><button onClick={()=>{onChanged();setStamp(s=>s+1);}}>Actualiser</button></div>{error&&<p className="ops-error" role="alert">{error}</p>}{success&&<p className="ops-success" role="status">{success}</p>}<div className="ops-kpis ops-overview"><div><strong>{containers.filter(c=>c.exitDate&&c.exitDate<=today).length}</strong>Sorties dues</div><div><strong>{containers.filter(c=>c.customsStatus==='HOLD'||c.clientHoldReason||(c.releaseRequired&&!c.releaseReference)).length}</strong>Sorties bloquées</div><div><strong>{taskData.data?.activeCount??'—'}</strong>Tâches actives</div><div><strong>{taskData.data?.overdueCount??'—'}</strong>Tâches en retard</div><div><strong>{taskData.data?.completedCount??'—'}</strong>Tâches confirmées / 24 h</div><div><strong>{taskData.data?.truckTurnMinutes!=null?`${taskData.data.truckTurnMinutes} min`:'—'}</strong>Passage camion moyen / 24 h</div></div><fieldset className="ops-content" disabled={busy} aria-busy={busy}>
 {tab==='inventory'&&<Inventory {...common}/>}{tab==='departures'&&<Inventory {...common} departures/>}{tab==='tasks'&&<Tasks {...common}/>}{tab==='reorganization'&&<Reorganization {...common} initialZone={zoneFilter}/>}{({gate:'GATE',appointments:'APPOINTMENT',inspections:'INSPECTION',stock:'STOCK_CHECK'})[tab]&&<Records key={tab} {...common} kind={({gate:'GATE',appointments:'APPOINTMENT',inspections:'INSPECTION',stock:'STOCK_CHECK'})[tab]}/>}{tab==='reefers'&&<Reefers {...common}/>}{tab==='journal'&&<Journal {...common}/>}{tab==='exchanges'&&<Exchanges {...common}/>}{tab==='settings'&&<Settings {...common}/>}
 </fieldset></main></div></section>;
}
