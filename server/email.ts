import nodemailer from "nodemailer";

function createTransport() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[2FA OTP] Code for ${to}: ${code} (SMTP not configured — set SMTP_USER + SMTP_PASS to send real emails)`);
    return;
  }
  const from = process.env.SMTP_USER!;
  await transport.sendMail({
    from: `"Mindful Trim" <${from}>`,
    to,
    subject: "Your Mindful Trim login code",
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:32px;">
        <h2 style="color:#5B8DEF;margin-bottom:8px;">Mindful Trim</h2>
        <p style="color:#444;font-size:15px;margin-bottom:24px;">Your login verification code is:</p>
        <div style="background:#F2EDE0;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#2D2D3A;">${code}</span>
        </div>
        <p style="color:#888;font-size:13px;">This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetOtpEmail(to: string, code: string, lang = "en"): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.log(`[Password Reset OTP] Code for ${to}: ${code} (SMTP not configured — set SMTP_USER + SMTP_PASS to send real emails)`);
    return;
  }
  const from = process.env.SMTP_USER!;

  const isHindi = lang === "hi";
  const subject = isHindi
    ? "अपना Mindful Trim पासवर्ड रीसेट करें"
    : "Reset your Mindful Trim password";
  const intro = isHindi
    ? "अपना पासवर्ड रीसेट करने के लिए इस कोड का उपयोग करें:"
    : "Use this code to reset your password:";
  const expiry = isHindi
    ? "यह कोड <strong>10 मिनट</strong> में समाप्त हो जाएगा। यदि आपने पासवर्ड रीसेट का अनुरोध नहीं किया था, तो इस ईमेल को अनदेखा करें।"
    : "This code expires in <strong>10 minutes</strong>. If you didn't request a password reset, you can safely ignore this email.";
  const textBody = isHindi
    ? `आपका पासवर्ड रीसेट कोड है: ${code}\n\nयह कोड 10 मिनट में समाप्त हो जाएगा। यदि आपने अनुरोध नहीं किया था, तो इस ईमेल को अनदेखा करें।`
    : `Your password reset code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`;

  await transport.sendMail({
    from: `"Mindful Trim" <${from}>`,
    to,
    subject,
    text: textBody,
    html: `
      <div style="font-family:sans-serif;max-width:420px;margin:auto;padding:32px;">
        <h2 style="color:#5B8DEF;margin-bottom:8px;">Mindful Trim</h2>
        <p style="color:#444;font-size:15px;margin-bottom:24px;">${intro}</p>
        <div style="background:#F2EDE0;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#2D2D3A;">${code}</span>
        </div>
        <p style="color:#888;font-size:13px;">${expiry}</p>
      </div>
    `,
  });
}
