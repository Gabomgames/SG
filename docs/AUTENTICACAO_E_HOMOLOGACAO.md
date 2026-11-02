# Autenticação segura e homologação

Execute os comandos no terminal do ambiente que executará o projeto. Autenticar no computador pessoal não autentica automaticamente esta sessão remota. Nunca envie tokens, senhas, JSON de conta de serviço ou códigos de autorização no chat.

## Cloudflare

```bash
cd /workspace/sg/something-gamer-api
npx wrangler login
npx wrangler whoami
```

O login OAuth abre o navegador e usa um callback local. Em terminal remoto, encaminhe a porta de callback apresentada pelo Wrangler para seu computador; se isso não for possível, use um token de API criado no painel oficial e cadastrado no gerenciador de segredos do ambiente como CLOUDFLARE_API_TOKEN. Restrinja à conta necessária e inicialmente à leitura de Workers e recursos envolvidos. Permissões de edição somente para recursos de homologação. Não use chave global nem cole tokens no terminal em comandos que ficam no histórico.

## Firebase

```bash
cd /workspace/sg
npx firebase login --no-localhost
npx firebase projects:list
```

Abra a URL oficial apresentada pelo CLI e conclua o fluxo de autorização no próprio terminal. Para automação, prefira identidade de serviço ou Workload Identity com escopo mínimo; configure GOOGLE_APPLICATION_CREDENTIALS apontando para um arquivo protegido provisionado pelo mecanismo seguro do ambiente, nunca pelo repositório ou pelo chat. O runtime do Worker e a autenticação do CLI são diferentes: mantenha os segredos existentes no Worker. Não use firebase login:ci como solução permanente.

Documentação oficial: https://developers.cloudflare.com/workers/wrangler/commands/#login e https://firebase.google.com/docs/cli#sign-in-test-cli .

## Depois de autenticar

Primeiro inspecionar configuração e metadados do Worker existente em modo de leitura, sem imprimir valores dos segredos. Confirmar projeto, bindings, D1 existente e política de administrador. Comparar o webhook implantado com a implementação local e validar assinatura com eventos sandbox reais. Não executar deploy sobre produção, migrations remotas, alteração de segredos ou ativação de pagamentos reais.

Criar/usar ambiente de homologação explicitamente separado e autorizado, sem ativar serviços pagos ou Firebase Blaze. Verificar contas comprador/vendedor de teste, aplicação OAuth, disponibilidade/aprovação do split, assinatura e configuração dos webhooks. Os testes devem cobrir aprovação, pendência, repetição, assinatura inválida, cancelamento, reembolso e disputa. A comissão deve ser 10% do subtotal dos produtos, excluindo frete. Não implementar liberação antecipada ou promessa de retenção de dinheiro que o provedor não ofereça.

Nenhuma autenticação externa foi disponibilizada nesta sessão até a elaboração deste documento. A homologação externa permanece pendente.
