// Fuse multiple ranked lists of ids. Returns ids best-first.
export function reciprocalRankFusion(lists: string[][], k = 60): string[] {
  const scores = new Map<string, number>()
  for (const list of lists) {
    list.forEach((id, rank) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1))
    })
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}
