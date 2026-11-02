// Optimistic transaction fixture, NOT the Firestore emulator. It retries reads
// whose versions changed and commits all writes atomically in one event turn.
export class FounderStore {
  records=new Map(); versions=new Map(); retries=0;
  doc(path){return {path,id:path.split('/').at(-1)};}
  snapshot(ref){const data=this.records.get(ref.path);return {ref,id:ref.id,exists:data!==undefined,data:()=>structuredClone(data)};}
  put(path,data){this.records.set(path,structuredClone(data));this.versions.set(path,(this.versions.get(path)||0)+1);}
  collection(name){return {limit:n=>({get:async()=>({docs:[...this.records.keys()].filter(k=>k.startsWith(name+'/')&&k.split('/').length===2).slice(0,n).map(k=>this.snapshot(this.doc(k)))})})};}
  async runTransaction(fn){
    for(let attempt=0;attempt<500;attempt++){
      const reads=new Map(),writes=[];
      const tx={get:async ref=>{reads.set(ref.path,this.versions.get(ref.path)||0);return this.snapshot(ref);},
        create:(ref,data)=>writes.push({kind:'create',ref,data}),update:(ref,data)=>writes.push({kind:'update',ref,data}),set:(ref,data,options)=>writes.push({kind:options?.merge?'merge':'set',ref,data})};
      const result=await fn(tx);
      if([...reads].some(([key,version])=>(this.versions.get(key)||0)!==version)){this.retries++;continue;}
      for(const w of writes){if(w.kind==='create'&&this.records.has(w.ref.path))throw new Error('ALREADY_EXISTS');if(w.kind==='update'&&!this.records.has(w.ref.path))throw new Error('NOT_FOUND');}
      for(const w of writes)this.put(w.ref.path,['merge','update'].includes(w.kind)?{...this.records.get(w.ref.path),...w.data}:w.data);
      return result;
    }
    throw new Error('TRANSACTION_RETRIES_EXHAUSTED');
  }
}
