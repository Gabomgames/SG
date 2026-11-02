const KEY='sg_call_audio_settings_v2';
const $=id=>document.getElementById(id);
let testStream=null,testCtx=null,testRaf=null,testRecorder=null,testChunks=[];
const defaults={inputId:'',outputId:'',echoCancellation:true,noiseSuppression:true,autoGainControl:true};
function load(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {...defaults}}}
function save(v){localStorage.setItem(KEY,JSON.stringify(v));}
function prefs(){return{inputId:$('callMicDevice')?.value||'',outputId:$('callOutputDevice')?.value||'',echoCancellation:$('callEcho')?.checked!==false,noiseSuppression:$('callNoise')?.checked!==false,autoGainControl:$('callGain')?.checked!==false}}
async function devices(){
 const p=load();
 const all=await navigator.mediaDevices.enumerateDevices();
 const ins=all.filter(d=>d.kind==='audioinput'),outs=all.filter(d=>d.kind==='audiooutput');
 const input=$('callMicDevice'),output=$('callOutputDevice');
 if(input){input.innerHTML='<option value="">Padrão do sistema</option>'+ins.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Microfone ${i+1}`}</option>`).join('');input.value=ins.some(d=>d.deviceId===p.inputId)?p.inputId:''}
 if(output){output.innerHTML='<option value="">Padrão do sistema</option>'+outs.map((d,i)=>`<option value="${d.deviceId}">${d.label||`Saída ${i+1}`}</option>`).join('');output.value=outs.some(d=>d.deviceId===p.outputId)?p.outputId:'';output.disabled=typeof HTMLMediaElement.prototype.setSinkId!=='function';}
}
function stopTest(){cancelAnimationFrame(testRaf);testRaf=null;testStream?.getTracks().forEach(t=>t.stop());testStream=null;testCtx?.close?.();testCtx=null;const bar=$('micLevelBar');if(bar)bar.style.width='0%';const btn=$('testMicButton');if(btn)btn.textContent='Testar microfone'}
async function startTest(){
 if(testStream){stopTest();$('micTestStatus').textContent='Teste encerrado.';return}
 try{
   const p=prefs();save(p);$('micTestStatus').textContent='Solicitando acesso ao microfone…';
   testStream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:p.inputId?{exact:p.inputId}:undefined,echoCancellation:p.echoCancellation,noiseSuppression:p.noiseSuppression,autoGainControl:p.autoGainControl,channelCount:1,sampleRate:{ideal:48000}}});
   await devices();
   testCtx=new (window.AudioContext||window.webkitAudioContext)();await testCtx.resume();const src=testCtx.createMediaStreamSource(testStream),an=testCtx.createAnalyser();an.fftSize=512;src.connect(an);const data=new Uint8Array(an.fftSize);
   $('testMicButton').textContent='Encerrar teste';$('micTestStatus').textContent='Microfone ativo. Fale normalmente e observe o nível.';
   const tick=()=>{an.getByteTimeDomainData(data);let sum=0;for(const x of data){const v=(x-128)/128;sum+=v*v}const rms=Math.sqrt(sum/data.length);const pct=Math.min(100,Math.max(2,Math.round(rms*420)));$('micLevelBar').style.width=pct+'%';$('micDbLabel').textContent=pct<8?'Muito baixo':pct<24?'Baixo':pct<65?'Bom':'Alto';testRaf=requestAnimationFrame(tick)};tick();
 }catch(e){stopTest();$('micTestStatus').textContent=e.name==='NotAllowedError'?'Microfone bloqueado. Permita o acesso no navegador e tente novamente.':'Não foi possível abrir o microfone: '+(e.message||e.name)}
}
async function recordSample(){
 if(typeof MediaRecorder==='undefined')return $('micTestStatus').textContent='Este navegador não suporta gravação de teste.';
 try{stopTest();const p=prefs();const stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:p.inputId?{exact:p.inputId}:undefined,echoCancellation:p.echoCancellation,noiseSuppression:p.noiseSuppression,autoGainControl:p.autoGainControl}});testChunks=[];const rec=new MediaRecorder(stream);testRecorder=rec;rec.ondataavailable=e=>e.data.size&&testChunks.push(e.data);rec.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(testChunks,{type:rec.mimeType||'audio/webm'}),url=URL.createObjectURL(blob),audio=$('micPlayback');audio.src=url;audio.hidden=false;if(p.outputId&&audio.setSinkId)await audio.setSinkId(p.outputId).catch(()=>{});audio.play().catch(()=>{});$('micTestStatus').textContent='Teste gravado. Você está ouvindo exatamente o que o SG captou.';setTimeout(()=>URL.revokeObjectURL(url),30000)};rec.start();$('micTestStatus').textContent='Gravando 5 segundos… fale agora.';setTimeout(()=>rec.state==='recording'&&rec.stop(),5000)}catch(e){$('micTestStatus').textContent='Não foi possível gravar o teste: '+(e.message||e.name)}
}
async function init(){
 if(!navigator.mediaDevices?.getUserMedia)return;
 const p=load();$('callEcho').checked=p.echoCancellation;$('callNoise').checked=p.noiseSuppression;$('callGain').checked=p.autoGainControl;
 await devices().catch(()=>{});
 ['callMicDevice','callOutputDevice','callEcho','callNoise','callGain'].forEach(id=>$(id)?.addEventListener('change',()=>save(prefs())));
 $('testMicButton')?.addEventListener('click',startTest);$('recordMicButton')?.addEventListener('click',recordSample);navigator.mediaDevices.addEventListener?.('devicechange',()=>devices().catch(()=>{}));
}
init();
