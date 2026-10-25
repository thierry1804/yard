import { expect, it } from 'vitest';
import { parseImportFile } from './importFile';
it('parses semicolon exports with BOM, multiline quoted clients and escaped quotes',()=>{
 expect(parseImportFile('\uFEFFcontainerNo;type;zoneId;client;weightKg\r\nMSCU1234567;FULL_20;A;"Client; \"\"X\"\"\nLogistics";12000')).toEqual([{containerNo:'MSCU1234567',type:'FULL_20',zoneId:'A',client:'Client; "X"\nLogistics',weightKg:12000}]);
});
it('refuses malformed rows, duplicate headers and unclosed quotes',()=>{
 expect(()=>parseImportFile('containerNo,type,zoneId\nMSCU1234567,FULL_20')).toThrow();
 expect(()=>parseImportFile('containerNo,type,zoneId,zoneId\nA,B,C,D')).toThrow();
 expect(()=>parseImportFile('containerNo,type,zoneId\n"abc,FULL_20,A')).toThrow();
});
it('accepts JSON without changing its types',()=>{expect(parseImportFile('[{"weightKg":12000}]','f.json')).toEqual([{weightKg:12000}]);});
