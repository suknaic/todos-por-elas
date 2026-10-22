# Dashboard TodosPorElas

## Configuração do Clerk

Crie uma aplicação no Clerk e configure o domínio do dashboard como origem
permitida. Desative o cadastro público (os usuários devem ser criados no painel
do Clerk) e configure estas variáveis no ambiente local ou na Vercel:

```env
CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

`CLERK_SECRET_KEY` fica somente no servidor. A chave pública é entregue ao
navegador pelo endpoint de configuração usado pela tela de login.

Para manter a compatibilidade com instalações antigas, também é possível
configurar `DASHBOARD_USER` e `DASHBOARD_PASS`; as APIs aceitam Basic Auth ou
uma sessão Clerk válida. Sem nenhuma configuração de autenticação, as APIs
respondem com erro de configuração em vez de ficarem públicas.

## Execução local

```bash
npm install
npm run build
npm start
```

O dashboard fica disponível em `http://localhost:4173`.
