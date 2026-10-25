import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildYardApp } from '../src/app';
import { YardService } from '../src/yard-service';
import { prisma, resetDb } from './helpers';
const svc = new YardService(prisma);
const app = buildYardApp({ service: svc, logger: false });
const admin = { 'x-user-id': 'u-admin', 'x-user-email': 'admin@ccis.mg', 'x-user-role': 'ADMIN' };
const op = { 'x-user-id': 'u-op', 'x-user-email': 'operator@ccis.mg', 'x-user-role': 'OPERATOR' };
const viewer = { 'x-user-id': 'u-viewer', 'x-user-role': 'VIEWER' };
async function call(url: string, body?: unknown, method: 'GET'|'POST'|'PATCH'|'PUT' = body ? 'POST' : 'GET', headers: Record<string,string> = admin) { return app.inject({ url, method, headers, ...(body ? { payload: body as never } : {}) }); }
async function ok(url: string, body?: unknown, method?: 'GET'|'POST'|'PATCH'|'PUT', headers: Record<string,string> = admin) { const r = await call(url,body,method,headers); expect(r.statusCode,r.body).toBeLessThan(300); return r.json(); }
async function arrive(row=1,col=2,type='FULL_20') { return ok('/containers/arrival',{type,zoneId:'A',row,col}); }
async function advance(task: { id:string;version:number }, state:string, extra={}) { return ok(`/operations/tasks/${task.id}`,{expectedVersion:task.version,state,...extra},'PATCH'); }
beforeEach(async()=>{await resetDb();await ok('/zones',{id:'A',rows:2,cols:3});});
afterAll(async()=>{await app.close();await prisma.$disconnect();});

describe('task execution and physical inventory',()=>{
 it('does not move until physical confirmation; audits every transition and prevents duplicate confirmation',async()=>{
  const ct=await arrive();let t=await ok('/operations/tasks',{containerId:ct.id,kind:'MOVE',targetZoneId:'A',targetRow:0,targetCol:0});
  expect((await ok(`/containers/${ct.id}`)).row).toBe(1);
  expect((await call('/operations/tasks',{containerId:ct.id,kind:'DEPARTURE'})).statusCode).toBe(409);
  expect((await call(`/operations/tasks/${t.id}`,{expectedVersion:1,state:'COMPLETED'},'PATCH')).statusCode).toBe(409);
  t=await advance(t,'ASSIGNED',{assignee:'admin@ccis.mg',equipment:'RS01'});t=await advance(t,'IN_PROGRESS');const old=t;
  t=await advance(t,'COMPLETED');expect(t.state).toBe('COMPLETED');expect((await ok(`/containers/${ct.id}`)).row).toBe(0);
  expect((await ok('/operations/task-summary'))).toMatchObject({activeCount:0,completedCount:1});
  expect(await ok('/operations/tasks?scope=active')).toHaveLength(0);expect(await ok('/operations/tasks?scope=all')).toHaveLength(1);
  expect((await call(`/operations/tasks/${old.id}`,{expectedVersion:old.version,state:'COMPLETED'},'PATCH')).statusCode).toBe(409);
  const audit=await ok('/operations/audit');expect(audit.items.filter((a:{kind:string})=>a.kind==='TASK')).toHaveLength(4);
 });
 it('rejects stale task sources without partially completing the task',async()=>{
  const ct=await arrive();let t=await ok('/operations/tasks',{containerId:ct.id,kind:'MOVE',targetZoneId:'A',targetRow:0,targetCol:0});
  t=await advance(t,'ASSIGNED',{assignee:'admin@ccis.mg'});t=await advance(t,'IN_PROGRESS');
  await ok(`/containers/${ct.id}/move`,{toZoneId:'A',toRow:1,toCol:1});
  expect((await call(`/operations/tasks/${t.id}`,{expectedVersion:t.version,state:'COMPLETED'},'PATCH')).statusCode).toBe(409);
  expect((await ok('/operations/tasks'))[0].state).toBe('IN_PROGRESS');
 });
 it('enforces customs holds, client holds and required release references on actual departures',async()=>{
  const ct=await arrive();
  const patch=async(customsStatus:string,clientHoldReason:string|null,releaseRequired:boolean,releaseReference:string|null)=>{
    const current=await ok(`/containers/${ct.id}`);return ok(`/operations/containers/${ct.id}/release`,{expectedVersion:current.version,customsStatus,clientHoldReason,releaseRequired,releaseReference},'PATCH');
  };
  await patch('HOLD',null,false,null);expect((await call(`/containers/${ct.id}/departure`,{})).statusCode).toBe(409);
  await patch('RELEASED','Client en attente',false,null);expect((await call(`/containers/${ct.id}/departure`,{})).statusCode).toBe(409);
  await patch('RELEASED',null,true,null);expect((await call(`/containers/${ct.id}/departure`,{})).statusCode).toBe(409);
  await patch('RELEASED',null,true,'REL123');expect((await ok(`/containers/${ct.id}/departure`,{})).status).toBe('DEPARTED');
 });
 it('enforces write roles and assignment ownership',async()=>{
  const ct=await arrive();expect((await call('/operations/tasks',{containerId:ct.id,kind:'DEPARTURE'},'POST',viewer)).statusCode).toBe(403);
  let t=await ok('/operations/tasks',{containerId:ct.id,kind:'DEPARTURE'});t=await advance(t,'ASSIGNED',{assignee:'admin@ccis.mg'});
  expect((await call(`/operations/tasks/${t.id}`,{expectedVersion:t.version,state:'IN_PROGRESS'},'PATCH',op)).statusCode).toBe(403);
  expect((await call('/operations/audit',undefined,'GET',viewer)).statusCode).toBe(403);
 });
});
describe('reorganization',()=>{
 it('previews without moving, then produces executable ordered tasks',async()=>{
  const ct=await arrive();const proposal=await ok('/operations/reorganization',{zoneId:'A'});expect(proposal.data.steps).toHaveLength(1);
  expect((await ok(`/containers/${ct.id}`)).row).toBe(1);
  await ok(`/operations/reorganization/${proposal.id}/approve`,{});
  expect((await ok(`/containers/${ct.id}`)).row).toBe(1);
  let task=(await ok('/operations/tasks'))[0];task=await advance(task,'ASSIGNED',{assignee:'admin@ccis.mg'});task=await advance(task,'IN_PROGRESS');await advance(task,'COMPLETED');expect((await ok(`/containers/${ct.id}`)).row).toBe(0);
 });
 it('rejects a stale plan and a non-supervisor approval',async()=>{
  await arrive();const plan=await ok('/operations/reorganization',{});
  expect((await call(`/operations/reorganization/${plan.id}/approve`,{},'POST',op)).statusCode).toBe(403);
  await arrive(0,1);expect((await call(`/operations/reorganization/${plan.id}/approve`,{})).statusCode).toBe(409);
  expect(await ok('/operations/tasks')).toHaveLength(0);
 });
});
describe('policies, records and imports',()=>{
 it('applies zone policies to arrivals and moves, and refuses incompatibility with existing stock',async()=>{
  const z=(await ok('/operations/policies'))[0];const policy={expectedVersion:z.version,maxTier:1,allowedTypes:['FULL_20'],blockedSlots:[{row:0,col:0}],maxWeightKg:10000,reeferOnly:false,reeferPlugs:null};
  await ok('/operations/policies/A',policy,'PATCH');
  expect((await call('/containers/arrival',{type:'FULL_20',zoneId:'A',row:0,col:0})).statusCode).toBe(409);
  expect((await call('/containers/arrival',{type:'FULL_40',zoneId:'A'})).statusCode).toBe(409);
  expect((await call('/containers/arrival',{type:'FULL_20',zoneId:'A',weightKg:11000})).statusCode).toBe(409);
  const ct=await arrive();expect((await call(`/containers/${ct.id}/move`,{toZoneId:'A',toRow:0,toCol:0})).statusCode).toBe(409);
  expect((await call('/operations/policies/A',{...policy,expectedVersion:2,blockedSlots:[{row:1,col:2}]},'PATCH')).statusCode).toBe(409);
 });
 it('records inspection, stock discrepancy and gate processing with immutable audit details',async()=>{
  const ct=await arrive();let record=await ok('/operations/records',{kind:'INSPECTION',containerId:ct.id,data:{phase:'ENTRY',condition:'DAMAGED',note:'Porte endommagée',estimate:10000,currency:'MGA',photos:[]}});
  record=await ok(`/operations/records/${record.id}`,{expectedVersion:1,status:'ESTIMATED',note:'Devis soumis'},'PATCH');
  expect((await call(`/operations/records/${record.id}`,{expectedVersion:2,status:'AUTHORIZED',note:'Accord'},'PATCH',op)).statusCode).toBe(403);
  record=await ok(`/operations/records/${record.id}`,{expectedVersion:2,status:'AUTHORIZED',note:'Accord superviseur'},'PATCH');expect(record.status).toBe('AUTHORIZED');
  const check=await ok('/operations/records',{kind:'STOCK_CHECK',containerId:ct.id,data:{observedZoneId:'A',observedRow:0,observedCol:0,present:true,note:'Mauvaise position'}});expect(check.data.expected).toMatchObject({row:1,col:2});
  expect((await ok(`/containers/${ct.id}`)).row).toBe(1);
  let gate=await ok('/operations/records',{kind:'GATE',containerId:ct.id,data:{truck:'T01',driver:'Test',carrier:'Carrier',reference:'REL1',direction:'PICKUP'}});
  gate=await ok(`/operations/records/${gate.id}`,{expectedVersion:1,status:'CHECKED',note:'Documents vérifiés'},'PATCH');expect((await call(`/operations/records/${gate.id}`,{expectedVersion:2,status:'EXITED',note:'Sortie'},'PATCH')).statusCode).toBe(409);
 });
 it('rejects overbooked appointments and invalid intervals',async()=>{
  await ok('/operations/settings',{gateCapacity:1},'PUT');const data={start:'2026-11-01T07:00:00+03:00',end:'2026-11-01T08:00:00+03:00',truck:'T01',carrier:'Carrier',reference:'REF1',direction:'PICKUP'};
  await ok('/operations/records',{kind:'APPOINTMENT',data});expect((await call('/operations/records',{kind:'APPOINTMENT',data})).statusCode).toBe(409);
  expect((await call('/operations/records',{kind:'APPOINTMENT',data:{...data,end:data.start}})).statusCode).toBe(400);
 });
 it('imports atomically, rejects duplicates and does not apply twice',async()=>{
  const rows=[{containerNo:'MSCU1234567',type:'FULL_20',zoneId:'A'},{containerNo:'MSCU1234568',type:'FULL_20',zoneId:'A'}];
  const preview=await ok('/operations/import/preview',{rows});expect(preview.status).toBe('VALIDATED');expect(await ok('/containers')).toHaveLength(0);
  await ok(`/operations/import/${preview.id}/apply`,{});expect(await ok('/containers')).toHaveLength(2);
  expect((await call(`/operations/import/${preview.id}/apply`,{})).statusCode).toBe(409);
  const invalid=await ok('/operations/import/preview',{rows});expect(invalid.status).toBe('INVALID');
  const partial=await ok('/operations/import/preview',{rows:[{containerNo:'MSCU1234569',type:'FULL_20',zoneId:'A'},{containerNo:'MSCU1234570',type:'FULL_40',zoneId:'A'}]});
  await ok('/operations/policies/A',{expectedVersion:1,maxTier:3,allowedTypes:['FULL_20'],blockedSlots:[],maxWeightKg:null,reeferOnly:false,reeferPlugs:null},'PATCH');
  expect((await call(`/operations/import/${partial.id}/apply`,{})).statusCode).toBe(409);
  expect(await ok('/containers')).toHaveLength(2);
 });
 it('paginates the journal with filters before limiting',async()=>{
  const ct=await arrive();await ok(`/containers/${ct.id}/move`,{toZoneId:'A',toRow:0,toCol:0});
  const journal=await ok('/operations/journal?type=MOVE&take=1&page=1');expect(journal.total).toBe(1);expect(journal.items[0].type).toBe('MOVE');expect((await ok('/operations/journal?type=MOVE&take=1&page=2')).items).toHaveLength(0);
 });
});

describe('physical checks and reefer interventions',()=>{
 it('corrects a verified discrepancy with a distinct inventory correction and rejects a stale correction',async()=>{
  const ct=await arrive();let check=await ok('/operations/records',{kind:'STOCK_CHECK',containerId:ct.id,data:{observedZoneId:'A',observedRow:0,observedCol:0,present:true,note:'Observé sur place'}});
  check=await ok(`/operations/records/${check.id}`,{expectedVersion:1,status:'DISCREPANCY',note:'Écart confirmé'},'PATCH');
  expect((await call(`/operations/records/${check.id}/reconcile`,{expectedVersion:check.version,note:'Correction terrain'},'POST',op)).statusCode).toBe(403);
  await ok(`/operations/records/${check.id}/reconcile`,{expectedVersion:check.version,note:'Position physique vérifiée par le superviseur'});
  expect((await ok(`/containers/${ct.id}`)).row).toBe(0);
  expect((await ok('/operations/journal?type=CORRECTION')).total).toBe(1);
  expect((await call(`/operations/records/${check.id}/reconcile`,{expectedVersion:check.version,note:'Bis'})).statusCode).toBe(409);
 });
 it('can record an unknown physical container without creating a fictitious arrival',async()=>{
  const check=await ok('/operations/records',{kind:'STOCK_CHECK',data:{observedContainerNo:'MSCU1234567',observedZoneId:'A',observedRow:0,observedCol:0,present:true,note:'Numéro absent du système'}});
  expect(check.data.expected).toBe(null);expect(await ok('/containers')).toHaveLength(0);
 });
 it('records only an active reefer alert and retains its measurement snapshot',async()=>{
  const ct=await arrive(0,0,'REEFER');await ok(`/containers/${ct.id}/reefer`,{currentTemp:45,powerStatus:'off'} ,'PATCH');
  const ack=await ok('/operations/records',{kind:'ALERT_ACK',containerId:ct.id,data:{category:'POWER',note:'Technicien prévenu'}});
  expect(ack.data.powerStatus).toBe('off');expect(ack.data.readingAt).toBeTruthy();
  await ok(`/containers/${ct.id}/reefer`,{powerStatus:'on'},'PATCH');
  expect((await call('/operations/records',{kind:'ALERT_ACK',containerId:ct.id,data:{category:'POWER',note:'Ancienne alarme'}})).statusCode).toBe(409);
 });
 it('requires an identified released container for pickup and a confirmed departure for truck exit',async()=>{
  const ct=await arrive();let gate=await ok('/operations/records',{kind:'GATE',data:{truck:'T01',driver:'Test',carrier:'Carrier',reference:'REF',direction:'PICKUP'}});
  expect((await call(`/operations/records/${gate.id}`,{expectedVersion:1,status:'CHECKED',note:'Documents'},'PATCH')).statusCode).toBe(409);
  gate=await ok(`/operations/records/${gate.id}`,{expectedVersion:1,status:'CHECKED',containerId:ct.id,note:'Conteneur et documents vérifiés'},'PATCH');
  expect((await call(`/operations/records/${gate.id}`,{expectedVersion:gate.version,status:'EXITED',note:'Départ camion'},'PATCH')).statusCode).toBe(409);
  await ok(`/containers/${ct.id}/departure`,{});
  expect((await ok(`/operations/records/${gate.id}`,{expectedVersion:gate.version,status:'EXITED',note:'Sortie physique confirmée'},'PATCH')).status).toBe('EXITED');
 });
});
