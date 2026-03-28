/**
 * Transforme les notes en liste pour l’affichage à puces.
 * - Si MongoDB envoie un **tableau de chaînes**, on garde chaque entrée telle quelle
 *   (une phrase peut contenir des virgules sans être coupée).
 * - Sinon (ancienne donnée **une seule chaîne**), on découpe encore sur les virgules.
 */
export function importantNotesToItems(raw: unknown): string[] {
  if (raw == null) return [];

  if (Array.isArray(raw)) {
    return raw
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);
  }

  const s = String(raw).trim();
  if (!s) return [];
  return s
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
