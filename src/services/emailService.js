const nodemailer = require('nodemailer');
const config = require('../config/appConfig');

let transporter = null;

const isEmailConfigured = () => {
  return Boolean(config.email.user) && Boolean(config.email.appPassword);
};

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD.');
  }

  transporter = nodemailer.createTransport({
    service: config.email.service,
    auth: {
      user: config.email.user,
      pass: config.email.appPassword,
    },
  });

  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  const client = getTransporter();

  return client.sendMail({
    from: `Charity System <${config.email.user}>`,
    to,
    subject,
    text,
    html,
  });
};

const sendOTPEmail = async ({ to, otpCode, expiresInMinutes = 5, purpose = 'verify' }) => {
  const purposeLabel = purpose === 'reset' ? 'Password Reset' : 'Account Verification';
  const subject = `${purposeLabel} OTP Code`;
  const text = `Your OTP Code: ${otpCode}\nExpires in ${expiresInMinutes} minutes`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>${purposeLabel}</h2>
      <p>Your OTP Code:</p>
      <p style="font-size:24px; font-weight:bold; letter-spacing:4px;">${otpCode}</p>
      <p>Expires in ${expiresInMinutes} minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject,
    text,
    html,
  });
};

module.exports = {
  isEmailConfigured,
  sendEmail,
  sendOTPEmail,
};
