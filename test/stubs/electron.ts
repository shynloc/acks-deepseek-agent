// Minimal 'electron' stand-in for unit tests.
// loop.ts imports `net` at module load; the functions under test never call it,
// so a throwing stub both satisfies the import and catches accidental network use.
export const net = {
  fetch: (): never => {
    throw new Error('net.fetch must not be called from unit tests')
  }
}
