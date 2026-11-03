// Text shared by the on-screen payment voucher and its PDF.

import { COMPANY } from './company';

export { COMPANY };
export const PAYER_NAME = COMPANY.name;

const fmtKes = (n) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(n || 0);

// "Till 123456" / "Paybill 400200" / the phone number
export const recipientNumberLine = (v) => {
  if (!v.recipientPhone) return null;
  if (v.recipientKind === 'till')    return `Till ${v.recipientPhone}`;
  if (v.recipientKind === 'paybill') return `Paybill ${v.recipientPhone}`;
  return v.recipientPhone;
};

// Only a completed payment with an M-Pesa code has a confirmation to show.
export const hasConfirmation = (v) => v.status === 'completed' && !!v.mpesaCode;

// Same facts and order as Safaricom's confirmation SMS: code, amount, who, when.
export const confirmationText = (v) => {
  const paidAt  = new Date(v.paidAt || v.date);
  const day     = paidAt.toLocaleDateString('en-KE', { day: 'numeric', month: 'numeric', year: '2-digit' });
  const time    = paidAt.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
  const number  = recipientNumberLine(v);
  const account = v.recipientKind === 'paybill' && v.destinationAccount ? ` for account ${v.destinationAccount}` : '';
  const to      = v.recipientName
    ? `${v.recipientName}${number ? ` (${number})` : ''}`
    : (number || 'the recipient');
  return `${v.mpesaCode} Confirmed. ${fmtKes(v.amount)} sent to ${to}${account} on ${day} at ${time} by ${PAYER_NAME}.`;
};

export const confirmationNote = (v) =>
  `From Safaricom's result for this transaction. Quote the code ${v.mpesaCode} to check it on your M-Pesa statement.`;
