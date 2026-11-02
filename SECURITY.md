# Segurança e moderação do Something Gamer

## Cadastro e privacidade

- Idade mínima: 13 anos.
- A data de nascimento fica somente no documento privado do usuário e não é copiada para o perfil público.
- A confirmação de idade valida a data informada; ela não equivale a verificação documental de identidade.
- Nome, username, bio, posts, comentários e mensagens passam por validação no navegador (`safety.js`) **e** nas regras do Firestore. A validação do navegador dá a mensagem amigável; a regra é a que vale, porque não dá para contorná-la pelo console. Cada campo tem limite de tamanho e os termos mais graves são recusados na escrita.

## Fotos de perfil

Fotos novas são enviadas para a área `profile-review` e permanecem pendentes. A foto pública anterior é preservada até aprovação administrativa. PNG, JPEG e WEBP são aceitos, com limite de 5 MB.

## Denúncias

Posts, comentários e mensagens podem ser denunciados por agressividade, ameaça, conteúdo sexual, assédio, discurso de ódio, atividade criminosa, spam/golpe ou outro motivo. Cada denúncia aceita até três provas em imagem, áudio ou vídeo, com 20 MB por arquivo.

## Escalonamento

1. Primeira advertência: aviso com motivo.
2. Segunda advertência: aviso com motivo e risco de suspensão.
3. Terceira advertência: suspensão automática de 2 dias.
4. Nova suspensão: 7 dias.
5. Reincidência posterior: banimento permanente.

O administrador pode aplicar suspensão ou banimento já na primeira ocorrência quando a gravidade justificar. Toda ação registra motivo, responsável, data e vínculo opcional com a denúncia.

## Links e conteúdo vindo do banco

Um valor como `javascript:alert(1)` não contém nenhum dos caracteres que o escape de HTML troca, então atravessa o escape inteiro. Por isso existem duas camadas:

- `seguranca-web.js` expõe `escaparHtml`, `urlSegura` e `urlDeMidia`. Todo `href` e `src` montado com dado do banco passa por elas: `urlSegura` só devolve http e https, `urlDeMidia` também aceita `data:` de imagem, áudio e vídeo (as figurinhas do SG são `data:image/svg+xml` e os áudios gravados são `data:audio/...`).
- As regras do Firestore recusam o esquema na **escrita**, com `urlOk` e `midiaOk`. Sem isso bastava escrever direto no banco, sem passar pela interface.

O Storage aceita apenas `png`, `jpeg`, `webp` e `gif` para imagem. `image/svg+xml` foi removido porque SVG executa script quando aberto direto pela URL do Storage.

## Selos e tipo de conta

`accountType`, `verification` e `badges` ficam em `publicProfiles`, que o próprio usuário escreve. A regra `naoEscalaSelo` só deixa passar valores comuns (`gamer`, `creator`, sem verificação ativa, sem selo do ecossistema) ou uma cópia exata do que o backend gravou no documento privado. Sem essa trava qualquer conta se marcava como oficial e passava a poder publicar evento oficial.

O nome de usuário é reservado na coleção `usernames` dentro de uma transação, tanto no cadastro quanto na troca pelo editar perfil. A regra exige que a reserva esteja no nome de quem está escrevendo.

## Aplicação técnica

As regras do Firestore e Storage impedem contas suspensas ou banidas de publicar, comentar, conversar, criar servidores, eventos ou enviar arquivos. A interface também mostra o motivo e o término da suspensão.

Também valem no servidor:

- **Amizade** só existe depois que o pedido é aceito de verdade. Antes bastava o pedido existir: dava para criar a amizade sozinho e mandar mensagem para quem não aceitou.
- **Notificação** exige relação real (amizade, ou já seguir a pessoa), tem tamanho limitado e tipo restrito. Avisos oficiais são só do administrador. Antes qualquer conta mandava notificação com qualquer texto para qualquer pessoa, e isso vira notificação do sistema no celular.
- **Expulsar de servidor** gruda: quem foi expulso entra em `kickedUids` e não se readiciona sozinho. O convite do dono limpa a marca.
- **Steam** é gravada só pelo servidor.
- **Promoção** aceita uma reserva por pessoa (`promotionClaims`), na mesma transação da baixa do estoque.

Publique sempre as duas regras:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage,hosting,functions
```

## Aceite jurídico versionado

A versão atual é `2026-09-16` para Termos de Uso, Política de Privacidade e Regras da Comunidade. O Firestore registra `legal.acceptedAt` com `serverTimestamp()` e bloqueia novas ações quando a conta não aceitou a versão atual. Storage e endpoints de usuário das Cloud Functions aplicam a mesma condição.

## Integridade dos selos

Os selos visuais são renderizados por `badges.js`. Campos de verificação, conta oficial, SG, NOW e DEV são autoritativos no documento privado e só podem ser alterados pelo backend administrativo. Publicações, mensagens e eventos carregam snapshots desses campos e as regras conferem o snapshot contra `/users/{uid}`, impedindo autoatribuição de selo pelo cliente.
