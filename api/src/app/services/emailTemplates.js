function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createEmailShell({
  preview,
  title,
  badge,
  intro,
  notice,
  actionLabel,
  actionUrl,
  logoUrl,
}) {
  const safeTitle = escapeHtml(title);
  const safeBadge = escapeHtml(badge);
  const safeLogoUrl = logoUrl ? escapeHtml(logoUrl) : '';
  const safeActionUrl = escapeHtml(actionUrl);
  const logoMarkup = safeLogoUrl
    ? `<img src="${safeLogoUrl}" width="34" height="34" alt="Caixa Ágil" style="display:inline-block;width:34px;height:34px;border:0;vertical-align:middle;margin-right:12px;" />`
    : '<span style="display:inline-block;width:34px;height:34px;line-height:34px;text-align:center;border-radius:50%;background:#ffffff;color:#ff5a00;font-size:24px;font-weight:900;vertical-align:middle;margin-right:12px;">&#9889;</span>';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;background:#eef1f5;color:#0b1220;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef1f5;padding:34px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe4ea;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:26px 30px;background:#ff5a00;color:#ffffff;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle" style="white-space:nowrap;">
                      ${logoMarkup}
                      <span style="display:inline-block;color:#ffffff;font-size:24px;font-weight:900;line-height:34px;vertical-align:middle;">CAIXA &Aacute;GIL</span>
                    </td>
                    <td align="right" valign="middle" style="color:#ffffff;font-size:12px;font-weight:800;line-height:1.3;">${safeBadge}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 30px 12px;">
                <h1 style="margin:0;color:#070d1d;font-size:30px;line-height:1.12;font-weight:900;">${safeTitle}</h1>
                <p style="margin:14px 0 0;color:#4b5563;font-size:15px;line-height:1.6;">${intro}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 30px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fff7ef;border:1px solid #ffc48f;border-left:6px solid #ff5a00;border-radius:10px;">
                  <tr>
                    <td style="padding:17px 18px;">
                      <p style="margin:0;color:#111827;font-size:14px;line-height:1.55;">${notice}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 30px 18px;">
                <a href="${safeActionUrl}" style="display:inline-block;background:#ff5a00;color:#ffffff;text-decoration:none;border-radius:9px;padding:15px 23px;font-size:15px;font-weight:900;">
                  ${escapeHtml(actionLabel)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 30px 30px;">
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.55;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
                <p style="margin:8px 0 0;color:#0b57d0;font-size:12px;line-height:1.5;word-break:break-all;">
                  <a href="${safeActionUrl}" style="color:#0b57d0;text-decoration:underline;">${safeActionUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px;background:#f7f8fa;border-top:1px solid #e9edf2;">
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">Caixa &Aacute;gil, PDV para vender, controlar estoque e fechar o caixa com mais clareza.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function createAccountVerificationEmail({ expiresInMinutes, logoUrl, recipientEmail, verificationUrl }) {
  const safeEmail = escapeHtml(recipientEmail);
  const subject = 'Verifique sua conta do Caixa Ágil';
  const html = createEmailShell({
    preview: 'Confirme este e-mail para continuar o cadastro no Caixa Ágil.',
    title: 'Confirme seu e-mail',
    badge: 'Verificação de conta',
    intro: `Clique no botão abaixo para confirmar a conta <strong style="color:#0b57d0;">${safeEmail}</strong> e continuar o cadastro.`,
    notice: `O link abaixo é válido por <strong>${expiresInMinutes} minutos</strong>. Se você não criou essa conta, pode ignorar este e-mail.`,
    actionLabel: 'Verificar conta',
    actionUrl: verificationUrl,
    logoUrl,
  });
  const text = [
    subject,
    '',
    `Confirme a conta ${recipientEmail} para continuar o cadastro.`,
    `O link é válido por ${expiresInMinutes} minutos.`,
    '',
    verificationUrl,
  ].join('\n');

  return { html, subject, text };
}

function createPasswordResetEmail({ expiresInMinutes, logoUrl, recipientEmail, resetUrl }) {
  const safeEmail = escapeHtml(recipientEmail);
  const subject = 'Redefina sua senha do Caixa Ágil';
  const html = createEmailShell({
    preview: 'Use este link para criar uma nova senha do Caixa Ágil.',
    title: 'Crie uma nova senha',
    badge: 'Redefinição de senha',
    intro: `Recebemos uma solicitação para redefinir a senha da conta <strong style="color:#0b57d0;">${safeEmail}</strong>.`,
    notice: `O link abaixo é válido por <strong>${expiresInMinutes} minutos</strong>. Se você não pediu essa alteração, pode ignorar este e-mail.`,
    actionLabel: 'Redefinir senha',
    actionUrl: resetUrl,
    logoUrl,
  });
  const text = [
    subject,
    '',
    `Recebemos uma solicitação para redefinir a senha da conta ${recipientEmail}.`,
    `O link é válido por ${expiresInMinutes} minutos.`,
    '',
    resetUrl,
  ].join('\n');

  return { html, subject, text };
}

function createEmailChangeVerificationEmail({ currentEmail, expiresInMinutes, logoUrl, newEmail, verificationUrl }) {
  const safeCurrentEmail = escapeHtml(currentEmail);
  const safeNewEmail = escapeHtml(newEmail);
  const subject = 'Confirme o novo e-mail do Caixa Ágil';
  const html = createEmailShell({
    preview: 'Confirme este endereço para concluir a troca de e-mail da conta.',
    title: 'Confirme o novo e-mail',
    badge: 'Troca de e-mail',
    intro: `Recebemos uma solicitação para trocar o e-mail da conta <strong style="color:#0b57d0;">${safeCurrentEmail}</strong> para <strong style="color:#0b57d0;">${safeNewEmail}</strong>.`,
    notice: `O link abaixo é válido por <strong>${expiresInMinutes} minutos</strong>. A troca só será aplicada depois desta confirmação.`,
    actionLabel: 'Confirmar e-mail',
    actionUrl: verificationUrl,
    logoUrl,
  });
  const text = [
    subject,
    '',
    `Confirme a troca do e-mail ${currentEmail} para ${newEmail}.`,
    `O link é válido por ${expiresInMinutes} minutos.`,
    '',
    verificationUrl,
  ].join('\n');

  return { html, subject, text };
}

module.exports = {
  createAccountVerificationEmail,
  createEmailChangeVerificationEmail,
  createPasswordResetEmail,
};
