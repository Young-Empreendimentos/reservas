# Reservas — Bairro Erico Verissimo · Fase 2

Sistema de reservas de lotes da Young Empreendimentos, publicado em
https://reservas.youngempreendimentos.com.br (GitHub Pages).

## Como funciona

- **Site estático** (Next.js `output: 'export'`), publicado pelo workflow `.github/workflows/pages.yml` a cada push na `main`.
- **Login** com conta Google (Supabase Auth). Todo novo usuário fica *pendente* até um admin liberar na aba **Usuários**.
- **Dados** no Supabase, schema `marketing` (ver `supabase/migrations`):
  - `reservas_usuarios` — usuários, papel (admin/usuário) e liberação;
  - `reservas_lotes` — lotes da Fase 2 (status e preço);
  - `reservas` — fichas de reserva completas;
  - `reservas_config` — textos sensíveis (ex.: qualificação do Outorgante do arras);
  - `vw_reservas_clientes` — reservas + cadastro do Sienge por CPF (para o Simulador de Vendas).
- **Regras de acesso (RLS)**: cada usuário vê só as próprias reservas; admins veem e alteram tudo.
  A reserva é gravada pela função `marketing.reservar_lote`, que trava o lote na transação.
- **Anexos** vão para o Google Drive pela Edge Function `reservas-anexos` → Apps Script (`google-apps-script/Code.gs`).

## Segurança

Nada sensível fica neste repositório (ele é público). Dados pessoais, links do Drive, tokens e IDs de pasta
ficam no Supabase (tabelas protegidas e segredos da função) e nas Propriedades do Apps Script
(`DRIVE_FOLDER_ID`, `ANEXOS_TOKEN`). A chave em `src/lib/supabase.ts` é a chave **publicável**, feita para o navegador.

## Rodar localmente

```bash
npm install
npm run dev
```
