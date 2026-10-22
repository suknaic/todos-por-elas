# Dashboard TodosPorElas

## Autenticação

O dashboard exibe uma tela de login e mantém a autenticação em uma sessão por
cookie HttpOnly. Configure as variáveis de ambiente no ambiente local ou na
Vercel:

```env
DASHBOARD_USER=admin
DASHBOARD_PASS=uma-senha-forte
```

Em desenvolvimento local, salve essas variáveis em um arquivo `.env` na raiz
do projeto. Os comandos `npm start` e `npm run dev` carregam esse arquivo
automaticamente. Não versione o arquivo `.env`.

Com as duas variáveis configuradas, a página, as APIs, o stream em tempo real,
os arquivos protegidos e as exportações exigem usuário e senha. A autenticação
Basic Auth continua aceita para integrações e clientes que já a utilizam. Sem
essa configuração, o servidor responde com erro de autenticação em vez de
deixar os dados públicos.

## Execução local

```bash
npm install
npm run build
npm start
```

O dashboard fica disponível em `http://localhost:4173`.
