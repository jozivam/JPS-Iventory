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

    CREATE TABLE IF NOT EXISTS almoxarifados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT DEFAULT 'OBRA',
      endereco TEXT,
      responsavel TEXT,
      telefone TEXT,
      status TEXT DEFAULT 'ATIVO',
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

    CREATE TABLE IF NOT EXISTS estoques (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      almoxarifado_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 0,
      localizacao TEXT,
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (almoxarifado_id) REFERENCES almoxarifados(id) ON DELETE CASCADE,
      UNIQUE(produto_id, almoxarifado_id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      motivo TEXT NOT NULL,
      responsavel TEXT NOT NULL,
      documento_ref TEXT,
      almoxarifado_origem_id INTEGER,
      almoxarifado_destino_id INTEGER,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (almoxarifado_origem_id) REFERENCES almoxarifados(id) ON DELETE SET NULL,
      FOREIGN KEY (almoxarifado_destino_id) REFERENCES almoxarifados(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS requisicoes_obras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE,
      almoxarifado_origem_id INTEGER NOT NULL,
      almoxarifado_destino_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      solicitante TEXT NOT NULL,
      motivo TEXT,
      status TEXT DEFAULT 'PENDENTE',
      observacoes TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (almoxarifado_origem_id) REFERENCES almoxarifados(id),
      FOREIGN KEY (almoxarifado_destino_id) REFERENCES almoxarifados(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );
  `);

  // Migrações seguras de colunas caso o banco já existisse
  try { db.exec(`ALTER TABLE produtos ADD COLUMN tag TEXT;`); } catch (e) {}
  try { db.exec(`ALTER TABLE movimentacoes ADD COLUMN almoxarifado_origem_id INTEGER REFERENCES almoxarifados(id);`); } catch (e) {}
  try { db.exec(`ALTER TABLE movimentacoes ADD COLUMN almoxarifado_destino_id INTEGER REFERENCES almoxarifados(id);`); } catch (e) {}

  // Migração segura para tabela movimentacoes se contiver a restrição antiga CHECK ('ENTRADA', 'SAIDA')
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='movimentacoes'").get();
    if (tableInfo && tableInfo.sql.includes("CHECK(tipo IN ('ENTRADA', 'SAIDA'))")) {
      db.pragma('foreign_keys = OFF');
      db.exec(`
        CREATE TABLE movimentacoes_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          produto_id INTEGER NOT NULL,
          tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA', 'TRANSFERENCIA')),
          quantidade INTEGER NOT NULL,
          motivo TEXT NOT NULL,
          responsavel TEXT NOT NULL,
          documento_ref TEXT,
          almoxarifado_origem_id INTEGER,
          almoxarifado_destino_id INTEGER,
          criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
          FOREIGN KEY (almoxarifado_origem_id) REFERENCES almoxarifados(id) ON DELETE SET NULL,
          FOREIGN KEY (almoxarifado_destino_id) REFERENCES almoxarifados(id) ON DELETE SET NULL
        );

        INSERT INTO movimentacoes_new (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em)
        SELECT id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em FROM movimentacoes;

        DROP TABLE movimentacoes;
        ALTER TABLE movimentacoes_new RENAME TO movimentacoes;
      `);
      db.pragma('foreign_keys = ON');
    }
  } catch (e) {}

  // Inserir almoxarifados padrão se a tabela estiver vazia
  const almoxCount = db.prepare('SELECT COUNT(*) AS total FROM almoxarifados').get().total;
  if (almoxCount === 0) {
    seedAlmoxarifados();
  }

  // Sincronizar estoques para cada produto nos almoxarifados
  syncEstoques();
}

function seedAlmoxarifados() {
  const insertAlmox = db.prepare(`
    INSERT INTO almoxarifados (codigo, nome, tipo, endereco, responsavel, telefone, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const a1 = insertAlmox.run('ALM-CENTRAL', 'Almoxarifado Central (Matriz)', 'CENTRAL', 'Av. das Indústrias, 1000 - Galpão 3', 'Eng. Roberto Albuquerque', '(11) 3456-1100', 'ATIVO').lastInsertRowid;
  const a2 = insertAlmox.run('OBRA-AURORA', 'Obra Residencial Aurora (Torres A e B)', 'OBRA', 'Rua das Palmeiras, 450 - Bairro Jardim', 'Mestre Valter Silva', '(11) 98765-1001', 'ATIVO').lastInsertRowid;
  const a3 = insertAlmox.run('OBRA-NORTE', 'Obra Viaduto & Acesso Norte', 'OBRA', 'Rodovia dos Bandeirantes, KM 42', 'Engª Juliana Costa', '(19) 99887-2002', 'ATIVO').lastInsertRowid;
  const a4 = insertAlmox.run('OBRA-ADM', 'Reforma Centro Administrativo', 'OBRA', 'Rua São Paulo, 120 - Centro', 'Téc. Carlos Mendes', '(11) 97654-3003', 'ATIVO').lastInsertRowid;
}

function syncEstoques() {
  const central = db.prepare("SELECT id FROM almoxarifados WHERE codigo = 'ALM-CENTRAL'").get();
  const aurora = db.prepare("SELECT id FROM almoxarifados WHERE codigo = 'OBRA-AURORA'").get();
  const norte = db.prepare("SELECT id FROM almoxarifados WHERE codigo = 'OBRA-NORTE'").get();
  const adm = db.prepare("SELECT id FROM almoxarifados WHERE codigo = 'OBRA-ADM'").get();

  if (!central) return;

  const produtos = db.prepare('SELECT * FROM produtos').all();
  const checkEstoque = db.prepare('SELECT id, quantidade FROM estoques WHERE produto_id = ? AND almoxarifado_id = ?');
  const insertEstoque = db.prepare('INSERT OR IGNORE INTO estoques (produto_id, almoxarifado_id, quantidade, localizacao) VALUES (?, ?, ?, ?)');
  const updateEstoque = db.prepare('UPDATE estoques SET quantidade = ? WHERE id = ?');

  for (const p of produtos) {
    // Verifica se já tem registro no almoxarifado central
    const estCentral = checkEstoque.get(p.id, central.id);
    if (!estCentral) {
      // Distribui estoque de demonstração de forma realista entre as obras
      const qtdTotal = p.quantidade || 0;
      const qtdCentral = Math.max(0, Math.floor(qtdTotal * 0.6));
      const qtdAurora = Math.max(0, Math.floor(qtdTotal * 0.25));
      const qtdNorte = Math.max(0, qtdTotal - qtdCentral - qtdAurora);

      insertEstoque.run(p.id, central.id, qtdCentral, p.localizacao || 'Galpão Central');
      if (aurora) insertEstoque.run(p.id, aurora.id, qtdAurora, 'Contêiner Obra 1');
      if (norte) insertEstoque.run(p.id, norte.id, qtdNorte, 'Depósito Frente de Serviço');
      if (adm) insertEstoque.run(p.id, adm.id, 0, 'Almox Auxiliar');
    }
  }

  // Cria requisições de exemplo para canteiros de obras se estiver vazio
  const reqCount = db.prepare('SELECT COUNT(*) AS total FROM requisicoes_obras').get().total;
  if (reqCount === 0 && aurora && central && produtos.length > 0) {
    const insertReq = db.prepare(`
      INSERT INTO requisicoes_obras (codigo, almoxarifado_origem_id, almoxarifado_destino_id, produto_id, quantidade, solicitante, motivo, status, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertReq.run(
      'REQ-OBRA-001',
      central.id,
      aurora.id,
      produtos[0].id,
      5,
      'Mestre Valter Silva',
      'Reforço de EPI para novas contratações na Torre B',
      'PENDENTE',
      'Urgente para início da concretagem na sexta-feira'
    );

    if (produtos.length > 1 && norte) {
      insertReq.run(
        'REQ-OBRA-002',
        central.id,
        norte.id,
        produtos[1].id,
        6,
        'Engª Juliana Costa',
        'Reposição de ferramentas e luvas de proteção',
        'APROVADA',
        'Separado no Almox Central aguardando transporte'
      );
    }
  }
}

// Inicializar tabelas e seeds
initDatabase();

module.exports = db;
