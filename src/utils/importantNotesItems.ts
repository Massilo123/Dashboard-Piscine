/**
 * Découpe les notes (souvent saisies comme phrases séparées par des virgules)
 * en éléments affichables en liste à puces.
 */
export function importantNotesToItems(raw: unknown): string[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  return s
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
