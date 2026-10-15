// Whole-krone amounts for summaries, where øre would only be noise.
const kr = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 })

export function formatAmount(value: number) {
  return `${kr.format(value)} kr`
}
