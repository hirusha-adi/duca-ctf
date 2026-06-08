import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendLoginCode(email, code) {
  const from = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  await getTransporter().sendMail({
    from: `DUCA CTF <${from}>`,
    to: email,
    subject: "Your DUCA CTF login code",
    text: `Your one-time login code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #18181b; color: #fafafa; border: 1px solid #3f3f46; border-radius: 6px;">
        <h2 style="margin: 0 0 16px; color: #14b8a6;">DUCA CTF</h2>
        <p style="color: #a1a1aa;">Your one-time login code:</p>
        <p style="font-size: 32px; font-family: monospace; letter-spacing: 8px; margin: 16px 0; color: #fafafa;">${code}</p>
        <p style="color: #a1a1aa; font-size: 14px;">This code expires in 10 minutes.</p>
      </div>
    `,
  });
}
