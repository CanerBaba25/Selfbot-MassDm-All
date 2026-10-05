'use strict';

// Discord error objects may include request bodies. Never log those or tokens.
module.exports = (context, error) => {
  const code = error?.code;
  const safeCode = typeof code === 'number' || (typeof code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(code));
  console.error(`${context}${safeCode ? ` (code: ${code})` : ''}.`);
};
