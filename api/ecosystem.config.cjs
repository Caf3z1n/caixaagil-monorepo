module.exports = {
  apps: [
    {
      name: 'caixaagil-api',
      script: 'dist/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '350M',
      time: true,
    },
  ],
};
