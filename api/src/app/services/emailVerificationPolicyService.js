function isEmailVerificationBypassEnabled() {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  const value = String(process.env.EMAIL_VERIFICATION_BYPASS_FOR_TESTS || '')
    .trim()
    .toLowerCase();

  return ['1', 'true', 'yes', 'sim'].includes(value);
}

function isEmailVerified(usuario) {
  return Boolean(usuario?.email_verificado_em) || isEmailVerificationBypassEnabled();
}

function getEmailVerifiedAtForNewAccount() {
  return isEmailVerificationBypassEnabled() ? new Date() : null;
}

module.exports = {
  getEmailVerifiedAtForNewAccount,
  isEmailVerificationBypassEnabled,
  isEmailVerified,
};
