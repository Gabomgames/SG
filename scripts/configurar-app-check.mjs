import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "config.js");
const siteKey = String(process.env.RECAPTCHA_ENTERPRISE_SITE_KEY || "").trim();

if (!siteKey) {
  console.log("App Check: RECAPTCHA_ENTERPRISE_SITE_KEY não definida; build permanece em modo de observação sem provedor ativo.");
  process.exit(0);
}

if (siteKey.length < 20 || /[\s"'<>]/.test(siteKey)) {
  throw new Error("RECAPTCHA_ENTERPRISE_SITE_KEY possui formato inesperado.");
}

const source = fs.readFileSync(file, "utf8");
const next = source.replace(
  /recaptchaEnterpriseSiteKey:\s*["'][^"']*["']/,
  `recaptchaEnterpriseSiteKey: ${JSON.stringify(siteKey)}`
);
if (next === source) throw new Error("Campo recaptchaEnterpriseSiteKey não encontrado em config.js.");
fs.writeFileSync(file, next);
console.log("App Check: Site Key pública injetada no build.");
