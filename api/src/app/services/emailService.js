async function sendEmail({ to, subject, html, text }) {
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    const error = new Error('Nao foi possivel enviar o email agora. Tente novamente em instantes.');
    error.statusCode = 500;
    throw error;
  }

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Caixa Agil <${process.env.RESEND_FROM_EMAIL || 'noreply@eticasistemas.com.br'}>`,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const result = await resendResponse.json().catch(() => null);

  if (!resendResponse.ok) {
    const error = new Error(result?.message || 'Nao foi possivel enviar o email.');
    error.statusCode = resendResponse.status;
    throw error;
  }

  return {
    id: result?.id || null,
  };
}

module.exports = {
  sendEmail,
};
