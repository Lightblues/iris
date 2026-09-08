/**
 * Pure-function checks for Zhihu title cleaning and link unwrap.
 * Run: pnpm tsx scripts/test-zhihu.ts
 */
import { cleanZhihuTitle, isZhihuHost, unwrapZhihuRedirect } from '../src/lib/zhihu'

let failed = 0

function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected
  if (!ok) failed++
  console.log(`${ok ? 'ok' : 'FAIL'}  ${name}`)
  if (!ok) console.log(`     got:      ${JSON.stringify(actual)}\n     expected: ${JSON.stringify(expected)}`)
}

eq('full-width prefix', cleanZhihuTitle('（99+ 封私信/80 条消息）文章标题 - 知乎'), '文章标题 - 知乎')
eq('half-width prefix', cleanZhihuTitle('(10 条消息) 如何看待 xxx - 知乎'), '如何看待 xxx - 知乎')
eq('dm only', cleanZhihuTitle('（3 封私信）专栏标题 - 知乎'), '专栏标题 - 知乎')
eq('already clean', cleanZhihuTitle('文章标题 - 知乎'), '文章标题 - 知乎')
eq('parens without notice', cleanZhihuTitle('（关于学习）笔记 - 知乎'), '（关于学习）笔记 - 知乎')

eq('unwrap encoded', unwrapZhihuRedirect('https://link.zhihu.com/?target=https%3A//arxiv.org/pdf/2506.08007'), 'https://arxiv.org/pdf/2506.08007')
eq('unwrap extra params', unwrapZhihuRedirect('https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2Fpath&source=1'), 'https://example.com/path')
eq('unwrap non-zhihu', unwrapZhihuRedirect('https://arxiv.org/pdf/2506.08007'), null)
eq('reject javascript', unwrapZhihuRedirect('https://link.zhihu.com/?target=javascript%3Aalert(1)'), null)
eq('reject missing target', unwrapZhihuRedirect('https://link.zhihu.com/'), null)

eq('host www', isZhihuHost('www.zhihu.com'), true)
eq('host zhuanlan', isZhihuHost('zhuanlan.zhihu.com'), true)
eq('host link', isZhihuHost('link.zhihu.com'), true)
eq('host other', isZhihuHost('arxiv.org'), false)

if (failed) {
  console.error(`\n${failed} failed`)
  process.exit(1)
}
console.log('\nall passed')
