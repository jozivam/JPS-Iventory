# 🚀 Guia de Migração para o Supabase (PostgreSQL) - JPS Almoxarifado

Todo o ecossistema do **JPS Almoxarifado** está preparado para rodar no **Supabase**.

---

## 📁 Arquivos Preparados na Pasta `config/supabase/`

| Arquivo | Descrição |
| :--- | :--- |
| **`schema_supabase.sql`** | Script DDL completo em PostgreSQL com as 6 tabelas (`fornecedores`, `almoxarifados`, `produtos`, `estoques`, `movimentacoes`, `requisicoes_obras`), triggers automáticos de `atualizado_em`, índices de alta performance e políticas de segurança RLS. |
| **`dados_supabase.sql`** | Backup completo gerado automaticamente a partir do seu banco de dados atual SQLite com todos os cadastros, saldos e históricos, além de sincronização de IDs (`setval`). |
| **`export_sqlite_to_supabase.js`** | Utilitário para reexportar dados do SQLite a qualquer momento (`npm run db:export`). |
| **`import_to_supabase.js`** | Script automatizado que se conecta diretamente ao Supabase e executa o schema e os dados (`npm run db:migrate-supabase`). |
| **`../supabase.js`** | Módulo de conexão em Node.js com suporte tanto a REST SDK (`@supabase/supabase-js`) quanto a Pooler PostgreSQL (`pg`). |

---

## 🛠️ Passo a Passo para Migração

### Passo 1: Criar o Projeto no Supabase
1. Acesse [https://supabase.com](https://supabase.com) e entre na sua conta.
2. Clique em **"New Project"**.
3. Defina:
   - **Name:** `JPS-Almoxarifado` (ou o nome que desejar)
   - **Database Password:** Crie uma senha forte e **guarde-a**.
   - **Region:** `São Paulo (sa-east-1)` (recomendado para menor latência no Brasil).
4. Clique em **"Create new project"** e aguarde cerca de 1 a 2 minutos.

---

### Passo 2: Executar o Schema e os Dados no Supabase

Você pode escolher **uma** das duas opções abaixo:

#### Opção A (Via Painel do Supabase - Mais Rápida e Visual)
1. No painel do seu projeto no Supabase, clique no menu lateral em **SQL Editor**.
2. Clique em **"New Query"**.
3. Abra o arquivo [`config/supabase/schema_supabase.sql`](file:///c:/Users/JPS/Documents/JPS-Iventory/config/supabase/schema_supabase.sql), copie todo o conteúdo, cole no editor do Supabase e clique no botão verde **"Run"**.
   - *Isso criará todas as tabelas, triggers, chaves estrangeiras e índices.*
4. Abra uma nova query no SQL Editor, copie o conteúdo de [`config/supabase/dados_supabase.sql`](file:///c:/Users/JPS/Documents/JPS-Iventory/config/supabase/dados_supabase.sql), cole e clique em **"Run"**.
   - *Isso importará todos os seus fornecedores, canteiros, materiais e históricos de transferências existentes.*
5. Vá em **Table Editor** no menu lateral e veja todas as tabelas e dados populados!

#### Opção B (100% Automática via Linha de Comando)
1. No Supabase Dashboard, vá em **Project Settings** -> **Database**.
2. Na seção **Connection string**, selecione a aba **URI** e o modo **Transaction** (porta 6543).
3. Copie a URL e cole no seu arquivo `.env`:
   ```env
   DATABASE_URL="postgres://postgres.[ref-do-projeto]:[sua-senha]@aws-0-[regiao].pooler.supabase.com:6543/postgres?pgbouncer=true"
   ```
4. No terminal, execute:
   ```bash
   npm run db:migrate-supabase
   ```
   O script testará a conexão, criará a estrutura e importará todos os dados automaticamente.

---

### Passo 3: Configurar as Variáveis no `.env` do Projeto
No seu arquivo `.env`, preencha as variáveis obtidas no Supabase (**Project Settings** -> **API** e **Database**):

```env
DB_DRIVER=supabase
SUPABASE_URL=https://[seu-projeto].supabase.co
SUPABASE_ANON_KEY=[sua-chave-anon-publica]
SUPABASE_SERVICE_ROLE_KEY=[sua-chave-service-role-secreta]
DATABASE_URL=postgres://postgres.[ref]:[senha]@aws-0-[regiao].pooler.supabase.com:6543/postgres?pgbouncer=true
```
