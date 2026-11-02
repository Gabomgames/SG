/** Servidor de desenvolvimento local sem dependências. Não usar em produção. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||5173);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm','.mp3':'audio/mpeg','.wav':'audio/wav','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end()}
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400);return res.end('URL inválida')}
 if(name==='/' )name='/index.html';
 const parts=name.split('/');
 if(parts.some(seg=>seg==='..'||seg.startsWith('.')||['node_modules','functions','something-gamer-api','scripts','tests','docs','dist','android-app','desktop-app','artifacts'].includes(seg))){res.writeHead(404);return res.end('Não encontrado')}
 const file=path.resolve(base,'.'+name);
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Não encontrado')}
 res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Something Gamer V69: http://localhost:${port}`));
