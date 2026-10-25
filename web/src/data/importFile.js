// Internal exchange format. Quoted fields support delimiters, newlines and escaped quotes.
export function parseImportFile(text, filename = '') {
  const source = text.replace(/^\uFEFF/, '');
  if (filename.endsWith('.json') || source.trimStart().startsWith('[')) return JSON.parse(source);
  const delimiter = source.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const records = []; let row = []; let field = ''; let quoted = false;
  for (let i=0; i<source.length; i++) {
    const ch=source[i];
    if (ch==='"') { if (quoted && source[i+1]==='"') { field+='"'; i++; } else quoted=!quoted; }
    else if (ch===delimiter && !quoted) { row.push(field); field=''; }
    else if ((ch==='\n'||ch==='\r')&&!quoted) { if(ch==='\r'&&source[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))records.push(row);row=[];field=''; }
    else field+=ch;
  }
  if(quoted) throw new Error('CSV invalide : guillemet non fermé.');
  row.push(field);if(row.some(v=>v.trim()))records.push(row);
  const headers=records.shift()?.map(h=>h.trim());
  if(!headers||!['containerNo','type','zoneId'].every(h=>headers.includes(h))) throw new Error('Colonnes obligatoires : containerNo, type, zoneId.');
  if(new Set(headers).size!==headers.length)throw new Error('En-têtes CSV dupliqués.');
  return records.map((r,i)=>{if(r.length!==headers.length)throw new Error(`Ligne ${i+2} : nombre de colonnes incorrect.`);return Object.fromEntries(headers.flatMap((h,c)=>{let v=r[c].trim();if(!v)return[];if(h==='weightKg')return[[h,Number(v)]];if(h==='plannedExitDate'&&/^\d{4}-\d{2}-\d{2}$/.test(v))v+='T00:00:00+03:00';return[[h,v]];}));});
}
