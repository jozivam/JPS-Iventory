const express = require('express');
const path = require('path');
require('dotenv').config();

// Inicializa banco de dados e sementes
require('./config/database');

const webRoutes = require('./src/routes/web');

const app = express();
// Configuração da porta do servidor
const PORT = process.env.PORT || 3001;

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
  const appTimeZone = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Cuiaba';

  res.locals.formatMoney = (val) => {
    return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  res.locals.formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const str = String(dateStr).trim();
    // Se for formato SQL sem timezone (ex: "YYYY-MM-DD HH:MM:SS"), já foi gravado na hora local
    if (!str.includes('T') && !str.includes('Z') && !str.includes('+') && str.length >= 16) {
      const ano = str.substring(0, 4);
      const mes = str.substring(5, 7);
      const dia = str.substring(8, 10);
      const horaMin = str.substring(11, 16);
      return `${dia}/${mes}/${ano} ${horaMin}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    try {
      return d.toLocaleDateString('pt-BR', { timeZone: appTimeZone }) + ' ' + 
             d.toLocaleTimeString('pt-BR', { timeZone: appTimeZone, hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  };

  res.locals.formatShortDate = (dateStr) => {
    if (!dateStr) return '-';
    const str = String(dateStr).trim();
    if (!str.includes('T') && !str.includes('Z') && !str.includes('+') && str.length >= 10) {
      const ano = str.substring(0, 4);
      const mes = str.substring(5, 7);
      const dia = str.substring(8, 10);
      return `${dia}/${mes}/${ano}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    try {
      return d.toLocaleDateString('pt-BR', { timeZone: appTimeZone });
    } catch (e) {
      return d.toLocaleDateString('pt-BR');
    }
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

// Exporta a aplicação para a Vercel Serverless Function
module.exports = app;

// Só inicia o servidor localmente se NÃO estiver rodando na Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`📦 JPS-Inventory (Sistema de Almoxarifado MVC)`);
    console.log(`🚀 Servidor rodando com sucesso em: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}
