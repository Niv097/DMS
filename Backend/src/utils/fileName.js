const SUSPICIOUS_MOJIBAKE_PATTERN = /(?:Ã.|Â.|â[\u0080-\u00BF]|�)/;

const countSuspiciousTokens = (value = '') => {
  const matches = String(value || '').match(/(?:Ã.|Â.|â[\u0080-\u00BF]|�)/g);
  return matches ? matches.length : 0;
};

export const normalizeDisplayFileName = (value) => {
  const input = String(value || '');
  if (!input) {
    return input;
  }

  if (!SUSPICIOUS_MOJIBAKE_PATTERN.test(input)) {
    return input;
  }

  const decoded = Buffer.from(input, 'latin1').toString('utf8');
  if (!decoded || decoded.includes('�')) {
    return input;
  }

  return countSuspiciousTokens(decoded) < countSuspiciousTokens(input) ? decoded : input;
};
