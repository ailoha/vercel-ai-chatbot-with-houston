# vercel-ai-chatbot-with-houston

A minimal AI chat web app that wraps the **Vercel AI Chatbot** (multi-modal,
streaming, Thinking-mode capable) inside the friendly **HoustonAI** mascot
interface from Astro.

- **Chat backbone** — [Vercel AI SDK](https://sdk.vercel.ai/) (`ai` +
  `@ai-sdk/openai`) with `useChat`, `experimental_attachments`, and reasoning
  parts.
- **Visual identity** — the animated Houston "TV" mascot, the gradient
  message bubbles, the dark `#17191e` canvas with the white-noise overlay,
  the HoustonAI wordmark, and the same input/footer styling as
  [`chatgpt-with-houston`](../chatgpt-with-houston).
- Houston starts large on first load, then permanently shrinks to its
  compact form once a conversation begins.
- Image and text-file attachments (paste, drag-and-drop, or upload button).
- Thinking-mode toggle that maps to OpenAI's `reasoningEffort` /
  `reasoningSummary` when the Responses API is in use.

## Getting started

```bash
cp .env.example .env.local      # then fill in OPENAI_API_KEY etc.
pnpm install                    # or npm install / yarn
pnpm dev
```

Open http://localhost:3000.

## Stack

- Next.js 14 (App Router)
- React 18, TypeScript
- Vercel AI SDK (`ai`, `@ai-sdk/openai`)
- `streamdown` for streaming markdown rendering
- `framer-motion` for attachment + drag overlays
- `sonner` for toasts
- Plain CSS (Houston squircle clip-paths, gradients, animations)
- Tailwind for utility helpers (configured but most styling lives in
  `app/globals.css` and `app/houston.css`)

## Project layout

```
app/
  layout.tsx          # shell, fonts, login gate, toaster
  page.tsx            # entry — renders <ChatInterface />
  globals.css         # Houston-themed base styles, chat bubbles, footer
  houston.css         # the mascot's squircle clip-paths and animations
  uncut-sans.woff2    # body font (from multi-modal-chatbot)
  geist-mono.woff2    # mono font (from multi-modal-chatbot)
  api/
    chat/route.ts     # streaming chat endpoint (Vercel AI SDK)
    login/route.ts    # password gate
components/
  ChatInterface.tsx   # main client component — wires useChat to Houston
  Houston.tsx         # animated mascot, exposes setConnectionState
  HoustonAI.tsx       # wordmark SVG
  LoginGate.tsx
  Notice.tsx          # Astro/Houston disclaimer card
  icons.tsx
lib/
  auth.ts             # APP_PASSWORD cookie helpers
public/
  whitenoise.png      # background grain (from chatgpt-with-houston)
  favicon.svg, social.jpg, pwa-*.png, manifest.json
```

## Houston connection states

`<Houston />` exposes an imperative `setConnectionState(state)` API where
state is one of `idle | connecting | streaming | retrying | error |
interrupted | done`. The chat interface drives Houston as the request
moves through its lifecycle so that the mascot's mouth/eyes/border
gradient match what the network is doing.

## Credits

- Houston mascot, layout, and CSS — from
  [`chatgpt-with-houston`](https://github.com/iRedScarf/chatgpt-with-houston)
  (Astro Houston is © Astro).
- Chat / streaming / attachments / Thinking toggle — from the Vercel
  [`ai-chatbot`](https://github.com/vercel/ai-chatbot) /
  [`ai-sdk-preview-attachments`](https://github.com/vercel/ai-sdk-preview-attachments)
  reference apps.

This is a personal, NON-COMMERCIAL demo and is not an official project of
either Astro or Vercel.
