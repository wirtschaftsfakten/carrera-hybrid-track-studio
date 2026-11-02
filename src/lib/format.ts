export const num = (n: number, digits = 0) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const cm = (mm: number) => `${num(mm / 10)} cm`;
export const m = (mm: number) => `${num(mm / 1000, 2)} m`;
export const size = (w: number, h: number) => `${num(w / 10)} × ${cm(h)}`;
