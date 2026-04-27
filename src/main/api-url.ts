export const DEFAULT_API_BASE = 'https://llm.inkess.cc'

let currentApiBase: string = DEFAULT_API_BASE

function validateBase(base: string): string {
  let parsed: URL
  try {
    parsed = new URL(base)
  } catch {
    throw new Error(`Invalid API base URL: ${base}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`API base must use http(s): ${base}`)
  }
  // Only keep origin (protocol + host + port), strip path/query/fragment
  return parsed.origin
}

export function getApiBase(): string {
  return currentApiBase
}

export function setApiBase(base: string | null | undefined): void {
  if (base === null || base === undefined || base === '') {
    currentApiBase = DEFAULT_API_BASE
    return
  }
  currentApiBase = validateBase(base)
}

export function buildApiUrl(path: string, base: string = currentApiBase): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalizedPath}`
}
