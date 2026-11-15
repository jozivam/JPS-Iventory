const path = require('path');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;
const isSupabaseDriver = process.env.DB_DRIVER === 'supabase';

let db = null;

function initDatabase() {
  if (!db) return;

  // Criação exclusiva das tabelas de Produtos (Inventário) e Movimentações
  db.exec(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      nome TEXT,
      categoria TEXT DEFAULT 'Geral',
      marca TEXT,
      unidade_medida TEXT DEFAULT 'UN',
      quantidade INTEGER NOT NULL DEFAULT 0,
      estoque_minimo INTEGER NOT NULL DEFAULT 0,
      preco_unitario REAL DEFAULT 0.0,
      localizacao TEXT,
      tamanho TEXT,
      cor TEXT,
      peso TEXT,
      numero_serie TEXT,
      ca TEXT,
      patrimonio TEXT,
      tag TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS movimentacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      colaborador_id INTEGER,
      tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO', 'TROCA')),
      quantidade INTEGER NOT NULL CHECK(quantidade > 0),
      motivo TEXT,
      responsavel TEXT,
      documento_ref TEXT,
      colaborador TEXT,
      status_emprestimo TEXT,
      data_devolucao DATETIME,
      movimentacao_origem_id INTEGER,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
      FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS colaboradores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      matricula TEXT UNIQUE,
      cargo TEXT,
      departamento TEXT,
      email TEXT,
      telefone TEXT,
      tipo_perfil TEXT NOT NULL DEFAULT 'TECNICO' CHECK(tipo_perfil IN ('TECNICO', 'SISTEMA')),
      nivel_acesso TEXT NOT NULL DEFAULT 'SOLICITANTE' CHECK(nivel_acesso IN ('SOLICITANTE', 'ADMIN', 'ALMOXARIFE', 'VISUALIZADOR')),
      status TEXT NOT NULL DEFAULT 'ATIVO' CHECK(status IN ('ATIVO', 'INATIVO')),
      observacoes TEXT,
      criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
      atualizado_em DATETIME DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Migração segura para atualizar constraint e colunas de movimentações
  const movSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'movimentacoes'").get()?.sql || '';
  if (movSql && !movSql.includes('EMPRESTIMO')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE movimentacoes_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA', 'SAIDA', 'EMPRESTIMO', 'DEVOLUCAO', 'TROCA')),
        quantidade INTEGER NOT NULL CHECK(quantidade > 0),
        motivo TEXT,
        responsavel TEXT,
        documento_ref TEXT,
        colaborador TEXT,
        status_emprestimo TEXT,
        data_devolucao DATETIME,
        movimentacao_origem_id INTEGER,
        criado_em DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
      );
      INSERT INTO movimentacoes_new (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em)
      SELECT id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, criado_em FROM movimentacoes;
      DROP TABLE movimentacoes;
      ALTER TABLE movimentacoes_new RENAME TO movimentacoes;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Garante colunas de movimentações caso tabela já tenha sido criada sem elas
  const colsMovExistentes = db.prepare('PRAGMA table_info(movimentacoes)').all().map(c => c.name);
  const colunasMovNecessarias = [
    { nome: 'colaborador', tipo: 'TEXT' },
    { nome: 'colaborador_id', tipo: 'INTEGER' },
    { nome: 'status_emprestimo', tipo: 'TEXT' },
    { nome: 'data_devolucao', tipo: 'DATETIME' },
    { nome: 'movimentacao_origem_id', tipo: 'INTEGER' }
  ];
  colunasMovNecessarias.forEach(col => {
    if (!colsMovExistentes.includes(col.nome)) {
      db.exec(`ALTER TABLE movimentacoes ADD COLUMN ${col.nome} ${col.tipo}`);
    }
  });

  // Migração segura para adicionar novas colunas caso o banco já exista
  const colunasNecessarias = [
    { nome: 'marca', tipo: 'TEXT' },
    { nome: 'tamanho', tipo: 'TEXT' },
    { nome: 'cor', tipo: 'TEXT' },
    { nome: 'peso', tipo: 'TEXT' },
    { nome: 'numero_serie', tipo: 'TEXT' },
    { nome: 'ca', tipo: 'TEXT' },
    { nome: 'patrimonio', tipo: 'TEXT' },
    { nome: 'tag', tipo: 'TEXT' }
  ];

  const colsExistentes = db.prepare('PRAGMA table_info(produtos)').all().map(c => c.name);
  colunasNecessarias.forEach(col => {
    if (!colsExistentes.includes(col.nome)) {
      db.exec(`ALTER TABLE produtos ADD COLUMN ${col.nome} ${col.tipo}`);
    }
  });

  // Sementes iniciais caso a tabela esteja vazia
  const countProd = db.prepare('SELECT COUNT(*) as total FROM produtos').get();
  if (countProd.total === 0) {
    seedDatabase();
  }

  // Sementes iniciais de colaboradores caso a tabela esteja vazia
  const countColab = db.prepare('SELECT COUNT(*) as total FROM colaboradores').get();
  if (countColab.total === 0) {
    seedColaboradores();
  }
}

function seedColaboradores() {
  if (!db) return;

  const seedColabs = [
    {
      nome: 'Jozivam Silva',
      matricula: 'ALM-001',
      cargo: 'Gestor de Almoxarifado',
      departamento: 'Almoxarifado & Logística',
      email: 'jozivam.silva@empresa.com',
      telefone: '(11) 98765-4321',
      tipo_perfil: 'SISTEMA',
      nivel_acesso: 'ADMIN',
      status: 'ATIVO',
      observacoes: 'Administrador geral do sistema de almoxarifado'
    },
    {
      nome: 'Carlos Pereira',
      matricula: 'TEC-101',
      cargo: 'Eletricista de Manutenção',
      departamento: 'Manutenção Elétrica',
      email: 'carlos.pereira@empresa.com',
      telefone: '(11) 97654-3210',
      tipo_perfil: 'TECNICO',
      nivel_acesso: 'SOLICITANTE',
      status: 'ATIVO',
      observacoes: 'Técnico de campo para requisição de materiais elétricos e ferramentas'
    },
    {
      nome: 'Marcos Souza',
      matricula: 'TEC-102',
      cargo: 'Técnico de Redes e TI',
      departamento: 'TI / Telecom',
      email: 'marcos.souza@empresa.com',
      telefone: '(11) 96543-2109',
      tipo_perfil: 'TECNICO',
      nivel_acesso: 'SOLICITANTE',
      status: 'ATIVO',
      observacoes: 'Técnico responsável por cabeamento e infraestrutura de TI'
    },
    {
      nome: 'Lucas Mendes',
      matricula: 'TEC-103',
      cargo: 'Encarregado de Obras',
      departamento: 'Operações e Obras',
      email: 'lucas.mendes@empresa.com',
      telefone: '(11) 95432-1098',
      tipo_perfil: 'TECNICO',
      nivel_acesso: 'SOLICITANTE',
      status: 'ATIVO',
      observacoes: 'Responsável por solicitações de EPIs e ferramentas pesadas'
    },
    {
      nome: 'Ana Paula Ribeiro',
      matricula: 'ALM-002',
      cargo: 'Assistente de Almoxarifado',
      departamento: 'Almoxarifado & Logística',
      email: 'ana.ribeiro@empresa.com',
      telefone: '(11) 94321-0987',
      tipo_perfil: 'SISTEMA',
      nivel_acesso: 'ALMOXARIFE',
      status: 'ATIVO',
      observacoes: 'Atendente de balcão e conferência de notas fiscais'
    }
  ];

  const insertColab = db.prepare(`
    INSERT INTO colaboradores (
      nome, matricula, cargo, departamento, email, telefone,
      tipo_perfil, nivel_acesso, status, observacoes
    ) VALUES (
      @nome, @matricula, @cargo, @departamento, @email, @telefone,
      @tipo_perfil, @nivel_acesso, @status, @observacoes
    )
  `);

  const tx = db.transaction(() => {
    seedColabs.forEach(c => insertColab.run(c));
  });

  tx();
}

function seedDatabase() {
  if (!db) return;

  const seedProdutos = [
    { sku: 'FER-ALC-001', nome: 'Alicate Universal 8 Polegadas Isolado 1000V', categoria: 'Ferramentas', marca: 'Tramontina Pro', unidade: 'UN', qtd: 12, min: 5, preco: 45.20, local: 'Bancada B-05', tamanho: '8"', cor: 'Amarelo/Vermelho', peso: '380g', patrimonio: 'PAT-0010', tag: 'FER-01', ca: null, numero_serie: 'SN-7841' },
    { sku: 'ELE-CAB-030', nome: 'Cabo de Rede UTP Cat6 100% Cobre (Bobina 305m)', categoria: 'Elétrica e TI', marca: 'Furukawa', unidade: 'CX', qtd: 2, min: 4, preco: 490.00, local: 'Depósito D-02', tamanho: '305m', cor: 'Azul', peso: '12.5kg', patrimonio: null, tag: 'TI-09', ca: null, numero_serie: 'BOB-2026-X' },
    { sku: 'EPI-CAP-001', nome: 'Capacete de Segurança com Jugular Azul', categoria: 'EPI / Segurança', marca: 'MSA', unidade: 'UN', qtd: 18, min: 10, preco: 32.50, local: 'Prateleira A-01', tamanho: 'Único', cor: 'Azul', peso: '310g', patrimonio: null, tag: null, ca: '31469', numero_serie: null },
    { sku: 'ELE-DIS-031', nome: 'Disjuntor Bipolar Din 32A Curva C', categoria: 'Elétrica e TI', marca: 'Schneider Electric', unidade: 'UN', qtd: 30, min: 10, preco: 28.75, local: 'Gaveteiro E-08', tamanho: 'Padrão DIN', cor: 'Branco', peso: '180g', patrimonio: null, tag: null, ca: null, numero_serie: null },
    { sku: 'FER-CHV-010', nome: 'Jogo de Chaves de Fenda e Phillips 6 Peças', categoria: 'Ferramentas', marca: 'Gedore', unidade: 'JG', qtd: 8, min: 3, preco: 68.00, local: 'Bancada B-04', tamanho: '6 Peças', cor: 'Vermelho', peso: '520g', patrimonio: 'PAT-0015', tag: 'FER-05', ca: null, numero_serie: null },
    { sku: 'EPI-LUV-002', nome: 'Luva de Vaqueta Mista Tamanho G', categoria: 'EPI / Segurança', marca: 'Danny', unidade: 'PAR', qtd: 4, min: 15, preco: 18.90, local: 'Prateleira A-03', tamanho: 'G', cor: 'Cinza', peso: '120g', patrimonio: null, tag: null, ca: '28450', numero_serie: null },
    { sku: 'SUP-FIT-005', nome: 'Fita Isolante 3M Imperial 19mm x 20m', categoria: 'Elétrica e TI', marca: '3M', unidade: 'UN', qtd: 45, min: 10, preco: 9.80, local: 'Gaveteiro E-01', tamanho: '19mm x 20m', cor: 'Preto', peso: '80g', patrimonio: null, tag: null, ca: null, numero_serie: null },
    { sku: 'FER-TRN-003', nome: 'Trena Métrica Profissional 8 Metros Emborrachada', categoria: 'Ferramentas', marca: 'Lufkin', unidade: 'UN', qtd: 0, min: 5, preco: 35.00, local: 'Bancada B-01', tamanho: '8m', cor: 'Laranja/Preto', peso: '320g', patrimonio: null, tag: null, ca: null, numero_serie: null }
  ];

  const insertProd = db.prepare(`
    INSERT INTO produtos (
      sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, 
      preco_unitario, localizacao, tamanho, cor, peso, numero_serie, ca, patrimonio, tag
    ) VALUES (
      @sku, @nome, @categoria, @marca, @unidade, @qtd, @min, 
      @preco, @local, @tamanho, @cor, @peso, @numero_serie, @ca, @patrimonio, @tag
    )
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
          motivo: 'Carga inicial do inventário',
          responsavel: 'Jozivam Silva',
          documento_ref: 'IMPLANTACAO-01'
        });
      }
    });
  });

  tx();
}

// Inicializa SQLite apenas quando rodando localmente (fora da Vercel e sem driver Supabase)
if (!isVercel && !isSupabaseDriver) {
  try {
    const Database = require('better-sqlite3');
    const dbPath = path.resolve(__dirname, 'almoxarifado.sqlite');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDatabase();
  } catch (err) {
    console.error('Aviso ao inicializar SQLite local:', err.message);
  }
} else {
  console.log('Ambiente em nuvem/Vercel ou DB_DRIVER=supabase ativo. SQLite local desativado com segurança.');
}

module.exports = db;
