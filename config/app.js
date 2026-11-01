require('dotenv').config();

module.exports = {
  appName: process.env.APP_NAME || 'JPS Almoxarifado',
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  email: {
    admin: process.env.MAIL_ADMIN || 'almoxarifado@empresa.com.br',
    host: process.env.MAIL_HOST || 'smtp.mailtrap.io',
    port: process.env.MAIL_PORT || 2525
  }
};
