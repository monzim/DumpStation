export function Wordmark({ size = 15 }: { size?: number }) {
  const mark = Math.round(size * 1.6)
  return (
    <span className="ds-wordmark" style={{ fontSize: size }}>
      <img className="ds-wordmark-logo" src="/logo.svg" alt="" width={mark} height={mark} aria-hidden="true" />
      DumpStation
    </span>
  )
}
