# 📦 JPS Almoxarifado - Sistema de Controle de Estoque MVC

Sistema profissional de gestão e controle de almoxarifado desenvolvido na arquitetura **MVC (Model-View-Controller)** com **Node.js**, **Express**, **EJS** e **SQLite**.

---

## 🗂️ Estrutura de Pastas e Arquitetura

O projeto foi estruturado exatamente conforme as boas práticas do padrão MVC:

```
├── config/                  # Configurações do banco de dados e variáveis de ambiente
│   ├── app.js               # Configurações gerais da aplicação
│   ├── database.js          # Conexão SQLite, tabelas e dados iniciais (seed)
│   └── almoxarifado.sqlite  # Arquivo do banco de dados local
├── public/                  # Arquivos estáticos acessíveis diretamente pelo navegador
│   ├── css/
│   │   └── style.css        # Folha de estilo moderna, tema escuro refinado e responsivo
│   └── js/
│       └── main.js          # Scripts globais, validação dinâmica de estoque e modais
├── src/                     # Código-fonte principal do sistema
│   ├── models/              # Modelos de dados e regras de negócio
│   │   ├── Produto.js       # Definição do item, SKU, estoque mínimo e regras
│   │   ├── Movimentacao.js  # Registro atômico de baixas (saídas) e entradas (NF)
│   │   └── Fornecedor.js    # Gestão de parceiros e fornecedores
│   ├── controllers/         # Intermediadores entre as requisições e as models
│   │   ├── DashboardController.js  # Métricas, KPIs e dados de consumo para gráficos
│   │   ├── ProdutoController.js    # Listagem com filtros, cadastro, edição e exclusão
│   │   ├── EstoqueController.js    # Ações de dar baixa e entrada com conferência de saldo
│   │   ├── FornecedorController.js # Cadastro e manutenção de fornecedores
│   │   └── RelatorioController.js  # Análise de giro, cotação e consumo mensal
│   ├── views/               # Interfaces com o usuário (templates EJS)
│   │   ├── layouts/         # Componentes compartilhados (header, sidebar, footer, erro)
│   │   ├── dashboard/       # Painel com gráficos interativos (Chart.js) e alertas
│   │   ├── produtos/        # Listagem (index), novo (create) e edição (edit)
│   │   ├── movimentacoes/   # Histórico (index) e tela de baixa/entrada (create)
│   │   ├── fornecedores/    # Listagem e modal de cadastro de parceiros (index)
│   │   └── relatorios/      # Relatório gerencial com impressão / exportação em PDF
│   └── routes/              # Mapeamento de rotas e URLs
│       └── web.js           # Rotas web direcionando requisições aos controladores
├── .env                     # Variáveis de ambiente locais
├── server.js                # Ponto de entrada do servidor Express
└── package.json             # Dependências e scripts do projeto
```

---

## 🚀 Como Executar o Sistema

### 1. Pré-requisitos
- **Node.js** (versão 18 ou superior instalada).

### 2. Instalação das dependências
Abra o terminal na pasta do projeto e execute:
```bash
npm install
```

### 3. Iniciar o servidor
Para modo de produção ou execução padrão:
```bash
npm start
```

Ou em modo desenvolvimento com auto-reload:
```bash
npm run dev
```

### 4. Acessar no Navegador
Abra o navegador e acerte:
👉 **[http://localhost:3000](http://localhost:3000)**

*(O banco de dados SQLite é inicializado automaticamente com dados realistas de EPIs, ferramentas, suprimentos e movimentações para teste imediato).*

---

## 🛠️ Funcionalidades Implementadas

1. **Painel Geral (Dashboard)**:
   - Indicadores em tempo real: Total de itens cadastrados, valor patrimonial do estoque em R$, total de itens com estoque baixo/crítico.
   - Gráfico de Movimentações (Entradas vs Saídas nos últimos 7 dias) via Chart.js.
   - Gráfico de Distribuição do Almoxarifado por Categoria.
   - Alertas com botão de reposição rápida para itens abaixo do estoque mínimo.

2. **Catálogo de Produtos**:
   - Rastreamento por código SKU único com gerador automático.
   - Controle de estoque mínimo de segurança.
   - Barra de progresso visual de nível de estoque.
   - Filtros instantâneos (por busca textual, categoria e status).
   - Ações rápidas de dar baixa, entrada, editar ou excluir de forma segura.

3. **Movimentações de Estoque**:
   - Operações atômicas com SQLite: garante que o saldo de estoque seja atualizado de forma segura e consistente.
   - Validação em tempo real: impede baixa de quantidade superior ao saldo em estoque.
   - Histórico completo com data, responsável, motivo e documento (NF/Requisição).

4. **Gestão de Fornecedores**:
   - Cadastro e vinculação de materiais a fornecedores parceiros com CNPJ e contato.

5. **Relatórios Gerenciais**:
   - Análise de giro (itens mais requisitados).
   - Relação de itens em déficit com custo estimado para reposição.
   - Layout preparado para impressão e exportação nativa em PDF (`Ctrl + P`).
