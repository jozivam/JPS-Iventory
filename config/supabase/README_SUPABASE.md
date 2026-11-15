# 🚀 Guia de Sincronização e Recriação do Banco no Supabase - JPS Almoxarifado

Após a reformulação da arquitetura para o **MVP Enxuto (Inventário + Movimentações)**, o banco de dados no Supabase pode ser recriado de forma 100% limpa e com todos os novos campos adicionados.

---

## 📁 Arquivos na Pasta `config/supabase/`

| Arquivo | Descrição |
| :--- | :--- |
| **`recriar_banco_supabase.sql`** | **Script SQL Mestre:** Remove tabelas antigas em cascata (`CASCADE`), cria as 2 tabelas (`produtos` e `movimentacoes`) com todas as novas colunas (`marca`, `tamanho`, `cor`, `peso`, `numero_serie`, `ca`, `patrimonio`, `tag`), triggers de atualização, índices e já insere todos os produtos e movimentações atuais do banco local. |
| **`export_sqlite_to_supabase.js`** | Utilitário para reexportar os dados mais recentes do SQLite local para o arquivo SQL (`npm run db:export`). |
| **`import_to_supabase.js`** | Script de migração direta via Node.js (`npm run db:migrate-supabase`). |
| **`../supabase.js`** | Módulo de conexão com o Supabase SDK e Pooler PostgreSQL. |

---

## 🛠️ Como Recriar o Banco no Supabase (Passo a Passo)

A maneira mais rápida, visual e segura (leva apenas 30 segundos e não depende de senhas no terminal) é via painel do Supabase:

1. Acesse o seu painel do Supabase: [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Selecione o projeto **JPS Almoxarifado**.
3. No menu lateral esquerdo, clique no ícone **SQL Editor** (`>_`).
4. Clique no botão **"New Query"** (ou `+`).
5. Abra o arquivo [`config/supabase/recriar_banco_supabase.sql`](./recriar_banco_supabase.sql), copie todo o seu conteúdo e cole no editor do Supabase.
6. Clique no botão verde **"Run"** (ou pressione `Ctrl + Enter`).
7. **Pronto!** O Supabase removerá as tabelas obsoletas, criará a estrutura limpa e inserirá todos os produtos e movimentações atuais.
8. Para conferir, clique no menu lateral em **Table Editor** e veja as tabelas `produtos` e `movimentacoes` totalmente atualizadas!
