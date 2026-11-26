/**
 * Guest nicknames for the El Tapón high-score table. The shape is validated by `guestNameSchema` (shared); this
 * adds a small word filter (Spanish / Dominican and English slurs and obscenities) and keeps names that look like
 * staff accounts out. It is deliberately simple: administrators can hide any entry from Admin → Puntuaciones.
 */

/** Lower-case, accents removed (ñ → n) and common leetspeak undone. */
export function normalizeNick(s: string): string {
  const leet: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i' };
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0134578@$!]/g, (c) => leet[c] ?? c);
}

/** Offensive anywhere in the name (even glued to other words). Chosen so they do not hide inside normal words. */
const ANYWHERE = [
  'mamaguevo', 'mamaguebo', 'mamahuevo', 'mamawebo', 'hijueputa', 'hijoeputa', 'hijodeputa', 'maricon', 'singao', 'singada',
  'singadera', 'pendejo', 'pendeja', 'cabron', 'puneta', 'mierda', 'verga', 'chocha', 'nigger', 'nigga', 'faggot', 'fuck',
  'shit', 'bitch', 'cunt', 'whore', 'pussy', 'porno', 'violador', 'pedofil', 'hitler', 'nazi',
];
/** Offensive as a whole word only (they appear inside harmless words such as “vehículo” or “computadora”). */
const WORDS = ['puta', 'puto', 'putas', 'putos', 'culo', 'culos', 'toto', 'cuero', 'singa', 'singar', 'mmg', 'hdp', 'ctm', 'sexo', 'pene', 'perra', 'zorra'];
/** Names that could pass for the platform or its staff. */
const RESERVED = ['admin', 'moderador', 'dominicangames', 'soporte', 'staff', 'oficial'];

// Each letter may be repeated (“puuuta”), but a double letter in the word stays required (“perra” ≠ “pera”).
const stretch = (w: string) => w.split('').map((c) => `${c}+`).join('');
const ANYWHERE_RX = ANYWHERE.map((w) => new RegExp(stretch(w)));
const WORDS_RX = WORDS.map((w) => new RegExp(`^${stretch(w)}$`));
const RESERVED_RX = RESERVED.map((w) => new RegExp(stretch(w)));

export type NickProblem = 'offensive' | 'reserved' | null;

export function nickProblem(name: string): NickProblem {
  const n = normalizeNick(name);
  const compact = n.replace(/[^a-z]/g, '');
  if (RESERVED_RX.some((r) => r.test(compact))) return 'reserved';
  if (ANYWHERE_RX.some((r) => r.test(compact))) return 'offensive';
  const tokens = n.split(/[^a-z]+/).filter(Boolean);
  if (tokens.some((t) => WORDS_RX.some((r) => r.test(t)))) return 'offensive';
  return null;
}
