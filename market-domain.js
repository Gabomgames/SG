export const CATEGORIES = ['Hardware','Games','Consoles','Acessórios','Colecionáveis','Eletrônicos','Móveis','Roupas','Esportes','Outros'];
export const CONDITIONS = ['Novo','Seminovo','Usado'];
export function validateListing(data) {
  if (String(data.title||'').trim().length<3 || String(data.title).length>90) throw new Error('Use um título de 3 a 90 caracteres.');
  if (!Number.isFinite(data.price) || data.price<=0 || data.price>50000 || Math.abs(data.price*100-Math.round(data.price*100))>1e-6) throw new Error('Informe um preço válido, até R$ 50.000,00, com no máximo duas casas decimais.');
  if (!CATEGORIES.includes(data.category) || !CONDITIONS.includes(data.condition)) throw new Error('Escolha categoria e condição para um produto físico.');
  if (String(data.description||'').length>1000) throw new Error('A descrição deve ter até 1.000 caracteres.');
  return data;
}
export const isFeatured = (item, now=Date.now()) => item.featured===true && (item.featuredUntil?.toMillis?.() || item.featuredUntil || 0)>now;
export function filterListings(items,{term='',category='',condition='',min=0,max=Infinity,saved=null,sort='recent'}={}) {
  const normalize=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
  const needle=normalize(term);
  const rows=items.filter(x=>(!needle||normalize(`${x.title} ${x.description||''} ${x.location||''}`).includes(needle))
    &&(!category||x.category===category)&&(!condition||x.condition===condition)
    && x.price>=min && x.price<=max && (!saved||saved.has(x.id)));
  const date=x=>x.createdAt?.toMillis?.()||x.createdAt||0;
  return rows.sort((a,b)=>(sort==='low'?a.price-b.price:sort==='high'?b.price-a.price:sort==='near'?(a._distance??Infinity)-(b._distance??Infinity)
    :sort==='featured'?Number(isFeatured(b))-Number(isFeatured(a)):0)||date(b)-date(a)||String(a.id).localeCompare(String(b.id)));
}
