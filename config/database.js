const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, 'almoxarifado.sqlite');
const db = new Database(dbPath);

// Otimizações de desempenho e integridade
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  // Criação exclusiva das tabelas de Produtos (Inventário) e Movimentações
  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      categoria TEXT DEFAULT 'Geral',
      unidade_medida TEXT DEFAULT 'UN',
      quantidade INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      preco_unitario REAL DEFAULT 0.0,
      localizacao TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA')),
      quantidade INTEGER NOT NULL CHECK(quantidade > 0),
      motivo TEXT,
      responsavel TEXT NOT NULL,
      documento_ref TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
    );
  `);

  // Sementes iniciais caso o banco esteja zerado
  const countProd = db.prepare('SELECT COUNT(*) as total FROM produtos').get();
  if (countProd.total === 0) {
    seedDatabase();
  }
}

function seedDatabase() {
  const seedProdutos = [
    { sku: 'FER-ALC-001', nome: 'Alicate Universal 8 Polegadas Isolado 1000V', categoria: 'Ferramentas', unidade: 'UN', qtd: 12, min: 5, preco: 45.20, local: 'Bancada B-05' },
    { sku: 'ELE-CAB-030', nome: 'Cabo de Rede UTP Cat6 100% Cobre (Bobina 305m)', categoria: 'Elétrica e TI', unidade: 'CX', qtd: 2, min: 4, preco: 490.00, local: 'Depósito D-02' },
    { sku: 'EPI-CAP-001', nome: 'Capacete de Segurança com Jugular Azul', categoria: 'EPI / Segurança', unidade: 'UN', qtd: 18, min: 10, preco: 32.50, local: 'Prateleira A-01' },
    { sku: 'ELE-DIS-031', nome: 'Disjuntor Bipolar Din 32A Curva C', categoria: 'Elétrica e TI', unidade: 'UN', qtd: 30, min: 10, preco: 28.75, local: 'Gaveteiro E-08' },
    { sku: 'FER-CHV-010', nome: 'Jogo de Chaves de Fenda e Phillips 6 Peças', categoria: 'Ferramentas', unidade: 'JG', qtd: 8, min: 3, preco: 68.00, local: 'Bancada B-04' },
    { sku: 'EPI-LUV-002', nome: 'Luva de Vaqueta Mista Tamanho G', categoria: 'EPI / Segurança', unidade: 'PAR', qtd: 4, min: 15, preco: 18.90, local: 'Prateleira A-03' },
    { sku: 'SUP-FIT-005', nome: 'Fita Isolante 3M Imperial 19mm x 20m', categoria: 'Elétrica e TI', unidade: 'UN', qtd: 45, min: 10, preco: 9.80, local: 'Gaveteiro E-01' },
    { sku: 'FER-TRN-003', nome: 'Trena Métrica Profissional 8 Metros Emborrachada', categoria: 'Ferramentas', unidade: 'UN', qtd: 0, min: 5, preco: 35.00, local: 'Bancada B-01' }
  ];

  const insertProd = db.prepare(`
    INSERT INTO produtos (sku, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao)
    VALUES (@sku, @nome, @categoria, @unidade, @qtd, @min, @preco, @local)
  `);

  const insertMov = db.prepare(`
    INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, documento_ref)
    VALUES (@produto_id, @tipo, @quantidade, @motivo, @responsavel, @documento_ref)
  `);

  const tx = db.transaction(() => {
    seedProdutos.forEach(p => {
      const res = insertProd.run(p);
      if (p.qtd > 0) {
        insertMov.run({
          produto_id: res.lastInsertRowid,
          tipo: 'ENTRADA',
          quantidade: p.qtd,
          motivo: 'Estoque inicial / Carga do almoxarifado',
          responsavel: 'Jozivam Silva',
          documento_ref: 'IMPLANTACAO-01'
        });
      }
    });
  });

  tx();
}

// Inicializa banco de dados
initDatabase();

module.exports = db;
