/** Run ONLY on a trusted owner's machine with authorized Firebase Admin credentials. */
const {initializeApp,applicationDefault} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const uid=process.argv[2];
if(!uid||!/^[-_a-zA-Z0-9]{10,128}$/.test(uid)||process.argv[3]!=='--confirm-owner'){
 console.error('Uso: node scripts/provision-admin.cjs <UID_DO_PROPRIETARIO> --confirm-owner');process.exit(1);
}
if(process.env.GOOGLE_CLOUD_PROJECT!=='something-gamer'||process.env.SG_ADMIN_OWNER_UID!==uid){
 console.error('Defina GOOGLE_CLOUD_PROJECT=something-gamer e SG_ADMIN_OWNER_UID para o UID autorizado.');process.exit(1);
}
initializeApp({credential:applicationDefault(),projectId:'something-gamer'});
(async()=>{const auth=getAuth();const account=await auth.getUser(uid);const claims={...(account.customClaims||{}),admin:true};await auth.setCustomUserClaims(uid,claims);await auth.revokeRefreshTokens(uid);console.log('Permissão concedida à conta do proprietário. Faça login novamente para atualizar o token.');})().catch(e=>{console.error(e.message);process.exitCode=1});
