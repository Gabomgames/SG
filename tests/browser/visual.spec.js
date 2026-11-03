import {readFileSync} from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import {test,expect} from '@playwright/test';
// Every unmocked external request is denied, including production APIs.
test.beforeEach(async({context})=>{
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());
  return url.origin==='http://127.0.0.1:4173' ? route.continue() : route.abort('blockedbyclient');
 });
});
// SDKs falsos são fixtures APENAS deste teste; nunca copiados ao Hosting.
async function sdkFixtures(page){
 const sdk=readFileSync(new URL('../fixtures/firebase-sdk.js',import.meta.url),'utf8');
 await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({status:200,contentType:'text/javascript',body:sdk}));
 await page.route('https://something-gamer-api.something-gamer-nowtech.workers.dev/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Pagamentos em preparação.',code:'PAYMENT_STORAGE_NOT_CONFIGURED'})}));
 await page.route('**/moderate',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({allowed:true,flagged:false,categories:[]})}));
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
}
for(const width of [320,375,768,1440,1920])test(`index responsivo ${width}px`,async({page})=>{
 await sdkFixtures(page);await page.setViewportSize({width,height:1000});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/index.html');
 await expect(page.getByRole('heading',{level:1})).toHaveText(/Seu jogo\.\s*Sua comunidade\.\s*Suas regras\./);
 await expect(page.locator('.sg68-brand').first()).toContainText('SomethingGamer');
 await expect(page.locator('footer')).toContainText('Something Gamer — Yes, Something for you ;)');
 await expect(page.locator('footer')).toContainText('Por NOW: O FUTURO É AGORA ;)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);
 if([375,1440].includes(width))await page.screenshot({path:`artifacts/index-${width}.png`,fullPage:true});
});
test('FAQ funciona por teclado e link de salto recebe foco',async({page})=>{await sdkFixtures(page);await page.goto('/index.html');await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();await page.locator('summary').first().focus();await page.keyboard.press('Enter');await expect(page.locator('details').first()).toHaveAttribute('open','');});
test('Market vazio, filtros e checkout honesto em mobile',async({page})=>{await sdkFixtures(page);await page.setViewportSize({width:375,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/marketplace.html');await expect(page.locator('#marketMinPrice')).toBeVisible();await expect(page.locator('.market-checkout-notice').first()).toContainText('indisponíveis');await expect(page.locator('#marketList')).toContainText('Nenhum anúncio');await page.locator('#marketMinPrice').fill('500');await page.locator('#marketClearFilters').click();await expect(page.locator('#marketMinPrice')).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:'artifacts/market-mobile.png',fullPage:true});});
test('Chat carrega sem presença simulada e sem erros JS',async({page})=>{await sdkFixtures(page);await page.setViewportSize({width:375,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/chat.html');await expect(page.locator('#myUsername')).toContainText('sua conta');await expect(page.locator('#channelList')).toContainText('Nenhuma conversa');expect(errors).toEqual([]);await page.screenshot({path:'artifacts/chat-mobile.png',fullPage:true});});
test('verificação não anuncia cobrança recorrente',async({page})=>{await sdkFixtures(page);await page.goto('/verification.html');await expect(page.getByRole('button',{name:/Comprar 30 dias/})).toBeVisible();await expect(page.locator('#verificationStatus')).toContainText('configuração');await page.getByRole('button',{name:/Comprar 30 dias/}).click();await expect(page.locator('#appToast')).toContainText('preparação');await expect(page).toHaveURL(/verification.html$/);});

test("acessibilidade automatizada da landing",async({page})=>{await page.goto("/index.html");const result=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();expect(result.violations).toEqual([])});

test('Market transacional revisa total do servidor e mantém comissão fora do frete',async({page})=>{
 await sdkFixtures(page);let reserved=false;
 const product={id:'p1',sellerUid:'seller',title:'Console real de teste',description:'Produto físico',category:'Consoles',condition:'Usado',price:100,priceCents:10000,stock:1,shippingCents:2500,returnPolicy:'Entrega combinada pelo chat; devolução pelo suporte.',location:'Região',imageUrl:''};
 await page.route('**/market/**',async route=>{const path=new URL(route.request().url()).pathname;let body={ok:true};if(path.endsWith('/catalog'))body={ok:true,items:[product],cursor:null,checkoutEnabled:true};else if(path.endsWith('/mine'))body={ok:true,items:[]};else if(path.endsWith('/offers/list'))body={ok:true,offers:[]};else if(path.endsWith('/orders/list'))body={ok:true,orders:[]};else if(path.endsWith('/reviews/list'))body={ok:true,reviews:[]};else if(path.endsWith('/orders/create')){const request=route.request().postDataJSON();expect(request.items[0].productId).toBe('p1');expect(request.items[0].quantity).toBe(1);expect(request.items[0]).not.toHaveProperty('unitCents');reserved=true;body={ok:true,order:{id:'o1',subtotal_cents:10000,shipping_cents:2500,commission_cents:1000,total_cents:12500,expires_at:Date.now()+1800000}};}await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('/marketplace.html');await page.getByRole('button',{name:'Ver produto'}).click();await page.getByRole('button',{name:'Adicionar ao carrinho'}).click();await page.getByRole('button',{name:'Reservar e revisar pedido'}).click();await expect(page.getByRole('heading',{name:'Confira seu pedido'})).toBeVisible();await expect(page.locator('dialog[open]')).toContainText('125,00');await expect(page.locator('dialog[open]')).toContainText('10,00');expect(reserved).toBe(true);
});
test('assinatura exige consentimento recorrente explícito antes do checkout',async({page})=>{
 await sdkFixtures(page);let created=0;const intentKeys=[];const plan={price:1990,name:'Creator+',benefits:['Identificação Creator+','Relatório dos seus posts e CSV']};
 await page.route('**/subscriptions/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/create')){const body=route.request().postDataJSON();expect(body.consent).toBe(true);expect(body.consentVersion).toBe('sg-recurring-2026-10');created++;intentKeys.push(body.idempotencyKey);await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Sandbox não configurado.',code:'SUBSCRIPTIONS_DISABLED'})});return;}await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,enabled:true,plans:{creator_plus:plan,seller_pro:{...plan,name:'Seller Pro',price:2490},community_pro:{...plan,name:'Community Pro',price:2990}},subscriptions:[]})});});
 await page.goto('/monetization.html');await page.getByRole('button',{name:'Assinar Creator+'}).click();await page.getByRole('button',{name:'Continuar no Mercado Pago'}).click();expect(created).toBe(0);await page.getByRole('checkbox',{name:/Aceito a cobrança mensal/}).check();await page.getByRole('button',{name:'Continuar no Mercado Pago'}).click();await expect(page.locator('dialog[open] [data-error]')).toContainText('Sandbox não configurado');expect(created).toBe(2);expect(new Set(intentKeys).size).toBe(1);await expect(page).toHaveURL(/monetization.html$/);
});
for(const width of [375,1440])test(`Vice Sunset e Chat responsivos ${width}px`,async({page})=>{
 await sdkFixtures(page);await page.setViewportSize({width,height:900});await page.addInitScript(()=>localStorage.setItem('sgAppearance',JSON.stringify({theme:'vice'})));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/chat.html');await expect(page.locator('.sg-sunset-scene')).toBeVisible();await expect(page.locator('.sg-sunset-scene .sunset-palm')).toHaveCount(2);
 await expect(page.locator('link[href$="professional-ui.css"]')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(width===375){await page.locator('#mobileSpaces').click();await expect(page.locator('#mobileSpaces')).toHaveAttribute('aria-expanded','true');await page.keyboard.press('Escape');await expect(page.locator('#mobileSpaces')).toHaveAttribute('aria-expanded','false');}
 await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.sunset-palm').first().evaluate(node=>getComputedStyle(node).animationName)).toBe('none');
 await page.screenshot({path:`artifacts/chat-sunset-${width}.png`,fullPage:true});expect(errors).toEqual([]);
});
test('Now ADS mostra métricas calculadas, filtra e exporta CSV seguro',async({page})=>{
 await sdkFixtures(page);await page.setViewportSize({width:375,height:900});await page.addInitScript(()=>localStorage.setItem('sgAppearance',JSON.stringify({theme:'vice'})));
 const campaigns=[{id:'a1',name:'=Campanha teste',headline:'Encontre sua comunidade',state:'active',budget_cents:10000,spent_cents:2000,impressions:2000,clicks:100},{id:'a2',name:'Segunda campanha',headline:'Teste',state:'paused',budget_cents:5000,spent_cents:0,impressions:0,clicks:0}];
 await page.route('**/ads/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,paymentsEnabled:false,campaigns})}));
 await page.goto('/ads.html');await expect(page.locator('.ads-performance')).toContainText('5%');await expect(page.locator('#adsKpiSpend')).toContainText('20,00');await page.locator('[data-page=campaigns]').click();await page.locator('#adsTableSearch').fill('Segunda');await expect(page.locator('#campaignList .campaign-row:visible')).toHaveCount(1);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar métricas CSV'}).click();const download=await downloadPromise;const stream=await download.createReadStream();let csv='';for await(const chunk of stream)csv+=chunk.toString();expect(csv).toContain("'=Campanha teste");expect(csv).toContain('CTR (%)');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'artifacts/ads-sunset-mobile.png',fullPage:true});
});
test('Market restaura favoritos e envia limites de preço ao servidor',async({page})=>{
 await sdkFixtures(page);let filtered=false;const p={id:'p1',sellerUid:'seller',title:'Console profissional',description:'Produto',category:'Consoles',condition:'Usado',priceCents:10000,stock:2,shippingCents:0,returnPolicy:'Retirada e devolução combinadas.',location:'Região',imageUrl:''};
 await page.route('**/market/**',async route=>{const path=new URL(route.request().url()).pathname;let body={ok:true,items:[],offers:[],orders:[],reviews:[]};if(path.endsWith('/catalog')){const input=route.request().postDataJSON();if(input.minCents===5000&&input.maxCents===15000)filtered=true;body={ok:true,items:[p],cursor:null,checkoutEnabled:false};}await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('/marketplace.html');await page.getByRole('button',{name:'☆ Salvar',exact:true}).click();await expect(page.getByRole('button',{name:'★ Salvo',exact:true})).toHaveAttribute('aria-pressed','true');await page.locator('#marketSavedOnly').check();await expect(page.locator('.market-item')).toHaveCount(1);await page.locator('#marketMinPrice').fill('50');await page.locator('#marketMaxPrice').fill('150');await expect.poll(()=>filtered).toBe(true);
 await page.reload();await expect(page.getByRole('button',{name:'★ Salvo',exact:true})).toBeVisible();
});
test('Configurações carregam o sunset uma vez e preservam a preferência',async({page})=>{
 await sdkFixtures(page);await page.addInitScript(()=>localStorage.setItem('sgAppearance',JSON.stringify({theme:'vice'})));await page.goto('/settings.html');await expect(page.locator('.sg-sunset-scene')).toHaveCount(1);await expect(page.locator('link[href$="professional-ui.css"]')).toHaveCount(1);await expect(page.locator('html')).toHaveAttribute('data-theme','vice');
});
test('Stories reais exigem consentimento e enviam publicação para revisão',async({page})=>{
 await sdkFixtures(page);let created=false;await page.route('**/social/**',async route=>{const path=new URL(route.request().url()).pathname;let body={ok:true,items:[],mediaEnabled:false};if(path.endsWith('/create')){const input=route.request().postDataJSON();expect(input.publicConsent).toBe(true);expect(input.kind).toBe('story');expect(input.caption).toBe('Meu primeiro Story');expect(input.idempotencyKey).toBeTruthy();created=true;body={ok:true,id:'story-test',state:'pending_review'};}await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('/feed.html');await page.locator('.social-studio [data-publish]').click();await page.locator('.social-publish-dialog textarea').fill('Meu primeiro Story');await page.getByRole('button',{name:'Enviar para revisão',exact:true}).click();expect(created).toBe(false);await page.locator('.social-publish-dialog [name=consent]').check();await page.getByRole('button',{name:'Enviar para revisão',exact:true}).click();await expect(page.locator('.social-publish-dialog')).not.toBeVisible();expect(created).toBe(true);await expect(page.locator('.social-studio [data-status]')).toContainText('enviado para revisão');
});
test('ADS salva consentimento explícito sem integração externa Meta',async({page})=>{
 await sdkFixtures(page);let consent=null;await page.route('**/ads/**',async route=>{const path=new URL(route.request().url()).pathname;let body={ok:true,paymentsEnabled:false,campaigns:[]};if(path.endsWith('/preferences')){const input=route.request().postDataJSON();if(input.save)consent=input.consent;body={ok:true,preferences:{consent:false,region:'',interests:[]}};}await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});await page.route('**/meta/status',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,enabled:false,connected:false})}));
 await page.goto('/ads.html');await page.locator('[data-page=preferences]').click();await page.locator('[data-ad-preferences] [name=consent]').check();await page.getByRole('button',{name:'Salvar preferências'}).click();await expect.poll(()=>consent).toBe(true);await expect(page.locator('.meta-integration')).toHaveCount(0);await expect(page.locator('[data-ad-preferences] [role=status]')).toContainText('Preferências salvas');
});

test('Now ADS usa os três níveis, seis objetivos e preserva rascunho sem cobrança',async({page})=>{
 await sdkFixtures(page);const campaigns=[],native=[],sets=[],ads=[];let created=0,charges=0;
 await page.route('**/ads/**',async route=>{const path=new URL(route.request().url()).pathname,b=route.request().postDataJSON();let body={ok:true,campaigns,paymentsEnabled:false,mediaEnabled:false};if(path.endsWith('/manager')){if(b.action==='campaign'){expect(b.objective).toBe('sales');expect(b.allocation).toBe('campaign');expect(b.policyAccepted).toBe(true);created++;campaigns.push({id:'c1',name:b.name,state:'draft',budget_cents:b.budgetCents,spent_cents:0,impressions:0,clicks:0});native.push({campaign_id:'c1',name:b.name,state:'draft',objective:'sales',allocation:'campaign',daily_cents:b.dailyCents});body={ok:true,id:'c1'};}else body={ok:true,campaigns:native,sets,ads,audiences:[],rules:[]};}else if(path.endsWith('/preferences'))body={ok:true,preferences:{consent:false,region:'',interests:[]}};else if(path.endsWith('/checkout'))charges++;await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto('/ads.html');await page.getByRole('button',{name:'＋ Criar campanha',exact:true}).click();await expect(page.locator('.objective-option')).toHaveCount(6);await page.locator('[name=name]').fill('Minha loja SG');await page.locator('[name=objective][value=sales]').check();await page.getByRole('button',{name:'Salvar campanha',exact:true}).click();expect(created).toBe(0);await page.locator('[name=policy]').check();await page.getByRole('button',{name:'Salvar campanha',exact:true}).click();await expect(page.locator('#adsEditor')).not.toBeVisible();await expect(page.locator('#campaignList')).toContainText('Minha loja SG');await expect(page.locator('#campaignList')).toContainText('Vendas');await page.locator('[data-level=set]').click();await expect(page.locator('#createLevel')).toHaveText('Criar conjunto');await page.locator('[data-level=ad]').click();await expect(page.locator('#createLevel')).toHaveText('Criar anúncio');expect(created).toBe(1);expect(charges).toBe(0);await page.locator('[data-level=campaign]').click();await page.screenshot({path:'artifacts/ads-v64-desktop.png',fullPage:true});
});
for(const width of [375,1440])test(`Perfil V64 navega entre publicações fotos e vídeos ${width}px`,async({page})=>{
 await sdkFixtures(page);await page.setViewportSize({width,height:900});await page.route('**/social/profile',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,items:[{id:'photo',caption:'Foto publicada no SG',kind:'post',media_type:'image/png',mediaUrl:'',created_at:2},{id:'clip',caption:'Meu vídeo',kind:'reel',media_type:'video/mp4',mediaUrl:'',created_at:1}]})}));const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/profile.html?u=alice');await expect(page.locator('.profile-post-tile')).toHaveCount(2);await page.locator('[data-profile-tab=video]').click();await expect(page.locator('.profile-post-tile')).toHaveCount(1);await expect(page.locator('.profile-post-tile')).toContainText('Meu vídeo');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);await page.screenshot({path:`artifacts/profile-v64-${width}.png`,fullPage:true});
});

test('Mapa de localização abre com dimensões corretas e mantém aproximação como padrão',async({page})=>{
 await sdkFixtures(page);await page.setViewportSize({width:375,height:900});await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lm3sAAAAASUVORK5CYII=','base64')}));const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/marketplace.html');await page.locator('#openLocation').click();await expect(page.locator('#locationDialog')).toBeVisible();await expect(page.locator('#locationPickerMap')).toHaveClass(/leaflet-container/);const size=await page.locator('#locationPickerMap').boundingBox();expect(size.width).toBeGreaterThan(200);expect(size.height).toBeGreaterThan(250);await expect(page.locator('[name=locationPrecision][value=approximate]')).toBeChecked();await expect(page.locator('#locationPickerMap .leaflet-tile-loaded').first()).toBeVisible();expect(errors).toEqual([]);await page.screenshot({path:'artifacts/market-location-v64.png',fullPage:true});
});
test('Gerenciador Now ADS tem contraste e navegação acessíveis',async({page})=>{await sdkFixtures(page);await page.goto('/ads.html');const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();expect(result.violations).toEqual([]);});

for(const labels of [['RPG','rpg'],['RPG','']])test(`S01 compositor recusa ${labels[1]?'opções repetidas':'opção única'} sem gravar`,async({page})=>{
 await sdkFixtures(page);await page.goto('/feed.html');
 await page.locator('[data-open-composer="poll"]').click();
 const options=page.locator('#sg69Composer [data-poll-option]');await expect(options).toHaveCount(4);
 await options.nth(0).fill(labels[0]);await options.nth(1).fill(labels[1]);
 const writes=await page.evaluate(()=>globalThis.__sgFixtureWriteCount||0);
 await page.locator('#sg69Publish').click();
 await expect(page.locator('#sg69ComposerError')).toContainText(labels[1]?'diferentes':'duas a quatro');
 await expect(page.locator('#sg69Composer')).toBeVisible();
 await expect(page.locator('#sg69Publish')).toBeEnabled();
 expect(await page.evaluate(()=>globalThis.__sgFixtureWriteCount||0)).toBe(writes);
});
