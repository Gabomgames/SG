// Synthetic Firebase SDK for browser tests only. Never used by the application.

 const user={uid:'alice',displayName:'Alice',getIdToken:async()=> 'test-only',getIdTokenResult:async()=>({claims:{}})};
 const documentSnapshot=(data={})=>({id:'fixture',exists:()=>true,data:()=>data,metadata:{hasPendingWrites:false,fromCache:false}});
 const empty={docs:[],size:0,empty:true,metadata:{fromCache:false},docChanges:()=>[]};
 export const initializeApp=()=>({}),getAuth=()=>({currentUser:user,onAuthStateChanged:fn=>{queueMicrotask(()=>fn(user));return()=>{};}}),getFirestore=()=>({}),initializeFirestore=()=>({}),persistentLocalCache=()=>({}),persistentMultipleTabManager=()=>({});
 export class GoogleAuthProvider{};export class ReCaptchaEnterpriseProvider{};
 export const signOut=async()=>{},initializeAppCheck=()=>({}),getToken=async()=>({token:'fixture'}),signInWithPopup=async()=>({user}),onAuthStateChanged=(a,fn)=>{queueMicrotask(()=>fn(user));return()=>{};};
 export const doc=(...p)=>({path:p.slice(1).join('/')}),collection=(...p)=>({path:p.slice(1).join('/'),isCollection:true}),where=(...a)=>a,orderBy=(...a)=>a,limit=x=>x,limitToLast=x=>x,startAfter=x=>x,endBefore=x=>x,query=(...x)=>x;
 export const getCountFromServer=async()=>({data:()=>({count:0})});export const getDocs=async()=>empty,getDoc=async ref=>documentSnapshot(ref.path?.startsWith('users/')?{uid:'alice',name:'Alice',legal:{termsAccepted:true,termsVersion:'2026-09-16',privacyVersion:'2026-09-16',communityRulesVersion:'2026-09-16'}}:{name:'Alice',username:'alice',uid:'alice'}),getDocFromServer=getDoc;
 export const onSnapshot=(...args)=>{const fn=args.find(x=>typeof x==='function');queueMicrotask(()=>{if(Array.isArray(args[0])||args[0]?.isCollection)fn?.(empty);else getDoc(args[0]).then(fn)});return()=>{}},serverTimestamp=()=>({}),Timestamp={fromMillis:n=>n},setDoc=async()=>{},addDoc=async()=>({id:'fixture'}),updateDoc=async()=>{},deleteDoc=async()=>{},deleteField=()=>null,arrayUnion=(...x)=>x,arrayRemove=(...x)=>x,writeBatch=()=>({set(){},update(){},commit:async()=>{}}),terminate=async()=>{},clearIndexedDbPersistence=async()=>{};
export const startAt=(...a)=>a,endAt=(...a)=>a;
export const onIdTokenChanged=onAuthStateChanged;
export const getStorage=()=>({}),ref=(storage,path)=>({path});
export const uploadBytes=async()=>{throw new Error('Upload fixture not configured for this test');};
export const getDownloadURL=async()=>{throw new Error('Download fixture not configured for this test');};
export const createUserWithEmailAndPassword=async()=>{throw new Error('Registration fixture not configured for this test');};
export const signInWithEmailAndPassword=async()=>{throw new Error('Login fixture not configured for this test');};
export const sendEmailVerification=async()=>{throw new Error('Email fixture not configured for this test');};
export const sendPasswordResetEmail=async()=>{throw new Error('Password fixture not configured for this test');};
export const runTransaction=async(db,fn)=>fn({get:getDoc,set(){},update(){},delete(){}});
