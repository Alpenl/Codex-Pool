export function ParallaxBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background transition-colors duration-700">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.55)_0%,rgba(243,239,232,0.7)_100%)] dark:bg-[linear-gradient(180deg,rgba(20,24,30,0.82)_0%,rgba(16,20,27,0.92)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-[34vh] bg-[radial-gradient(72%_60%_at_50%_0%,rgba(108,122,146,0.12),transparent_72%)] dark:bg-[radial-gradient(72%_60%_at_50%_0%,rgba(132,145,170,0.16),transparent_72%)]" />
      <div className="absolute inset-y-0 left-[8%] w-[1px] bg-[linear-gradient(180deg,transparent,rgba(74,86,103,0.07),transparent)] dark:bg-[linear-gradient(180deg,transparent,rgba(161,174,194,0.08),transparent)]" />
      <div className="absolute inset-y-0 right-[12%] w-[1px] bg-[linear-gradient(180deg,transparent,rgba(74,86,103,0.05),transparent)] dark:bg-[linear-gradient(180deg,transparent,rgba(161,174,194,0.06),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(63,76,97,0.025)_0%,transparent_18%,transparent_82%,rgba(63,76,97,0.018)_100%)] dark:bg-[linear-gradient(90deg,rgba(172,180,196,0.03)_0%,transparent_18%,transparent_82%,rgba(172,180,196,0.022)_100%)]" />
    </div>
  )
}
