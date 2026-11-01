-- =============================================================================
-- MIGRAÇÃO DE DADOS - JPS ALMOXARIFADO
-- Gerado automaticamente a partir do banco local SQLite
-- Data de geração: 2026-11-01T22:42:53.532Z
-- =============================================================================

BEGIN;

-- =============================================================================
-- DADOS: FORNECEDORES (4 registros)
-- =============================================================================
INSERT INTO fornecedores (id, nome, cnpj, email, telefone, contato, criado_em) VALUES (1, '3M Equipamentos de Proteção', '00.000.000/0001-91', 'contato@3m-epi.com.br', '(11) 3456-7890', 'Roberto Silva', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO fornecedores (id, nome, cnpj, email, telefone, contato, criado_em) VALUES (2, 'Tramontina Ferramentas Pro', '11.111.111/0001-82', 'vendas@tramontina-pro.com', '(54) 3455-1000', 'Ana Paula', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO fornecedores (id, nome, cnpj, email, telefone, contato, criado_em) VALUES (3, 'Kalunga Papelaria e Suprimentos', '22.222.222/0001-73', 'corporativo@kalunga.com.br', '(11) 3346-9900', 'Carlos Mendes', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO fornecedores (id, nome, cnpj, email, telefone, contato, criado_em) VALUES (4, 'Schneider Eletric Distribuidora', '33.333.333/0001-64', 'suporte@schneider-dist.com', '(19) 3876-4321', 'Juliana Costa', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('fornecedores', 'id'), COALESCE((SELECT MAX(id) FROM fornecedores), 1));

-- =============================================================================
-- DADOS: ALMOXARIFADOS (4 registros)
-- =============================================================================
INSERT INTO almoxarifados (id, codigo, nome, tipo, endereco, responsavel, telefone, status, criado_em) VALUES (1, 'ALM-CENTRAL', 'Almoxarifado Central (Matriz)', 'CENTRAL', 'Av. das Indústrias, 1000 - Galpão 3', 'Eng. Roberto Albuquerque', '(11) 3456-1100', 'ATIVO', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO almoxarifados (id, codigo, nome, tipo, endereco, responsavel, telefone, status, criado_em) VALUES (2, 'OBRA-AURORA', 'Obra Residencial Aurora (Torres A e B)', 'OBRA', 'Rua das Palmeiras, 450 - Bairro Jardim', 'Mestre Valter Silva', '(11) 98765-1001', 'ATIVO', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO almoxarifados (id, codigo, nome, tipo, endereco, responsavel, telefone, status, criado_em) VALUES (3, 'OBRA-NORTE', 'Obra Viaduto & Acesso Norte', 'OBRA', 'Rodovia dos Bandeirantes, KM 42', 'Engª Juliana Costa', '(19) 99887-2002', 'ATIVO', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO almoxarifados (id, codigo, nome, tipo, endereco, responsavel, telefone, status, criado_em) VALUES (4, 'OBRA-ADM', 'Reforma Centro Administrativo', 'OBRA', 'Rua São Paulo, 120 - Centro', 'Téc. Carlos Mendes', '(11) 97654-3003', 'ATIVO', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('almoxarifados', 'id'), COALESCE((SELECT MAX(id) FROM almoxarifados), 1));

-- =============================================================================
-- DADOS: PRODUTOS (10 registros)
-- =============================================================================
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (1, 'EPI-CAP-001', NULL, 'Capacete de Segurança com Jugular Azul', 'EPI / Segurança', 'UN', 18, 10, 32.5, 'Prateleira A-01', 1, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (2, 'EPI-LUV-002', NULL, 'Luva de Vaqueta Mista Tamanho G', 'EPI / Segurança', 'PAR', 4, 15, 18.9, 'Prateleira A-02', 1, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (3, 'EPI-OCU-003', NULL, 'Óculos de Proteção Antirrisco Incolor', 'EPI / Segurança', 'UN', 25, 12, 14, 'Prateleira A-03', 1, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (4, 'FER-CHV-010', NULL, 'Jogo de Chaves de Fenda e Phillips 6 Peças', 'Ferramentas', 'JG', 8, 5, 68, 'Bancada B-04', 2, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (5, 'FER-ALC-011', NULL, 'Alicate Universal 8 Polegadas Isolado 1000V', 'Ferramentas', 'UN', 3, 6, 45.2, 'Bancada B-05', 2, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (6, 'MAT-PAP-020', NULL, 'Papel Sulfite A4 75g Caixa com 10 Resmas', 'Escritório', 'CX', 12, 5, 235, 'Almox Central C-1', 3, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (7, 'ELE-CAB-030', NULL, 'Cabo de Rede UTP Cat6 100% Cobre (Bobina 305m)', 'Elétrica e TI', 'CX', 2, 3, 490, 'Depósito D-02', 4, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (8, 'ELE-DIS-031', NULL, 'Disjuntor Bipolar Din 32A Curva C', 'Elétrica e TI', 'UN', 30, 10, 28.75, 'Gaveteiro E-08', 4, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (9, 'LIM-ALC-040', NULL, 'Álcool Isopropílico 99.8% Frasco 1 Litro', 'Manutenção / Química', 'FR', 9, 6, 26, 'Armário Químico Q-1', 3, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO produtos (id, sku, tag, nome, categoria, unidade_medida, quantidade, estoque_minimo, preco_unitario, localizacao, fornecedor_id, criado_em, atualizado_em) VALUES (10, 'EPI-PRO-005', NULL, 'Protetor Auricular Tipo Plug Silicone 16dB', 'EPI / Segurança', 'PAR', 50, 20, 3.8, 'Gaveteiro A-04', 1, '2026-11-01 08:50:08', '2026-11-01 08:50:08') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('produtos', 'id'), COALESCE((SELECT MAX(id) FROM produtos), 1));

-- =============================================================================
-- DADOS: ESTOQUES (40 registros)
-- =============================================================================
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (1, 1, 1, 3, 'Prateleira A-01', '2026-11-01 18:04:33') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (2, 1, 2, 11, 'Contêiner Obra 1', '2026-11-01 18:04:33') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (3, 1, 3, 4, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (4, 1, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (5, 2, 1, 2, 'Prateleira A-02', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (6, 2, 2, 1, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (7, 2, 3, 1, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (8, 2, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (9, 3, 1, 15, 'Prateleira A-03', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (10, 3, 2, 6, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (11, 3, 3, 4, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (12, 3, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (13, 4, 1, 4, 'Bancada B-04', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (14, 4, 2, 2, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (15, 4, 3, 2, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (16, 4, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (17, 5, 1, 0, 'Bancada B-05', '2026-11-01 18:25:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (18, 5, 2, 1, 'Contêiner Obra 1', '2026-11-01 18:25:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (19, 5, 3, 2, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (20, 5, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (21, 6, 1, 7, 'Almox Central C-1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (22, 6, 2, 3, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (23, 6, 3, 2, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (24, 6, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (25, 7, 1, 1, 'Depósito D-02', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (26, 7, 2, 0, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (27, 7, 3, 1, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (28, 7, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (29, 8, 1, 18, 'Gaveteiro E-08', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (30, 8, 2, 7, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (31, 8, 3, 5, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (32, 8, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (33, 9, 1, 5, 'Armário Químico Q-1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (34, 9, 2, 2, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (35, 9, 3, 2, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (36, 9, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (37, 10, 1, 30, 'Gaveteiro A-04', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (38, 10, 2, 12, 'Contêiner Obra 1', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (39, 10, 3, 8, 'Depósito Frente de Serviço', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO estoques (id, produto_id, almoxarifado_id, quantidade, localizacao, atualizado_em) VALUES (40, 10, 4, 0, 'Almox Auxiliar', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('estoques', 'id'), COALESCE((SELECT MAX(id) FROM estoques), 1));

-- =============================================================================
-- DADOS: MOVIMENTACOES (12 registros)
-- =============================================================================
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (1, 1, 'ENTRADA', 20, 'Compra para reposição periódica', 'Almoxarife Marcos', 'NF 10452', NULL, NULL, '2026-10-28 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (2, 1, 'SAIDA', 2, 'Entrega para equipe de Obras e Instalação', 'João Pereira (Técnico)', 'REQ-2026-088', NULL, NULL, '2026-10-29 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (3, 2, 'SAIDA', 11, 'Retirada em lote setor de Montagem', 'Lucas Silveira', 'REQ-2026-092', NULL, NULL, '2026-10-30 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (4, 4, 'ENTRADA', 10, 'Aporte de ferramentas novas', 'Gerência Fabril', 'NF 10488', NULL, NULL, '2026-10-30 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (5, 4, 'SAIDA', 2, 'Distribuição oficina mecânica', 'Mestre Valter', 'REQ-2026-095', NULL, NULL, '2026-10-31 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (6, 5, 'SAIDA', 3, 'Manutenção preventiva painéis', 'Carlos Elétrica', 'REQ-2026-101', NULL, NULL, '2026-10-31 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (7, 7, 'ENTRADA', 5, 'Aquisição projeto infraestrutura TI', 'Supervisor Paulo', 'NF 10512', NULL, NULL, '2026-10-31 12:50:08') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (8, 7, 'SAIDA', 3, 'Cabeamento novas salas Bloco B', 'Técnico Daniel', 'REQ-2026-105', NULL, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (9, 3, 'SAIDA', 5, 'Atendimento novos colaboradores', 'RH / DP', 'REQ-2026-108', NULL, NULL, NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (10, 1, 'TRANSFERENCIA', 5, 'Atendimento Requisição REQ-OBRA-001: Reforço de EPI para novas contratações na Torre B', 'Almoxarife Responsável', 'REQ-OBRA-001', 1, 2, '2026-11-01 18:04:19') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (11, 1, 'TRANSFERENCIA', 2, 'Transferência de teste', 'Supervisor Logística', 'GUIA-TRANSF', 1, 2, '2026-11-01 18:04:33') ON CONFLICT (id) DO NOTHING;
INSERT INTO movimentacoes (id, produto_id, tipo, quantidade, motivo, responsavel, documento_ref, almoxarifado_origem_id, almoxarifado_destino_id, criado_em) VALUES (12, 5, 'TRANSFERENCIA', 1, 'Transferência de alicate', 'Carlos Almoxarife', 'GUIA-TRANSF', 1, 2, '2026-11-01 18:25:08') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('movimentacoes', 'id'), COALESCE((SELECT MAX(id) FROM movimentacoes), 1));

-- =============================================================================
-- DADOS: REQUISICOES_OBRAS (3 registros)
-- =============================================================================
INSERT INTO requisicoes_obras (id, codigo, almoxarifado_origem_id, almoxarifado_destino_id, produto_id, quantidade, solicitante, motivo, status, observacoes, criado_em, atualizado_em) VALUES (1, 'REQ-OBRA-001', 1, 2, 1, 5, 'Mestre Valter Silva', 'Reforço de EPI para novas contratações na Torre B', 'FINALIZADA', 'Urgente para início da concretagem na sexta-feira', '2026-11-01 09:32:09', '2026-11-01 18:04:19') ON CONFLICT (id) DO NOTHING;
INSERT INTO requisicoes_obras (id, codigo, almoxarifado_origem_id, almoxarifado_destino_id, produto_id, quantidade, solicitante, motivo, status, observacoes, criado_em, atualizado_em) VALUES (2, 'REQ-OBRA-002', 1, 3, 2, 6, 'Engª Juliana Costa', 'Reposição de ferramentas e luvas de proteção', 'APROVADA', 'Separado no Almox Central aguardando transporte', '2026-11-01 09:32:09', '2026-11-01 09:32:09') ON CONFLICT (id) DO NOTHING;
INSERT INTO requisicoes_obras (id, codigo, almoxarifado_origem_id, almoxarifado_destino_id, produto_id, quantidade, solicitante, motivo, status, observacoes, criado_em, atualizado_em) VALUES (3, 'REQ-5925', 1, 3, 2, 4, 'Engª Juliana Costa', 'Reposição de ferramentas e luvas de proteção', 'PENDENTE', NULL, '2026-11-01 18:13:04', '2026-11-01 18:13:04') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('requisicoes_obras', 'id'), COALESCE((SELECT MAX(id) FROM requisicoes_obras), 1));

COMMIT;
