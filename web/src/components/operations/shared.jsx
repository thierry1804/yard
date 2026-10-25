import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../api/client';
export const LABELS = { REQUESTED:'Demandée', ASSIGNED:'Affectée', IN_PROGRESS:'En cours', BLOCKED:'Bloquée', COMPLETED:'Terminée', CANCELLED:'Annulée', PROPOSED:'Proposée', APPROVED:'Validée', OPEN:'Ouvert', CLOSED:'Clôturé', ARRIVED:'Arrivé', CHECKED:'Contrôlé', EXITED:'Sorti', SCHEDULED:'Prévu', VERIFIED:'Vérifié', DISCREPANCY:'Écart', RESOLVED:'Résolu', ESTIMATED:'Devis établi', AUTHORIZED:'Réparation autorisée', REJECTED:'Refusé', REPAIRED:'Réparé', ACKNOWLEDGED:'Acquittée', VALIDATED:'Validé', INVALID:'Invalide', APPLIED:'Appliqué', ARRIVAL:'Entrée', DEPARTURE:'Sortie', TRANSFER:'Transfert', MOVE:'Déplacement', CORRECTION:'Correction d’inventaire', COMPACT:'Compactage historique' };
export const formatTime = date => date ? new Date(date).toLocaleString('fr-FR', {timeZone:'Indian/Antananarivo', dateStyle:'short',timeStyle:'short'}) : '—';
export const position = c => c ? `${c.zoneId ?? c.zone} · B${String(c.col+1).padStart(2,'0')} · R${String(c.row+1).padStart(2,'0')} · T${c.tier}` : '—';
export function Field({label,children}) { const id = useId(); return <label className="ops-field" htmlFor={id}><span>{label}</span>{typeof children === 'function' ? children(id) : children}</label>; }
export function Badge({state}) { return <span className={`ops-badge state-${state.toLowerCase()}`}>{LABELS[state] || state}</span>; }
export function Empty({children='Aucun élément à afficher.'}) { return <p className="ops-empty">{children}</p>; }
export function useOps(path, params = {}, stamp = 0) {
  const key = JSON.stringify(params); const generation = useRef(0);
  const [state,setState] = useState({data:null,error:'',loading:true});
  useEffect(() => {
    let active = true;
    const fetch = async () => { const g = ++generation.current;
      try { const data = await api.opsGet(path, JSON.parse(key)); if (active && generation.current === g) setState({data,error:'',loading:false}); }
      catch(e) { if(active && generation.current === g) setState(s=>({...s,error:e.message,loading:false})); }
    };
    setState({data:null,error:'',loading:true}); fetch(); const timer = setInterval(fetch,20000);
    return () => {active=false; clearInterval(timer);};
  },[path,key,stamp]);
  return state;
}
export function DataState({state,children}) { return state.loading ? <p role="status">Chargement…</p> : state.error ? <p className="ops-error" role="alert">{state.error}</p> : children; }
export function exportCsv(filename, rows) {
  const cell = v => { let s=String(v??''); if (/^[=+@\-\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; };
  const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function ContainerSelect({containers,required=true,value,onChange}) { return <Field label="Conteneur">{id=><select id={id} required={required} value={value} onChange={onChange}><option value="">{required ? 'Choisir un conteneur' : 'Aucun / pas encore entré'}</option>{containers.map(c=><option key={c._dbId} value={c._dbId}>{c.id} · {position(c)}</option>)}</select>}</Field>; }
