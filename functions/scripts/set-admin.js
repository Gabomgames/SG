/**
 * Uso local, fora do app:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json node scripts/set-admin.js UID super_admin
 *
 * Nunca exponha uma service account no frontend, hosting ou repositório público.
 */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
const [uid, role='admin'] = process.argv.slice(2);
if (!uid) { console.error('Informe o UID.'); process.exit(1); }
if (!['admin','super_admin','moderator','support','finance'].includes(role)) { console.error('Role inválida.'); process.exit(1); }
(async()=>{
  const auth=getAuth();
  const record=await auth.getUser(uid);
  const claims={...(record.customClaims||{}),admin:['admin','super_admin'].includes(role),role};
  await auth.setCustomUserClaims(uid,claims);
  console.log(`Claims atualizadas para ${uid}: role=${role}`);
  console.log('O usuário deve sair e entrar novamente para receber o novo token.');
})().catch(e=>{console.error(e);process.exit(1)});
