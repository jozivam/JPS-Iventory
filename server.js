const express = require('express');
const path = require('path');
require('dotenv').config();

// Inicializa banco de dados e sementes
require('./config/database');

const webRoutes = require('./src/routes/web');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do motor de visualização (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

// Middleware de arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para processar dados de formulários e JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Utilitários e helpers globais acessíveis em todas as views
app.use((req, res, next) => {
  res.locals.formatMoney = (val) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  res.locals.formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  res.locals.formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('pt-BR');
  };
  res.locals.currentPath = req.path;
  next();
});

// Rotas da aplicação
app.use('/', webRoutes);

// Tratamento de Rota 404
app.use((req, res) => {
  res.status(404).render('layouts/erro', {
    title: 'Página Não Encontrada',
    currentPage: '',
    mensagem: 'A página solicitada não foi encontrada no almoxarifado.',
    detalhes: `A rota "${req.originalUrl}" não existe.`
  });
});

// Tratamento de Erros 500
app.use((err, req, res, next) => {
  console.error('Erro interno:', err);
  res.status(500).render('layouts/erro', {
    title: 'Erro do Servidor',
    currentPage: '',
    mensagem: 'Ocorreu uma falha no processamento da requisição.',
    detalhes: err.message
  });
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`📦 JPS-Inventory (Sistema de Almoxarifado MVC)`);
  console.log(`🚀 Servidor rodando com sucesso em: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
