export function extractStringParam(p: any, keys: string[], isPsbt = false): string {
  if (!p) return '';
  // 1. If p is an object with the key
  for (const key of keys) {
    if (p[key] && typeof p[key] === 'string') return p[key];
  }
  
  if (Array.isArray(p)) {
    // 2. If it's an array of objects
    for (const item of p) {
      if (item && typeof item === 'object') {
        for (const key of keys) {
          if (item[key] && typeof item[key] === 'string') return item[key];
        }
      }
    }
    
    // 3. If it's an array of strings (e.g. [address, message] or [message, address])
    // Addresses usually start with bc1, 1, 3, 0x, or are short.
    // PSBTs are very long and usually start with cHNid (base64) or 70736274 (hex).
    // Messages can be anything, but let's exclude standard address prefixes.
    for (const item of p) {
      if (typeof item === 'string') {
        if (isPsbt) {
          if (item.length > 50 && !item.startsWith('bc1') && !item.startsWith('0x')) return item;
        } else {
          if (!item.startsWith('bc1') && !item.startsWith('1') && !item.startsWith('3') && !item.startsWith('0x')) return item;
        }
      }
    }
    // Fallback: just return the last string item if we couldn't differentiate, 
    // often the payload is the second argument in [address, payload].
    const strings = p.filter(x => typeof x === 'string');
    if (strings.length > 0) return strings[strings.length - 1];
  }
  
  // 4. If p itself is a string
  if (typeof p === 'string') return p;
  
  return '';
}
