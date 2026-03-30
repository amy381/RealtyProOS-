export function formatPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function formatApn(raw) {
  const clean = String(raw || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!clean) return '';
  if (clean.length <= 3) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 3)}-${clean.slice(3)}`;
  return `${clean.slice(0, 3)}-${clean.slice(3, 5)}-${clean.slice(5, 9)}`;
}
