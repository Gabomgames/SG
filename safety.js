const blockedPatterns=[
  {category:"sexual",pattern:/\b(porn[oô]?|nudes?|sexo explícito|conteúdo sexual|pedof|estupr)\b/i},
  {category:"aggression",pattern:/\b(matar você|vou te matar|ameaça de morte|suicid|se mata)\b/i},
  {category:"crime",pattern:/\b(tráfico de drogas|vender drogas|terroris|nazis|facção criminosa)\b/i},
  {category:"hate",pattern:/\b(racis|homofob|transfob|supremacia branca)\b/i}
];
const disguised=/([a-zà-ÿ0-9])\1{7,}/i;
export function inspectPublicText(value,{field="conteúdo",min=1,max=1000}={}){
  const text=String(value||"").replace(/\s+/g," ").trim();
  if(text.length<min)return{ok:false,message:`Preencha ${field}.`};
  if(text.length>max)return{ok:false,message:`${field} ultrapassa o limite permitido.`};
  const hit=blockedPatterns.find(item=>item.pattern.test(text));
  if(hit)return{ok:false,category:hit.category,message:`${field} contém linguagem que não é permitida no SG.`};
  if(disguised.test(text))return{ok:false,category:"spam",message:`${field} parece conter spam ou texto abusivo.`};
  return{ok:true,text};
}
export function assertPublicText(value,options){const result=inspectPublicText(value,options);if(!result.ok){const error=new Error(result.message);error.code="SG_CONTENT_BLOCKED";error.category=result.category||"other";throw error}return result.text}
export function validateBirthDate(value,minimumAge=13){
  const birth=new Date(`${value}T12:00:00`),now=new Date();
  if(!value||Number.isNaN(birth.getTime())||birth>now)return{ok:false,message:"Informe uma data de nascimento válida."};
  let age=now.getFullYear()-birth.getFullYear();const before=now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate());if(before)age--;
  if(age<minimumAge)return{ok:false,message:`É necessário ter pelo menos ${minimumAge} anos para criar uma conta no SG.`};
  if(age>120)return{ok:false,message:"Confira o ano de nascimento informado."};
  return{ok:true,birthDate:value,ageVerified:true};
}

// O <input type="email"> do navegador nao olha o final do dominio:
// "alguem@gmail.com3" passa por ele e passa pelo Firebase tambem. No
// cadastro isso cria uma conta que ninguem recupera, porque o e-mail de
// redefinicao vai para o nada.
const DOMINIOS_COMUNS = [
  "gmail.com", "hotmail.com", "outlook.com", "outlook.com.br", "live.com",
  "icloud.com", "yahoo.com", "yahoo.com.br", "bol.com.br", "uol.com.br",
  "terra.com.br", "globo.com", "protonmail.com", "proton.me"
];

/** Distancia de edicao, limitada: so precisamos saber se e 1. */
function distancia(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i-1][j] + 1,
        d[i][j-1] + 1,
        d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)
      );
      // duas letras trocadas de lugar valem um erro so: "hotmial" -> "hotmail"
      if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) {
        d[i][j] = Math.min(d[i][j], d[i-2][j-2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
export function validateEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return { ok: false, message: "Informe seu e-mail." };
  if (email.length > 254) return { ok: false, message: "Esse e-mail é longo demais." };

  const partes = email.split("@");
  if (partes.length !== 2) return { ok: false, message: "O e-mail precisa ter uma arroba, e só uma." };
  const [local, dominio] = partes;
  if (!local || /[\s",;<>\\]/.test(local)) return { ok: false, message: "Confira a parte antes da arroba." };
  if (!dominio.includes(".")) return { ok: false, message: "Falta o final do domínio, como .com ou .com.br." };
  if (dominio.startsWith(".") || dominio.endsWith(".") || dominio.includes("..")) {
    return { ok: false, message: "Confira os pontos do domínio." };
  }

  // O final do dominio e so letra. Numero ali quase sempre e dedo no
  // teclado: "gmail.com3". A excecao real sao dominios internacionais,
  // que comecam com xn--.
  const fim = dominio.slice(dominio.lastIndexOf(".") + 1);
  const finalValido = /^[a-z]{2,24}$/.test(fim) || /^xn--[a-z0-9-]{2,}$/.test(fim);
  if (!finalValido) {
    return { ok: false, message: `"${fim}" não é um final de e-mail válido. Confira o que vem depois do último ponto.` };
  }

  // Um caractere de diferenca de um provedor conhecido e quase sempre erro.
  // Mas so se o que a pessoa digitou ja nao for um provedor de verdade:
  // uol.com.br e bol.com.br estao a um caractere um do outro, e os dois
  // existem. Sugerir a troca ali seria estragar um e-mail correto.
  if (DOMINIOS_COMUNS.includes(dominio)) return { ok: true, email };
  for (const conhecido of DOMINIOS_COMUNS) {
    if (dominio !== conhecido && distancia(dominio, conhecido) === 1) {
      return { ok: true, email, suggestion: `${local}@${conhecido}` };
    }
  }
  return { ok: true, email };
}
