module.exports = {
  apps: [
    {
      name: 'caixaagil-api',
      script: 'dist/server.js',
      cwd: process.env.CAIXAAGIL_API_CWD || __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '350M',
      time: true,
    },
  ],
};
