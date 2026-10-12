# RespondiChat

Painel pessoal para **@michellefmkt**: um comentário com uma palavra-chave em um post ou Reel gera uma resposta privada com os links dos produtos daquele post.

## O que está implementado

- Dashboard responsivo em português, produtos, automações por post e histórico.
- Login de administrador com senha scrypt, cookie HttpOnly e verificação de origem nas alterações.
- Autorização oficial **Instagram Login**, sincronização e paginação de posts.
- Tokens criptografados com AES-256-GCM; nenhuma senha do Instagram é solicitada pelo painel.
- Webhook autenticado pela assinatura da Meta, fila PostgreSQL e deduplicação por comentário/conta.
- Quota local de 200 tentativas por hora, tratamento de limites e estado para resultados sem confirmação.
- Renovação diária da autorização, retenção de histórico de 30 dias, callbacks de desautorização/exclusão.
- Simulador de mensagem que **não envia uma DM**.

**Estado atual:** código compilado e testado localmente. O envio real precisa de domínio publicado, banco migrado, credenciais Meta, autorização do perfil e teste de permissões. O repositório não contém credenciais.

## Prévia local sem configurar serviços

Requisitos: Node.js 22 ou superior e pnpm 10.30.1 (`corepack enable`, se necessário).

```powershell
pnpm install --frozen-lockfile
$env:DEMO_MODE = 'true'
$env:APP_URL = 'http://localhost:3000'
pnpm dev
```

Abra `http://localhost:3000`. Os dados são exemplos, os links usam `example.com` e as edições ficam no localStorage daquele navegador. “Restaurar exemplos” reinicia a prévia. **DEMO_MODE só funciona com NODE_ENV=development**; ele não abre o painel em produção nem libera APIs administrativas.

Depois do deploy, a rota **`/demo`** oferece uma demonstração pública explícita, com os mesmos dados fictícios e sem acesso ao banco/Instagram. A página de login inclui um link para ela. O painel real continua protegido em `/`; alterações feitas na demonstração não afetam os cadastros reais.

## Publicação na Vercel

1. Importe `MateusFlausino/RespondiChat` na Vercel. Framework: **Next.js**, raiz: `./`. Use Node.js 22 ou superior. Mantenha o domínio de produção estável.
2. Crie um PostgreSQL, por exemplo pelo Marketplace da Vercel (Neon ou Supabase). Use a URL de conexão com pooling e TLS em `DATABASE_URL`.
3. Copie `.env.example` para `.env.local` no seu computador. Preencha as variáveis e gere o hash da senha com `pnpm password` em um terminal interativo. Configure os mesmos valores em **Settings → Environment Variables** na Vercel, ambiente Production. Não envie `.env.local` ao GitHub.
4. Execute a migração contra o banco escolhido:

   ```powershell
   pnpm db:migrate
   ```

   A migração cria as tabelas de forma idempotente. Use a conexão direta do provedor se seu pool não aceitar migrações. Não há banco em arquivo nem escrita em disco pelas funções da Vercel.

5. Publique o projeto, defina `APP_URL=https://SEU-DOMINIO` e faça redeploy se o domínio ou as variáveis mudarem.
6. Configure o aplicativo Meta conforme o guia abaixo, entre no painel, conecte @michellefmkt e sincronize os posts.
7. Cadastre produtos reais, escolha um post importado, configure uma palavra e mensagem, faça o teste sem enviar e ative a automação. Faça um comentário novo por uma conta de teste e confirme o resultado no histórico e no Instagram.

O primeiro deploy pode ser feito sem credenciais Meta; o login indica configuração pendente até o banco e as variáveis do administrador estarem prontos. A publicação não equivale à aprovação das permissões do Instagram.

### Variáveis

| Variável                                    | Uso                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `APP_URL`                                   | Origem pública canônica do painel, com HTTPS em produção; sem caminhos.                                                   |
| `DATABASE_URL`                              | Conexão PostgreSQL com TLS.                                                                                               |
| `ADMIN_USERNAME`                            | Usuário do painel; padrão `admin`.                                                                                        |
| `ADMIN_PASSWORD_HASH`                       | Resultado de `pnpm password`; mínimo 12 caracteres na senha.                                                              |
| `SESSION_SECRET`                            | Segredo aleatório com no mínimo 32 caracteres.                                                                            |
| `TOKEN_ENCRYPTION_KEY`                      | **64 caracteres hexadecimais**, gerados de 32 bytes aleatórios. Preserve a chave; alterá-la exige reconectar o Instagram. |
| `CRON_SECRET`                               | Segredo aleatório com no mínimo 32 caracteres; a Vercel o envia como Bearer ao cron.                                      |
| `META_WEBHOOK_VERIFY_TOKEN`                 | Segredo escolhido por você e repetido ao cadastrar o webhook.                                                             |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Credenciais do produto Instagram Login, exibidas no painel Meta.                                                          |
| `META_APP_SECRET`                           | Segredo do aplicativo Meta que assina os eventos do webhook. Não confunda com o segredo do produto Instagram.             |
| `META_GRAPH_VERSION`                        | Versão da API, padrão `v25.0`. Confirme a versão suportada no painel Meta antes da conexão.                               |
| `ALLOWED_INSTAGRAM_USERNAME`                | Perfil autorizado, padrão `michellefmkt`, sem `@`.                                                                        |
| `PRIVACY_CONTACT`                           | Identificação e contato público do operador, usados nas páginas de privacidade e exclusão.                                |
| `DEMO_MODE`                                 | Use `false` ou omita em produção.                                                                                         |

Gere **um valor diferente para cada segredo**:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

As credenciais ficam no ambiente da Vercel e os tokens no banco criptografados. Não use prefixo `NEXT_PUBLIC_` para segredos.

## Aplicativo Meta e perfil da sua irmã

Você pode administrar o aplicativo Meta com sua conta. **A titular do Instagram autoriza o perfil dela**. Use papéis de administrador/desenvolvedor/testador no aplicativo e os acessos legítimos ao perfil/negócio, conforme as opções atuais do painel Meta. Não compartilhe a senha pessoal do Instagram.

1. Crie o aplicativo em [Meta for Developers](https://developers.facebook.com/apps/) e adicione **Instagram API com Instagram Login**. Este código usa esse fluxo; não usa o login antigo do Facebook.
2. Adicione o perfil/testador necessário em App Roles/Instagram Testers e peça à titular que aceite o convite. Confira que o perfil está como Criador ou Empresa.
3. Configure o login e estes escopos:
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
4. Cadastre os seguintes endereços, substituindo o domínio:

| Configuração                    | Endereço                                          |
| ------------------------------- | ------------------------------------------------- |
| Redirect URI do Instagram Login | `https://SEU-DOMINIO/api/instagram/callback`      |
| Callback URL do webhook         | `https://SEU-DOMINIO/api/instagram/webhook`       |
| Política de privacidade         | `https://SEU-DOMINIO/privacy`                     |
| Instruções de exclusão          | `https://SEU-DOMINIO/data-deletion`               |
| Callback de exclusão            | `https://SEU-DOMINIO/api/instagram/data-deletion` |
| Callback de desautorização      | `https://SEU-DOMINIO/api/instagram/deauthorize`   |

5. Configure o webhook com o mesmo `META_WEBHOOK_VERIFY_TOKEN` e assine **comments** no objeto Instagram. O callback precisa estar acessível pela Meta; confira a proteção de deployments da Vercel se a verificação não chegar ao endpoint de produção.
6. No painel, clique em Conectar Instagram. **Faça login como @michellefmkt** na tela oficial e autorize os escopos. O código rejeita outro username.
7. A conexão registra a conta em `subscribed_apps` para comentários. Se essa etapa falhar, a conta aparece pendente; confira as permissões/webhook no painel Meta e reconecte.
8. Faça o teste real primeiro com contas de teste autorizadas. Para o público geral, confira o nível de acesso e as exigências de **App Review/Advanced Access e eventual verificação empresarial**. Não presuma que modo de desenvolvimento ou acesso padrão garantem mensagens para seguidores externos.

Usar a conta da titular como proprietária do aplicativo pode facilitar a continuidade administrativa se ela for manter tudo sozinha; tecnicamente, o proprietário do app e o perfil conectado são identidades diferentes. Em ambos os casos as permissões precisam ser verificadas.

Referências: [Instagram Login na documentação oficial da Meta](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Private Replies](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/private-replies/), [coleção oficial da Meta no Postman](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login).

## Como funciona a automação

```text
Novo comentário → validar assinatura → identificar conta/post/palavra
  → persistir uma tarefa única → responder pela API oficial → registrar resultado
```

- Uma automação **ativa** por post evita mensagens conflitantes. Várias pausadas podem ser cadastradas.
- A comparação ignora acentos e caixa, e respeita limites de palavras: `LINK` não corresponde a `linkado`.
- `{{nome}}` insere o username do comentarista; `{{produtos}}` insere nome, preço opcional e URL de cada produto. Sem o marcador, os links são acrescentados ao final.
- A mensagem completa tem limite conservador de 1.000 caracteres. Só posts importados da conta autorizada podem ser usados.
- Eventos de outras contas, comentários da própria conta, posts sem regra e comentários fora da janela de sete dias são ignorados. Lives não estão no escopo desta versão.
- Resposta privada usa **recipient.comment_id**. O sistema não faz disparos para listas ou pessoas que não interagiram.
- Mensagem aceita pela Meta aparece como **Enviada**; não significa leitura, clique ou compra. Não há estatísticas de venda inventadas.
- Uma falha de rede ou resposta ambígua vai para **Conferir direct** e não é reenviada automaticamente. Isso evita repetir uma mensagem que pode já ter chegado.
- A fila é persistente, com reivindicação atômica por worker e uma tarefa por comentário. Falhas explícitas de limite voltam à fila após cinco minutos, até cinco tentativas. Outras falhas ficam registradas.
- Pausar ou remover uma regra interrompe tarefas que ainda não foram reivindicadas; uma chamada já em andamento pode concluir o envio.

### Rotina e filas na Vercel

O webhook salva os eventos antes de retornar 200 e inicia processamento após a resposta com `after()`. Cada execução processa até 20 tarefas dentro de um orçamento de tempo. Novos eventos, o botão **Processar fila** e o cron processam pendências.

O `vercel.json` usa um cron **diário**, às 09:00 UTC (06:00 em Brasília), para ser compatível com a frequência do plano Hobby. Nesse plano, o horário exato não é garantido. Se uma tarefa aguardar nova tentativa e não houver novos comentários, ela poderá esperar até a próxima rotina ou processamento manual. Para baixo volume, isso é um ponto de partida; para tentativas frequentes e volume maior, use um agendador/serviço de fila dedicado ou configure um cron mais frequente em um plano compatível.

A quota de 200 tentativas/hora é uma proteção **do aplicativo**, não uma declaração do limite oficial atual da Meta. A rotina tenta renovar tokens ainda válidos que vencem em menos de dez dias. Tokens já vencidos exigem reconexão.

A Vercel restringe o plano Hobby a uso pessoal não comercial. Conteúdo de produtos, afiliados ou vendas pode caracterizar uso comercial; confira a elegibilidade e o plano apropriado antes de usar em produção. [Planos da Vercel](https://vercel.com/docs/plans/hobby), [limites de cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Testes e estrutura

```powershell
pnpm test
pnpm typecheck
pnpm build
```

Os testes de integração executam o esquema PostgreSQL em PGlite, com chamadas à Meta simuladas. Verificam deduplicação, conta/post correto, regras, claims concorrentes, limite, pausa, validade de token, janela de resposta, resultados ambíguos, criptografia, assinatura e formato das requisições OAuth/mensagens. Eles não validam permissões reais nem a disponibilidade da Meta.

```text
src/app/                 páginas e endpoints Next.js
src/components/          dashboard e formulários
src/lib/                 regras, autenticação, banco, API e worker
db/schema.sql            esquema PostgreSQL
scripts/                 migração e geração do hash da senha
tests/                   testes de regras, segurança e integração
```

Esta versão atende **uma conta de Instagram e um administrador**. Não implementa atendimento por IA, sequência de follow-up, múltiplos clientes, leitura de DMs recebidas, processamento de stories ou checkout. O envio começa a partir de comentários nos posts/Reels.
# Acesso próprio da Michelle

Mateus também pode ter um acesso pessoal: configure `MATEUS_PASSWORD_HASH` em Production, faça novo deploy e entre em `/mateus/login` com usuário `mateus`. Os três acessos trabalham no mesmo painel do perfil @michellefmkt. Não use `mateus` como `ADMIN_USERNAME` para evitar colisão entre credenciais.

O painel aceita dois acessos independentes para o mesmo perfil e suas automações: o administrador e a Michelle. Configure `MICHELLE_PASSWORD_HASH` em Production com um hash scrypt no mesmo formato de `ADMIN_PASSWORD_HASH` e faça um novo deploy. Ela entra em `/michelle/login`, com usuário `michelle` e sua própria senha, e usa **Conectar Instagram** nas configurações. A senha do painel é diferente da senha do Instagram; a autorização do perfil acontece somente na tela oficial da Meta.

Ambos os acessos podem gerenciar os produtos, automações e a conexão do único perfil autorizado. Não há cadastro público. Para revogar o acesso da Michelle, remova sua variável e faça novo deploy. Trocar o hash invalida suas sessões anteriores; esta atualização também exige novo login do administrador. Não use `michelle` como `ADMIN_USERNAME`.
