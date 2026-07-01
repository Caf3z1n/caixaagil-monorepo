require('dotenv').config();

const productionRequirements = [
  'NODE_ENV',
  'PORT',
  'APP_URL',
  'API_URL',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  { anyOf: ['DB_USERNAME', 'DB_USER'], label: 'DB_USERNAME ou DB_USER' },
  'DB_PASSWORD',
  'JWT_SECRET',
  'RESEND_API_KEY',
  'RESEND_FROM_EMAIL',
  'MERCADO_PAGO_SITE_URL',
  'MERCADO_PAGO_LOCAL_BACK_URL',
  'MERCADO_PAGO_ACCESS_TOKEN',
  'MERCADO_PAGO_WEBHOOK_SECRET',
  'FISCAL_CONFIG_SECRET',
  'ARQUIVOS_STORAGE_DIR',
  'RUSTDESK_SERVER_HOST',
  'RUSTDESK_RELAY_HOST',
  'RUSTDESK_PUBLIC_KEY',
  'RUSTDESK_CONFIG_STRING',
  'RUSTDESK_INSTALLER_URL',
  'RUSTDESK_INSTALLER_SHA256',
];

function isFilled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function checkRequirement(requirement) {
  if (typeof requirement === 'string') {
    return isFilled(process.env[requirement]) ? null : requirement;
  }

  if (requirement.anyOf?.some((key) => isFilled(process.env[key]))) {
    return null;
  }

  return requirement.label || requirement.anyOf.join(' ou ');
}

function main() {
  const profile = process.argv[2] || process.env.NODE_ENV || 'development';

  if (profile !== 'production') {
    console.log(`Sem checagem obrigatoria para ambiente ${profile}.`);
    return;
  }

  const missing = productionRequirements.map(checkRequirement).filter(Boolean);

  if (missing.length > 0) {
    console.error('Env de producao incompleto. Atualize /home/deploy/caixaagil/shared/api.env.');
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    process.exit(1);
  }

  console.log(`Env de producao validado: ${productionRequirements.length} requisitos atendidos.`);
}

main();
