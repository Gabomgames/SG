import {chromium} from '@playwright/test';
try{
 const browser=await chromium.launch();await browser.close();
 console.log('Chromium preflight passed. No application tests ran in this step.');
}catch(error){
 console.error('[SG_TEST_BLOCKED] Chromium não pode iniciar. Instale com: npx playwright install chromium');
 console.error(error.message);process.exitCode=78;
}
