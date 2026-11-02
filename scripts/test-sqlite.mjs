import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const candidates=process.platform==='win32'?[['py',['-3']],['python',[]],['python3',[]]]:[['python3',[]]];
const selected=candidates.find(([cmd,args])=>{
 const result=spawnSync(cmd,[...args,'-c','import sys; assert sys.version_info >= (3, 11)'],{cwd:root,stdio:'ignore'});
 return !result.error&&result.status===0;
});
if(!selected){console.error('[SG_TEST_BLOCKED] Python 3.11+ não encontrado. No Windows, instale Python com o launcher py.');process.exit(78);}
for(const file of ['tests/sqlite.test.py','tests/market-sql.test.py']){
 const result=spawnSync(selected[0],[...selected[1],file],{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
