const xlsx = require('xlsx');
const { Client } = require('pg');
require('dotenv').config();

async function corrigirQuantidades() {
  const caminhoPlanilha = 'C:/Users/JPS/Documents/JPS-Iventory/config/supabase/inventario_produtos_2026-11-15.xlsx';
  const wb = xlsx.readFile(caminhoPlanilha);
  const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

  console.log(`Carregadas ${rows.length} linhas da planilha.`);

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Conectado ao Supabase.');

  const resProds = await client.query('SELECT id, sku, nome, quantidade FROM produtos');
  const produtosBanco = resProds.rows;

  let atualizados = 0;

  for (const r of rows) {
    const nomePlanilha = (r['Nome do Produto'] || r['Nome'] || '').toString().trim();
    if (!nomePlanilha) continue;
    const qtdPlanilha = parseInt(r['Quantidade'] || r['Estoque'] || 0, 10) || 0;

    // Busca produto correspondente no banco (por nome exato ou normalizado)
    let prod = produtosBanco.find(p => p.nome.toLowerCase() === nomePlanilha.toLowerCase());

    if (!prod && nomePlanilha.toLowerCase().includes('bolsa ferramentas')) {
      prod = produtosBanco.find(p => p.nome.toLowerCase().includes('bolsa ferramentas'));
    }

    if (prod) {
      // Atualiza o produto com a quantidade exata da planilha
      await client.query('UPDATE produtos SET quantidade = $1 WHERE id = $2', [qtdPlanilha, prod.id]);

      // Atualiza a movimentação de carga inicial correspondente
      await client.query(`
        UPDATE movimentacoes 
        SET quantidade = $1 
        WHERE produto_id = $2 
          AND tipo = 'ENTRADA' 
          AND (motivo ILIKE '%carga inicial%' OR motivo ILIKE '%importação%')
      `, [qtdPlanilha, prod.id]);

      atualizados++;
      console.log(`Corrigido [${prod.sku}] ${prod.nome}: De ${prod.quantidade} para ${qtdPlanilha}`);
    } else {
      console.warn(`Item não encontrado no banco: "${nomePlanilha}"`);
    }
  }

  // Verifica novo saldo total
  const resTotal = await client.query('SELECT COUNT(*) as total_itens, SUM(quantidade) as total_unidades FROM produtos');
  console.log('\n--- RESULTADO DA CORREÇÃO NO SUPABASE ---');
  console.log(`Itens atualizados: ${atualizados}`);
  console.log(`Total de produtos: ${resTotal.rows[0].total_itens}`);
  console.log(`Total de unidades físicas em estoque: ${resTotal.rows[0].total_unidades} UN (esperado: 664)`);

  // Mostra as Calças Elétricas conferidas
  const resCalcas = await client.query("SELECT sku, nome, quantidade FROM produtos WHERE nome ILIKE '%calça eletrica%' ORDER BY id ASC");
  console.log('\nCalças Elétricas conferidas:');
  console.table(resCalcas.rows);

  await client.end();
}

corrigirQuantidades().catch(console.error);
