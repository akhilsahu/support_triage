// Only browser-safe destinations; model text must never supply executable URLs.
export function safeUrl(value: unknown, allowContact = false): string | undefined {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\\]/.test(value)) return undefined
  try {
    const url = new URL(value)
    const protocols = allowContact ? ['https:', 'http:', 'mailto:', 'tel:'] : ['https:', 'http:']
    if (!protocols.includes(url.protocol) || url.username || url.password) return undefined
    return url.href
  } catch {
    // Permit same-origin absolute paths, never protocol-relative URLs.
    return value.startsWith('/') && !value.startsWith('//') ? value : undefined
  }
}
