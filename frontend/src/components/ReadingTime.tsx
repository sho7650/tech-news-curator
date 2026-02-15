export function estimateReadingTime(text: string): number {
  const jaChars = (text.match(/[\u3000-\u9fff\uff00-\uffef]/g) || []).length
  const enWords = text.replace(/[\u3000-\u9fff\uff00-\uffef]/g, ' ')
    .split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(jaChars / 500 + enWords / 200))
}

export default function ReadingTime({ text }: { text: string }) {
  const minutes = estimateReadingTime(text)
  return (
    <span className="text-text-muted">
      {minutes}分で読めます
    </span>
  )
}
