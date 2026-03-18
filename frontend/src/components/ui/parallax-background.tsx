export function ParallaxBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background transition-colors duration-700">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.54)_0%,rgba(241,235,226,0.82)_100%)] dark:bg-[linear-gradient(180deg,rgba(18,22,28,0.88)_0%,rgba(14,18,24,0.95)_100%)]" />
      <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(91,103,123,0.04)_0px,rgba(91,103,123,0.04)_1px,transparent_1px,transparent_120px)] dark:bg-[repeating-linear-gradient(90deg,rgba(112,128,154,0.04)_0px,rgba(112,128,154,0.04)_1px,transparent_1px,transparent_120px)]" />
      <div className="absolute inset-x-0 top-0 h-[38vh] bg-[radial-gradient(74%_62%_at_50%_0%,rgba(71,89,118,0.16),transparent_74%)] dark:bg-[radial-gradient(74%_62%_at_50%_0%,rgba(116,133,166,0.18),transparent_74%)]" />
      <div className="absolute right-0 top-0 h-full w-[32vw] bg-[linear-gradient(180deg,rgba(198,164,97,0.07),transparent_26%,transparent_72%,rgba(198,164,97,0.05))] dark:bg-[linear-gradient(180deg,rgba(186,156,98,0.08),transparent_24%,transparent_72%,rgba(186,156,98,0.05))]" />
      <div className="absolute inset-x-0 bottom-0 h-[24vh] bg-[linear-gradient(180deg,transparent,rgba(214,208,197,0.28))] dark:bg-[linear-gradient(180deg,transparent,rgba(42,48,58,0.28))]" />
    </div>
  )
}
