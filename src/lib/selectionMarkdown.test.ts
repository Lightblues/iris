import assert from 'node:assert/strict'
import { test } from 'node:test'
import { domToMarkdown } from './selectionMarkdown.ts'

const g = globalThis as unknown as { Node?: { TEXT_NODE: number; ELEMENT_NODE: number } }
g.Node ??= { TEXT_NODE: 3, ELEMENT_NODE: 1 }

type Fake = FakeText | FakeEl

class FakeText {
  nodeType = 3
  childNodes: Fake[] = []
  constructor(private data: string) {}
  get textContent() { return this.data }
  get innerText() { return this.data }
}

class FakeEl {
  nodeType = 1
  childNodes: Fake[] = []
  className = ''
  private attrs = new Map<string, string>()
  constructor(public tagName: string) {}
  get textContent(): string {
    return this.childNodes.map(n => n.textContent ?? '').join('')
  }
  get innerText() { return this.textContent }
  get children(): FakeEl[] {
    return this.childNodes.filter((n): n is FakeEl => n.nodeType === 1)
  }
  setAttribute(name: string, value: string) { this.attrs.set(name, value) }
  getAttribute(name: string) { return this.attrs.get(name) ?? null }
  append(...nodes: Fake[]) {
    this.childNodes.push(...nodes)
    return this
  }
  querySelector(sel: string): FakeEl | null {
    return this.querySelectorAll(sel)[0] ?? null
  }
  querySelectorAll(sel: string): FakeEl[] {
    const direct = sel.startsWith(':scope > ')
    const tags = (direct ? sel.slice(':scope > '.length) : sel).split(',').map(s => s.trim().toLowerCase())
    if (direct) return this.children.filter(c => tags.includes(c.tagName.toLowerCase()))
    const out: FakeEl[] = []
    const visit = (node: FakeEl) => {
      for (const child of node.children) {
        if (tags.includes(child.tagName.toLowerCase())) out.push(child)
        visit(child)
      }
    }
    visit(this)
    return out
  }
}

function text(value: string) {
  return new FakeText(value)
}

function el(tag: string, ...kids: Fake[]) {
  return new FakeEl(tag.toUpperCase()).append(...kids)
}

function md(nodes: Fake[]) {
  return domToMarkdown({ childNodes: nodes } as unknown as { childNodes: Iterable<Node> })
}

const sentence = [
  el('strong', text('四种交付形态')),
  text('：桌面（Tauri）、Docker/Web（'),
  el('code', text('t8y2/dbx:latest')),
  text('，端口 4224，多架构 amd64/arm64）、CLI（'),
  el('code', text('@dbx-app/cli')),
  text('，含 Homebrew）、MCP Server（'),
  el('code', text('@dbx-app/mcp-server')),
  text('，独立于桌面安装）。'),
]

test('selection inside a paragraph stays one markdown line', () => {
  assert.equal(
    md(sentence),
    '**四种交付形态**：桌面（Tauri）、Docker/Web（`t8y2/dbx:latest`，端口 4224，多架构 amd64/arm64）、CLI（`@dbx-app/cli`，含 Homebrew）、MCP Server（`@dbx-app/mcp-server`，独立于桌面安装）。',
  )
})

test('inline code in a paragraph element keeps backticks', () => {
  const p = el('p',
    text('Docker/Web（'),
    el('code', text('t8y2/dbx:latest')),
    text('，端口 4224）'),
  )
  assert.equal(md([p]), 'Docker/Web（`t8y2/dbx:latest`，端口 4224）')
})

test('a code block stays fenced and separate from the paragraph', () => {
  const code = el('code', text('npm install'))
  code.className = 'language-bash'
  const block = el('div',
    el('button', text('Copy')),
    el('pre', code),
  )
  assert.equal(
    md([el('p', text('before')), block, el('p', text('after'))]),
    'before\n```bash\nnpm install\n```\nafter',
  )
})

test('list items keep inline code', () => {
  const list = el('ul',
    el('li', text('CLI（'), el('code', text('@dbx-app/cli')), text('）')),
    el('li', text('plain')),
  )
  assert.equal(md([list]), '- CLI（`@dbx-app/cli`）\n- plain')
})
