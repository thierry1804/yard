export function posLabel(z, r, c) {
  return `${z}-Bay${String(c + 1).padStart(2, '0')}-R${String(r + 1).padStart(2, '0')}`;
}
