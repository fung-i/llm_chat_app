const COLLAPSE_LINE_THRESHOLD = 12
const COLLAPSE_CHAR_THRESHOLD = 600
const PREVIEW_LINES = 3
const PREVIEW_CHARS = 220

export function shouldCollapse(content: string): boolean {
  if (!content) return false
  if (content.length > COLLAPSE_CHAR_THRESHOLD) return true
  let lineCount = 1
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      lineCount++
      if (lineCount > COLLAPSE_LINE_THRESHOLD) return true
    }
  }
  return false
}

export function previewContent(content: string): string {
  const lines = content.split('\n').slice(0, PREVIEW_LINES).join('\n')
  return lines.length > PREVIEW_CHARS ? `${lines.slice(0, PREVIEW_CHARS)}…` : lines
}
