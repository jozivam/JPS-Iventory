const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'almoxarifado.sqlite');
const db = new Database(dbPath);

// Habilitar chaves estrangeiras e modo WAL para melhor performance e concorrência
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Criação das tabelas essenciais
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      cnpj TEXT,
      email TEXT,
      telefone TEXT,
      contato TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      tag TEXT,
      nome TEXT,
      categoria TEXT DEFAULT 'Geral',
      unidade_medida TEXT DEFAULT 'UN',
      quantidade INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      preco_unitario REAL DEFAULT 0.0,
      localizacao TEXT,
      fornecedor_id INTEGER,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA')),
      quantidade INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      responsavel TEXT NOT NULL,
      documento_ref TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    );
  `);

  // Migração segura para bases existentes adicionando a coluna tag se não existir
  try {
    db.exec(`ALTER TABLE produtos ADD COLUMN tag TEXT;`);
  } catch (e) {
    // Coluna já existe
  }

  // Inserir dados de demonstração realistas se o banco estiver vazio
  const fornecedorCount = db.prepare('SELECT COUNT(*) AS total FROM fornecedores').get().total;
  if (fornecedorCount === 0) {
    seedDatabase();
  }
}

function seedDatabase() {
  const insertFornecedor = db.prepare(`
    INSERT INTO fornecedores (nome, cnpj, email, telefone, contato)
    VALUES (?, ?, ?, ?, ?)
  `);

  const f1 = insertFornecedor.run('3M Equipamentos de Proteção', '00.000.000/0001-91', 'contato@3m-epi.com.br', '(11) 3456-7890', 'Roberto Silva').lastInsertRowid;
  const f2 = insertFornecedor.run('Tramontina Ferramentas Pro', '11.111.111/0001-82', 'vendas@tramontina-pro.com', '(54) 3455-1000', 'Ana Paula').lastInsertRowid;
  const f3 = insertFornecedor.run('Kalunga Papelaria e Suprimentos', '22.222.222/0001-73', 'corporativo@kalunga.com.br', '(11) 3346-9900', 'Carlos Mendes').lastInsertRowid;
  const f4 = insertFornecedor.run('Schneider Eletric Distribuidora', '33.333.333/0001-64', 'suporte@schneider-dist.com', '(19) 3876-4321', 'Juliana Costa').lastInsertRowid;

  const insertProduto = db.prepare(`
    INSERT INTO produtos (sku, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const p1 = insertProduto.run('EPI-CAP-001', 'Capacete de Segurança com Jugular Azul', 'EPI / Segurança', 'UN', 18, 10, 32.50, 'Prateleira A-01', f1).lastInsertRowid;
  const p2 = insertProduto.run('EPI-LUV-002', 'Luva de Vaqueta Mista Tamanho G', 'EPI / Segurança', 'PAR', 4, 15, 18.90, 'Prateleira A-02', f1).lastInsertRowid; // Estoque crítico!
  const p3 = insertProduto.run('EPI-OCU-003', 'Óculos de Proteção Antirrisco Incolor', 'EPI / Segurança', 'UN', 25, 12, 14.00, 'Prateleira A-03', f1).lastInsertRowid;
  const p4 = insertProduto.run('FER-CHV-010', 'Jogo de Chaves de Fenda e Phillips 6 Peças', 'Ferramentas', 'JG', 8, 5, 68.00, 'Bancada B-04', f2).lastInsertRowid;
  const p5 = insertProduto.run('FER-ALC-011', 'Alicate Universal 8 Polegadas Isolado 1000V', 'Ferramentas', 'UN', 3, 6, 45.20, 'Bancada B-05', f2).lastInsertRowid; // Estoque baixo!
  const p6 = insertProduto.run('MAT-PAP-020', 'Papel Sulfite A4 75g Caixa com 10 Resmas', 'Escritório', 'CX', 12, 5, 235.00, 'Almox Central C-1', f3).lastInsertRowid;
  const p7 = insertProduto.run('ELE-CAB-030', 'Cabo de Rede UTP Cat6 100% Cobre (Bobina 305m)', 'Elétrica e TI', 'CX', 2, 3, 490.00, 'Depósito D-02', f4).lastInsertRowid; // Estoque baixo!
  const p8 = insertProduto.run('ELE-DIS-031', 'Disjuntor Bipolar Din 32A Curva C', 'Elétrica e TI', 'UN', 30, 10, 28.75, 'Gaveteiro E-08', f4).lastInsertRowid;
  const p9 = insertProduto.run('LIM-ALC-040', 'Álcool Isopropílico 99.8% Frasco 1 Litro', 'Manutenção / Química', 'FR', 9, 6, 26.00, 'Armário Químico Q-1', f3).lastInsertRowid;
  const p10 = insertProduto.run('EPI-PRO-005', 'Protetor Auricular Tipo Plug Silicone 16dB', 'EPI / Segurança', 'PAR', 50, 20, 3.80, 'Gaveteiro A-04', f1).lastInsertRowid;

  const insertMov = db.prepare(`
    INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now', ?))
  `);

  insertMov.run(p1, 'ENTRADA', 20, 'Compra para reposição periódica', 'Almoxarife Marcos', 'NF 10452', '-4 days');
  insertMov.run(p1, 'SAIDA', 2, 'Entrega para equipe de Obras e Instalação', 'João Pereira (Técnico)', 'REQ-2026-088', '-3 days');
  insertMov.run(p2, 'SAIDA', 11, 'Retirada em lote setor de Montagem', 'Lucas Silveira', 'REQ-2026-092', '-2 days');
  insertMov.run(p4, 'ENTRADA', 10, 'Aporte de ferramentas novas', 'Gerência Fabril', 'NF 10488', '-2 days');
  insertMov.run(p4, 'SAIDA', 2, 'Distribuição oficina mecânica', 'Mestre Valter', 'REQ-2026-095', '-1 days');
  insertMov.run(p5, 'SAIDA', 3, 'Manutenção preventiva painéis', 'Carlos Elétrica', 'REQ-2026-101', '-1 days');
  insertMov.run(p7, 'ENTRADA', 5, 'Aquisição projeto infraestrutura TI', 'Supervisor Paulo', 'NF 10512', '-1 days');
  insertMov.run(p7, 'SAIDA', 3, 'Cabeamento novas salas Bloco B', 'Técnico Daniel', 'REQ-2026-105', 'now');
  insertMov.run(p3, 'SAIDA', 5, 'Atendimento novos colaboradores', 'RH / DP', 'REQ-2026-108', 'now');
}

// Inicializar tabelas e seeds
initDatabase();

module.exports = db;
