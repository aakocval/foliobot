# FolioBot

An embeddable chat widget that answers questions about you from a single `profile.json`.
Add two `<script>` tags, describe yourself once, and visitors to your portfolio can ask about your projects, tech stack, and how to reach you.

> **Status: early.** The widget and a scripted (no-AI) answer engine work today. An AI backend is planned; see [Roadmap](#roadmap).

![FolioBot widget open on the demo page](docs/screenshot.png)

## Features

- **One dependency-free file.** No build step, no framework. Shadow DOM keeps your site's CSS out of the widget and the widget's CSS out of your site.
- **Answers from your profile.** The profile engine turns `profile.json` into scripted answers in the browser: no server, no API key, no cost.
- **Themes.** Light, dark, auto (follows the visitor's system setting) or your own colours.
- **Accessible.** Dialog role, live region, Esc to close, focus returns to the launcher, respects reduced motion.
- **Safe rendering.** Messages are rendered with `textContent`, never `innerHTML`, so it works on pages that enforce Trusted Types. A strict `style-src` is supported with a nonce ([CSP](widget/README.md#content-security-policy)).
- **Pluggable answers.** Use the profile engine, your own `respond()` function, or an HTTP `endpoint`.

## Quick start

1. Copy [`examples/profile.example.json`](examples/profile.example.json) to `profile.json` and fill it in. The [schema](schema/profile.schema.json) gives you autocomplete and validation in editors that support JSON Schema.
2. Add the widget to your page:

```html
<script src="widget/foliobot.js"></script>
<script src="widget/profile-engine.js"></script>
<script>
  fetch('profile.json').then(function (r) { return r.json(); }).then(function (profile) {
    FolioBot.init(FolioBot.fromProfile(profile));
  });
</script>
```

The page must be served over HTTP, because browsers block `fetch` on `file://`. To load the scripts from jsDelivr instead of copying them, see [Use it from a CDN](widget/README.md#use-it-from-a-cdn-free).

## Customize

**Opening message.** The header, greeting and suggested questions come from the `bot` block of `profile.json`. Set `"greeting": ""` to open on the suggestions alone. Every suggestion needs an answer in your profile ([details](widget/README.md#customize-the-opening-message)).

```json
"bot": {
  "title": "Ask about Alex",
  "greeting": "Hi! Ask me about Alex's projects, tech stack, or how to get in touch.",
  "suggestions": ["What projects has Alex built?", "How can I contact Alex?"]
}
```

**Theme.** The default follows the visitor's light/dark setting. Pass overrides as the second argument to `fromProfile`:

```js
FolioBot.init(FolioBot.fromProfile(profile, {
  theme: 'custom',                  // 'auto' (default), 'light', 'dark' or 'custom'
  colors: { background: '#0f172a', text: '#e2e8f0', accent: '#38bdf8' }
}));

FolioBot.setTheme('light');         // switch later, e.g. from your site's theme toggle
```

Borders, bubbles and muted text are derived from `text`, so two colours are enough; `accent` is optional. You can also theme it with CSS variables ([Theming](widget/README.md#theming)).

**Your own answers.** Skip the profile engine and pass `respond: function (text, history) { ... }`, or point `endpoint` at a server that accepts `POST { messages }` and returns `{ reply }` ([endpoint contract](widget/README.md#the-endpoint-contract)).

All options and methods are in [`widget/README.md`](widget/README.md#config).

## Development

```bash
python3 -m http.server
```

Open <http://localhost:8000/examples/demo.html> (add `#open` to start with the chat open). Edit `examples/profile.example.json` and reload to change the answers; the menu on the page switches themes.

```bash
node --test tests/*.test.js
```

Tests use Node's built-in runner (Node 18+), with no dependencies. They cover the answer engine and the widget's config logic against a small fake DOM, so check visual changes in the demo page.

| Path | What it is |
| --- | --- |
| [`widget/`](widget) | The widget (`foliobot.js`) and the profile engine (`profile-engine.js`) |
| [`schema/`](schema) | JSON Schema for `profile.json` |
| [`examples/`](examples) | Example profile and demo page |
| [`tests/`](tests) | Engine and widget tests |
| [`docs/`](docs) | Security notes and threat model |

## Roadmap

Nothing below is built yet.

- **Backend** (`server/`): a Python (FastAPI + Pydantic) service that answers from the profile with an LLM, behind the existing endpoint contract
- **Retrieval:** embed the profile and send only the relevant parts with each question
- **Tool calling:** let the model look up exact facts such as links and stacks instead of guessing
- **Evals** (`evals/`): in-scope, out-of-scope and prompt-injection questions, with pass rates tracked per version
- **Ingest:** a CLI that drafts a `profile.json` from a resume, Markdown or a URL, for you to review
- **Packaging:** an npm release of the widget

## Security

- Everything in `profile.json` ends up in a public widget or prompt. Don't put a phone number, salary or home address in it.
- API keys belong in a server environment variable, never in the widget or this repo.
- A public chat endpoint needs rate limiting, input and output caps, and a spending cap. An `Origin` check helps against casual misuse but is not a security boundary.

The full threat model, including what is implemented and what is still required, is in [`docs/SECURITY.md`](docs/SECURITY.md).

## License

[MIT](LICENSE)
