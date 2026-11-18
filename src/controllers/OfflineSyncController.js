const Produto = require('../models/Produto');
const Movimentacao = require('../models/Movimentacao');
const Colaborador = require('../models/Colaborador');

class OfflineSyncController {
  /**
   * Ping ultraleve para verificar conectividade real com o servidor
   */
  static ping(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      ok: true,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * Processa uma operação da fila offline enviada pelo aparelho quando a conexão retorna
   */
  static async sync(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const { action, fields, created_at } = req.body || {};

      if (!action || !fields) {
        return res.status(400).json({
          ok: false,
          conflito: true,
          erro: 'Dados da operação offline incompletos.'
        });
      }

      // 1. Lançamento no Balcão (/balcao/registrar)
      if (action === '/balcao/registrar') {
        const {
          produto_id, tipo, quantidade, colaborador, colaborador_id,
          responsavel, motivo, documento_ref
        } = fields;

        if (!produto_id) {
          return res.status(422).json({ ok: false, conflito: true, erro: 'Produto não informado.' });
        }

        const qtd = parseInt(quantidade, 10);
        if (!qtd || qtd <= 0) {
          return res.status(422).json({ ok: false, conflito: true, erro: 'Quantidade inválida.' });
        }

        if (tipo === 'SAIDA' || tipo === 'EMPRESTIMO' || tipo === 'TROCA') {
          const prod = await Produto.findById(parseInt(produto_id, 10));
          if (!prod) {
            return res.status(422).json({ ok: false, conflito: true, erro: 'Produto não encontrado no servidor.' });
          }
          const un = prod.unidade_medida || 'UN';
          if (Number(prod.quantidade) <= 0) {
            return res.status(422).json({
              ok: false,
              conflito: true,
              erro: `Produto "${prod.nome}" está zerado (0 ${un}) no servidor.`
            });
          }
          if (Number(prod.quantidade) < qtd) {
            return res.status(422).json({
              ok: false,
              conflito: true,
              erro: `Saldo insuficiente no servidor para "${prod.nome}": disponível ${prod.quantidade} ${un}, solicitado ${qtd} ${un}.`
            });
          }
        }

        const colabFinal = (colaborador && String(colaborador).trim()) ? String(colaborador).trim() : 'Balcão';
        const obsOffline = created_at
          ? `[Offline ${new Date(created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}]`
          : '[Offline]';
        const motivoFinal = motivo && String(motivo).trim()
          ? `${String(motivo).trim()} ${obsOffline}`
          : `Lançamento sincronizado ${obsOffline}`;

        const resultado = await Movimentacao.registrar({
          produto_id: parseInt(produto_id, 10),
          tipo,
          quantidade: qtd,
          colaborador: colabFinal,
          colaborador_id: colaborador_id ? parseInt(colaborador_id, 10) : null,
          responsavel: responsavel ? String(responsavel).trim() : 'Almoxarife',
          motivo: motivoFinal,
          documento_ref: documento_ref ? String(documento_ref).trim() : null
        });

        return res.json({
          ok: true,
          mensagem: `${tipo} de ${qtd} UN de "${resultado.produto_nome}" sincronizada (Saldo: ${resultado.novo_saldo}).`,
          dados: resultado
        });
      }

      // 2. Devolução de Empréstimo (/balcao/devolver/:id)
      const matchDevolver = action.match(/^\/balcao\/devolver\/(\d+)$/);
      if (matchDevolver) {
        const movId = matchDevolver[1];
        const resultado = await Movimentacao.devolverEmprestimo(movId, {
          responsavel: fields.responsavel ? String(fields.responsavel).trim() : 'Atendente do Balcão',
          motivo: fields.motivo ? String(fields.motivo).trim() : 'Devolução sincronizada do modo offline',
          documento_ref: fields.documento_ref ? String(fields.documento_ref).trim() : null
        });

        return res.json({
          ok: true,
          mensagem: `Devolução de "${resultado.produto_nome}" sincronizada (Saldo: ${resultado.novo_saldo}).`,
          dados: resultado
        });
      }

      // 3. Cadastro de Novo Produto (/produtos)
      if (action === '/produtos') {
        const {
          sku, nome, categoria, categoria_personalizada, marca, unidade_medida,
          quantidade, estoque_minimo, localizacao,
          tamanho, cor, peso, numero_serie, ca, patrimonio, tag, observacao, condicao
        } = fields;

        let categoriaFinal = categoria || 'Outros';
        if (categoria === 'Outros' && categoria_personalizada && String(categoria_personalizada).trim()) {
          categoriaFinal = String(categoria_personalizada).trim();
        }

        if (sku && String(sku).trim()) {
          const existente = await Produto.findBySku(String(sku).trim().toUpperCase());
          if (existente) {
            return res.status(422).json({
              ok: false,
              conflito: true,
              erro: `SKU "${String(sku).trim().toUpperCase()}" já existe no servidor.`
            });
          }
        }

        if (nome && String(nome).trim()) {
          const prodNome = await Produto.findByNomeExato(String(nome).trim());
          if (prodNome) {
            return res.status(422).json({
              ok: false,
              conflito: true,
              erro: `Produto "${prodNome.nome}" já está cadastrado (${prodNome.sku}).`
            });
          }
        }

        const qtdInicial = parseInt(quantidade, 10) || 0;
        const produtoId = await Produto.create({
          sku,
          nome: nome && String(nome).trim() ? String(nome).trim() : 'Item sem descrição',
          categoria: categoriaFinal,
          marca: marca && String(marca).trim() ? String(marca).trim() : null,
          unidade_medida: unidade_medida || 'UN',
          quantidade: 0,
          estoque_minimo: parseInt(estoque_minimo, 10) || 0,
          localizacao,
          tamanho,
          cor,
          peso,
          numero_serie,
          ca,
          patrimonio,
          tag,
          observacao,
          condicao: condicao || 'NOVO'
        });

        if (qtdInicial > 0) {
          await Movimentacao.registrar({
            produto_id: produtoId,
            tipo: 'ENTRADA',
            quantidade: qtdInicial,
            motivo: 'Carga inicial no cadastro offline do produto',
            responsavel: 'Jozivam Silva',
            documento_ref: 'CADASTRO-OFFLINE'
          });
        }

        return res.json({
          ok: true,
          mensagem: `Produto "${nome || 'Novo item'}" cadastrado e sincronizado!`,
          dados: { id: produtoId }
        });
      }

      // 4. Edição de Produto (/produtos/:id/editar)
      const matchEditarProd = action.match(/^\/produtos\/(\d+)\/editar$/);
      if (matchEditarProd) {
        const prodId = matchEditarProd[1];
        await Produto.update(prodId, {
          ...fields,
          quantidade: fields.quantidade !== undefined ? parseInt(fields.quantidade, 10) : undefined,
          estoque_minimo: fields.estoque_minimo !== undefined ? parseInt(fields.estoque_minimo, 10) : undefined
        });

        return res.json({
          ok: true,
          mensagem: `Alterações do produto #${prodId} sincronizadas!`
        });
      }

      // 5. Cadastro de Colaborador (/colaboradores)
      if (action === '/colaboradores') {
        const colab = await Colaborador.create(fields);
        return res.json({
          ok: true,
          mensagem: `Colaborador "${colab.nome}" cadastrado e sincronizado!`,
          dados: colab
        });
      }

      return res.status(400).json({
        ok: false,
        conflito: true,
        erro: `Operação "${action}" não suportada na sincronização offline.`
      });
    } catch (error) {
      console.error('Erro na sincronização offline:', error);
      return res.status(422).json({
        ok: false,
        conflito: true,
        erro: error.message || 'Erro ao sincronizar registro no servidor.'
      });
    }
  }
}

module.exports = OfflineSyncController;
