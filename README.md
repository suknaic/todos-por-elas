# Dashboard TodosPorElas

Dashboard em tempo real do formulário KoboToolbox TodosPorElas. O frontend é
uma SPA em React + Vite e o backend Node mantém a sincronização, a agregação,
a autenticação e as exportações.

## Stack

- React 19 + React Router
- Vite 8
- ApexCharts e Leaflet
- Tailwind CSS 3
- Node.js >= 20.19

## Estrutura

- `src/` — frontend React (páginas, componentes, contexto, clientes de API e estilos)
- `server.js` — servidor HTTP local/produção (serve `dist/` com fallback de SPA)
- `api/index.js` — entry serverless da Vercel
- `lib/` — normalização, agregação, integração Kobo e autenticação
- `public/` — estáticos (logo e GeoJSON dos municípios)
- `scripts/check.mjs` — verificação das invariantes do agregado

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

Opcionalmente, defina `SESSION_SECRET` para assinar os cookies de sessão. Sem
ela, a chave é derivada de `DASHBOARD_PASS`, e trocar a senha invalida todas as
sessões. A sessão é um cookie assinado e sem estado, adequado a ambientes
serverless como a Vercel.

Com as duas variáveis configuradas, a página, as APIs, o stream em tempo real,
os arquivos protegidos e as exportações exigem usuário e senha. A autenticação
Basic Auth continua aceita para integrações e clientes que já a utilizam. Sem
essa configuração, o servidor responde com erro de autenticação em vez de
deixar os dados públicos.

## Desenvolvimento

```bash
npm install
npm run dev
```

O Vite fica em `http://localhost:5173` e encaminha `/api` para o servidor Node
na porta `4173`.

## Build e produção

```bash
npm run build
npm start
```

O dashboard fica disponível em `http://localhost:4173`.

## Verificação do agregado

Com o servidor em execução:

```bash
DASHBOARD_USER=admin DASHBOARD_PASS=uma-senha-forte npm run check
```

## Deploy

A Vercel usa o build do Vite (`dist/`) e a função em `api/index.js`. Configure
`DASHBOARD_USER` e `DASHBOARD_PASS` (e as variáveis do Kobo já existentes) no
projeto da Vercel.
