require('dotenv').config();
const app = require('./app');
const sequelize = require('./database');

const port = process.env.PORT || 3333;

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log('Conexao com o banco estabelecida');
  } catch (error) {
    console.error('Nao foi possivel conectar ao banco:', error);
    process.exit(1);
  }

  app.listen(port, () => {
    console.log(`API caixaagil ouvindo na porta ${port}`);
  });
};

start();
