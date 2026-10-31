import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CommandLine } from '@/components/command.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Wordmark } from '@/components/wordmark.tsx'

const INSTALL = 'curl -fsSL https://raw.githubusercontent.com/Lightblues/iris/main/scripts/install.sh | bash'
const REPO = 'https://github.com/Lightblues/iris'

const JOBS = [
  {
    title: 'On the page in front of you',
    text: 'Ask about an article or a paper, pull a table out, fill a form, sort your tabs. The agent reads the page and acts on it in the tab where you opened it.',
  },
  {
    title: 'Skills you type',
    text: 'Type / for automation, papers, page scripts, summaries, and tabs. Skills the agent writes for you sync like everything else.',
  },
  {
    title: 'A relay for your own agents',
    text: 'With your own Iris server, agents on other machines read pages and AI chats through your logged-in browsers, only as far as each browser allows.',
  },
]

const STEPS: { title: string; body: ReactNode }[] = [
  { title: 'Download the latest release', body: <CommandLine command={INSTALL} /> },
  {
    title: 'Load it once in Chrome',
    body: (
      <span>
        Open <Kbd>chrome://extensions</Kbd>, turn on <b className="font-medium text-foreground">Developer mode</b>, click{' '}
        <b className="font-medium text-foreground">Load unpacked</b>, and choose <Kbd>~/.iris/extension</Kbd>.
      </span>
    ),
  },
  { title: 'Add a model key', body: <span>Open Iris from the toolbar. In Settings, paste an OpenRouter or any OpenAI-compatible key.</span> },
  { title: 'Updating', body: <span>Run the same command again. It replaces the folder in place and Iris reloads itself.</span> },
]

function Kbd({ children }: { children: ReactNode }) {
  return <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">{children}</code>
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-6 border-t py-14 sm:py-20">
      <div className="mb-8 max-w-2xl sm:mb-10">
        <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h2>
        {lead ? <p className="mt-3 text-[16px] leading-7 text-muted-foreground">{lead}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Shot({ src, alt, caption, width = 672, height = 1024 }: { src: string; alt: string; caption: string; width?: number; height?: number }) {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.18)]">
        <img src={src} alt={alt} width={width} height={height} className="block h-auto w-full" />
      </div>
      <figcaption className="mt-3 text-sm text-muted-foreground">{caption}</figcaption>
    </figure>
  )
}

export function LandingPage() {
  return (
    <div className="min-h-dvh pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <nav className="flex items-center gap-1 text-sm">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <a href="#install">Install</a>
          </Button>
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <a href={REPO}>GitHub</a>
          </Button>
          <Button asChild variant="outline">
            <Link to="/login">Log in</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="grid items-center gap-12 pt-8 pb-16 sm:pt-14 sm:pb-24 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
          <div className="min-w-0">
            <h1 className="text-[clamp(2.35rem,5.3vw,4.1rem)] leading-[1.03] font-semibold tracking-[-0.035em] text-balance">
              An agent in your browser’s side panel.
            </h1>
            <p className="mt-8 max-w-xl text-[17px] leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              Iris is a Chrome extension. It reads and acts on the page in front of you, keeps your chats and skills the same on every
              browser, and lets your own agents use your logged-in browsers through a relay you control. Bring any OpenAI-compatible key.
            </p>
            <div className="mt-8 flex max-w-xl flex-col gap-3">
              <CommandLine command={INSTALL} />
              <p className="text-sm text-muted-foreground">
                macOS or Linux, with Chrome. Then{' '}
                <a href="#install" className="font-medium text-foreground underline decoration-border underline-offset-3 hover:decoration-foreground">load it once</a>.
              </p>
            </div>
          </div>
          <div className="mx-auto w-full max-w-sm lg:mr-0">
            <Shot src="/shots/chat.png" alt="The Iris side panel answering a question about the current page" caption="Ask about the page you are on." />
          </div>
        </section>

        <Section id="what" title="Two jobs, nothing in the background" lead="The agent works while you are there, on the tab you opened it in. The one thing that runs without you is the relay, and each browser sets how far it goes.">
          <div className="grid gap-x-10 gap-y-8 md:grid-cols-3">
            {JOBS.map((job) => (
              <div key={job.title} className="min-w-0 border-l-2 border-foreground/10 pl-5">
                <h3 className="font-semibold">{job.title}</h3>
                <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{job.text}</p>
              </div>
            ))}
          </div>
        </Section>

        <section aria-labelledby="install-title" id="install" className="scroll-mt-6 border-t py-14 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:gap-14">
            <div className="max-w-md">
              <h2 id="install-title" className="text-2xl font-semibold tracking-tight sm:text-[28px]">Install</h2>
              <p className="mt-3 text-[16px] leading-7 text-muted-foreground">
                Iris is not in the Chrome Web Store. The script downloads the latest GitHub release to ~/.iris/extension; Chrome loads it from there.
              </p>
            </div>
            <ol className="flex min-w-0 flex-col gap-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular text-muted-foreground">{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="text-sm font-medium">{step.title}</span>
                    <div className="text-[15px] leading-6 text-muted-foreground">{step.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Section id="shots" title="What it looks like">
          <div className="grid items-start gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)]">
            <Shot src="/shots/skills.png" alt="The slash menu listing Iris skills" caption="Type / for skills: automation, papers, page scripts, tabs." />
            <Shot
              src="/shots/devices.png"
              alt="The devices page: each browser with its level, version, last frame, reconnects, and an hour of connects and disconnects"
              caption="Log in to see your browsers: which are online, which keep reconnecting, and a one-click relay test."
              width={1280}
              height={900}
            />
          </div>
        </Section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="max-w-xl">Iris is a personal tool. This site shows your browsers once you log in with a read key.</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/login" className="font-medium text-foreground hover:underline">Log in</Link>
            <a href={REPO} className="hover:text-foreground hover:underline">Source</a>
            <a href={`${REPO}/releases`} className="hover:text-foreground hover:underline">Releases</a>
            <span className="tabular">v{__IRIS_VERSION__}</span>
          </nav>
        </div>
      </footer>
    </div>
  )
}
