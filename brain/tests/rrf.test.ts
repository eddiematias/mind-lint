// brain/tests/rrf.test.ts
import { describe, it, expect } from 'vitest'
import { reciprocalRankFusion } from '../src/rrf.js'

describe('reciprocalRankFusion', () => {
  it('ranks an item appearing high in both lists first', () => {
    const vector = ['a', 'b', 'c']
    const keyword = ['a', 'c', 'd']
    const fused = reciprocalRankFusion([vector, keyword], 60)
    expect(fused[0]).toBe('a')
  })

  it('includes items present in only one list', () => {
    const fused = reciprocalRankFusion([['a'], ['b']], 60)
    expect(fused.sort()).toEqual(['a', 'b'])
  })
})
