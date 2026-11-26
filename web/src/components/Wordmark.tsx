export function Wordmark({ size = 15 }: { size?: number }) {
  return (
    <span className="ds-wordmark" style={{ fontSize: size }}>
      <span className="ds-wordmark-dot" aria-hidden="true" />
      DumpStation
    </span>
  )
}
