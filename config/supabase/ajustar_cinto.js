const { Client } = require('pg');
require('dotenv').config();

async function ajustarCinto() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  // Deixa o Cinto Paraquedista original com 4 unidades
  await client.query("UPDATE produtos SET quantidade = 4 WHERE sku = 'EPI-9293'");
  await client.query("UPDATE movimentacoes SET quantidade = 4 WHERE produto_id = 16 AND tipo = 'ENTRADA'");

  // Cria o Cinto Paraquedista (Reuso) com 15 unidades e condicao REUSO
  const resNovo = await client.query(`
    INSERT INTO produtos (sku, nome, categoria, marca, unidade_medida, quantidade, estoque_minimo, localizacao, condicao)
    VALUES ('EPI-9294', 'Cinto Paraquedista (Reuso)', 'EPI/Segurança', 'ATHENAS', 'UN', 15, 0, 'Ferramentaria Elétrica', 'REUSO')
    RETURNING id
  `);
  const novoId = resNovo.rows[0].id;

  await client.query(`
    INSERT INTO movimentacoes (produto_id, tipo, quantidade, motivo, responsavel, documento_ref)
    VALUES ($1, 'ENTRADA', 15, 'Carga inicial via importação Excel', 'Importação em Lote', 'PLANILHA-IMPORT')
  `, [novoId]);

  const resTotal = await client.query('SELECT COUNT(*) as total_itens, SUM(quantidade) as total_unidades FROM produtos');
  console.log('Total produtos agora:', resTotal.rows[0].total_itens);
  console.log('Total unidades agora:', resTotal.rows[0].total_unidades);

  const resCintos = await client.query("SELECT id, sku, nome, quantidade, condicao FROM produtos WHERE nome ILIKE '%cinto%'");
  console.table(resCintos.rows);

  await client.end();
}

ajustarCinto().catch(console.error);
