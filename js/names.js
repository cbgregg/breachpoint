// Name Tag filter for public play. Names that contain slurs or strong profanity (including common
// letter swaps like 4→a, 1→i, $→s, and padding like "f.u.c.k") are replaced with a neutral Name Tag.
const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't' };
// matched anywhere in the squashed name (long, unambiguous stems)
const STRONG = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'pussy', 'porn', 'rapist', 'nigg', 'fagg', 'faggot', 'tranny', 'retard',
  'wetback', 'beaner', 'raghead', 'towelhead', 'hitler', 'nazi', 'kkk', 'jizz', 'molest', 'pedophile', 'kike',
];
// matched only as a whole word (too many innocent names contain them: Dickens, Peacock, Cumulus…)
const WORDS = [
  'dick', 'cock', 'cum', 'rape', 'fag', 'spic', 'chink', 'gook', 'coon', 'paki', 'heil', 'penis', 'vagina', 'negro', 'dyke', 'pedo',
  'ass', 'arse', 'tit', 'tits', 'hoe', 'hoes', 'piss', 'twat', 'wank', 'anal', 'sex', 'nude', 'nudes', 'fuk', 'fck', 'fvck', 'niga', 'nigga',
];

function squash(s) {
  return s.toLowerCase().split('').map(ch => LEET[ch] ?? ch).join('')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function isOffensive(name) {
  const base = squash(String(name || ''));
  const letters = base.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
  const lettersRaw = base.replace(/[^a-z]/g, '');
  if (STRONG.some(w => {
    const c = w.replace(/(.)\1+/g, '$1');
    return lettersRaw.includes(w) || (c.length >= 4 && letters.includes(c));
  })) return true;
  // words split by spaces/punctuation, plus camelCase pieces
  const parts = String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2');
  const tokens = squash(parts).split(/[^a-z]+/).filter(Boolean);
  return tokens.some(t => WORDS.includes(t) || WORDS.includes(t.replace(/(.)\1+/g, '$1')));
}

// stable replacement so the same player keeps the same stand-in name
export function safeName(name) {
  if (!isOffensive(name)) return name;
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `Operator-${(h % 900) + 100}`;
}
