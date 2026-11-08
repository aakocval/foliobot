# FolioBot

A tiny embeddable chat widget. No dependencies, no build step. The widget is one file, [`foliobot.js`](foliobot.js); an optional second file, [`profile-engine.js`](profile-engine.js), answers from a `profile.json`.

## Embed it

```html
<script src="widget/foliobot.js"></script>
<script>
  FolioBot.init({
    title: 'Ask me anything',
    greeting: 'Hi! What would you like to know?',
    suggestions: ['What do you do?', 'How can I contact you?'],
    respond: function (text, history) {
      return 'You said: ' + text;          // a string, or a Promise<string>
    }
  });
</script>
```

### Or drive it from a `profile.json`

Instead of writing answers in code, describe the person once in a [`profile.json`](../examples/profile.example.json) and let the engine answer from it:

```html
<script src="widget/foliobot.js"></script>
<script src="widget/profile-engine.js"></script>
<script>
  fetch('profile.json').then(function (r) { return r.json(); }).then(function (profile) {
    FolioBot.init(FolioBot.fromProfile(profile));
  });
</script>
```

The file's shape is defined by [`profile.schema.json`](../schema/profile.schema.json). Add `"$schema": "../schema/profile.schema.json"` (adjust the relative path) to your file and editors like VS Code give autocomplete and flag typos. Only `schemaVersion` and `name` are required; the bot skips topics your profile does not cover, and `faqs` handles anything that does not fit the other fields.

### Customize the opening message

What visitors see when they open the chat (the header, the first message, and the suggested questions under it) comes from the `bot` block of your `profile.json`:

```json
"bot": {
  "title": "Ask about Alex",
  "greeting": "Hi! Ask me about Alex's projects, tech stack, or how to get in touch.",
  "suggestions": [
    "What projects has Alex built?",
    "What's Alex's tech stack?",
    "How can I contact Alex?"
  ],
  "declineMessage": "I can only answer questions about Alex's work. Try one of the suggestions."
}
```

| Field | What it does | If you leave it out |
| --- | --- | --- |
| `title` | Header of the chat panel | `"Ask about <name>"` |
| `greeting` | First bot message, shown when the chat opens | A short hello that names you. Set `""` for no greeting, so the chat opens on the suggestions |
| `suggestions` | Quick-question links under the greeting. They disappear once the visitor sends a message | No suggestions |
| `declineMessage` | Reply to questions the bot can't answer | A generic "I can only answer questions about..." |

Only the first three suggestions are shown. To show more or fewer, pass `maxSuggestions` (see [Config](#config)).

**Make every suggestion answerable.** A suggestion is sent as if the visitor typed it, so it needs an answer in your profile. Suggestions about projects, skills, contact details or "who is..." work out of the box. For anything else, add an entry to `faqs` whose `q` is the suggestion text, word for word:

```json
"faqs": [
  { "q": "Are you open to relocation?", "a": "Yes, open to relocating or working remotely." }
],
"bot": { "suggestions": ["Are you open to relocation?"] }
```

To set these from code instead, for example a different greeting on one page, pass them as overrides. They win over the profile:

```js
FolioBot.init(FolioBot.fromProfile(profile, {
  greeting: 'Thanks for checking out my work! What would you like to know?',
  suggestions: ['What projects has Alex built?', 'How can I contact Alex?']
}));
```

## Use it from a CDN (free)

You do not need to copy files or run a server. [jsDelivr](https://www.jsdelivr.com/) serves files straight from this GitHub repo for free. Replace `<commit-sha>` with a full commit SHA (or a release tag) from this repo:

```html
<script src="https://cdn.jsdelivr.net/gh/aakocval/foliobot@<commit-sha>/widget/foliobot.js"></script>
<script src="https://cdn.jsdelivr.net/gh/aakocval/foliobot@<commit-sha>/widget/profile-engine.js"></script>
<script>
  fetch('profile.json').then(function (r) { return r.json(); }).then(function (profile) {
    FolioBot.init(FolioBot.fromProfile(profile));
  });
</script>
```

- **Always pin an exact commit or tag, never `@main`.** `@main` changes whenever this repo changes, and jsDelivr caches branch URLs for a while, so a pinned URL is the only one you can trust to stay the same.
- **Add an SRI hash** so the browser refuses a file that was altered. Generate it for each file, then add `integrity="sha384-..."` and `crossorigin="anonymous"` to its `<script>` tag:

  ```bash
  curl -s https://cdn.jsdelivr.net/gh/aakocval/foliobot@<commit-sha>/widget/foliobot.js | openssl dgst -sha384 -binary | openssl base64 -A
  ```

  Prefix the output with `sha384-`. The hash changes whenever you change the pin, so regenerate it each time you bump the version.
- `profile.json` is your own file on your own site, served from the same origin as your page. It is not loaded from the CDN.

## Config

| Option | Default | What it does |
| --- | --- | --- |
| `title` | `'Chat'` | Panel header text |
| `greeting` | `'Hi! How can I help?'` | First bot message, shown when the panel first opens. `''` shows no greeting |
| `suggestions` | `[]` | Quick-question links, shown until the first message is sent |
| `maxSuggestions` | `3` | How many of `suggestions` are shown; extras are ignored |
| `maxHeight` | `400` | Max height of the open panel in px. It grows with the conversation up to this, then scrolls |
| `placeholder` | `'Type your question...'` | Input placeholder |
| `theme` | `'auto'` | `'auto'` follows the visitor's light/dark system setting, `'light'` or `'dark'` fixes it, and `'custom'` uses `colors`. If you set `colors` and leave `theme` out, it is `'custom'`. See [Theming](#theming) |
| `colors` | `null` | `{ background, text, accent }` for the `'custom'` theme, as any CSS colour. Unrecognised values are ignored. A missing `background` or `text` uses the dark theme's colour; a missing `accent` falls back to the `accent` option, then to `text` |
| `accent` | `null` | Hover and focus colour (launcher icon and ring, send button) in every theme. Leave it `null` for a neutral highlight: hovering brightens to the theme's text colour. A `--fb-accent` CSS variable set on your page overrides it |
| `zIndex` | `200` | Stacking order of the widget. Raise it if something on your page covers it |
| `position` | `{ right: 24, bottom: 24 }` | Launcher offset from the viewport corner, in px |
| `maxLength` | `200` | Max characters per visitor message |
| `typingDelay` | `450` | Minimum "typing" time in ms, so instant answers feel natural |
| `endpointTimeout` | `20000` | How long to wait for `endpoint`, in ms, before showing `errorMessage` |
| `maxHistory` | `20` | How many of the most recent messages are sent to `endpoint`. Older ones are dropped |
| `maxReplyLength` | `2000` | Max characters of a reply that are shown. Longer replies are cut off, so a broken backend cannot flood the page |
| `errorMessage` | generic apology | Shown when `respond` or `endpoint` fails, throws, times out, or returns no text |
| `styleNonce` | `null` | Nonce added to the widget's `<style>` element. See [Content Security Policy](#content-security-policy) |
| `allowLink` | `null` | `function (href)` called for every URL or email before it becomes a link (`href` is the `http(s)` URL or `mailto:` address). Return `false` to show it as plain text. If it throws, the link is shown as plain text |
| `respond` | `null` | `function (text, history)` returning a string or a Promise of one |
| `endpoint` | `null` | URL the widget POSTs `{ messages: [{ role, content }] }` to; expects `{ reply: "..." }` back |

If both `respond` and `endpoint` are set, `respond` wins.

Methods: `FolioBot.init(config)`, `.open()`, `.close()`, `.setTheme(theme, colors)`, `.destroy()`.

### Theming

Pick one of four themes with the `theme` option:

| Theme | Looks like |
| --- | --- |
| `'auto'` (default) | Light or dark, following the visitor's system setting |
| `'light'` | Always light |
| `'dark'` | Always dark |
| `'custom'` | Your `colors`: `{ background, text, accent }` |

```js
FolioBot.init({
  theme: 'custom',
  colors: { background: '#0f172a', text: '#e2e8f0', accent: '#38bdf8' }
  /* ... */
});
```

You only need two colours. Borders, message bubbles, the input and muted text are tints of `text`, so they follow automatically. Pick a `text` colour with enough contrast against `background`.

**Hover and focus colour.** By default it matches the theme: hovering the launcher or the send button brightens it to the theme's text colour (near-white in dark, near-black in light, your `text` in custom). To use a brand colour instead:

| You set | Hover colour |
| --- | --- |
| nothing (default) | The theme's text colour, in every theme |
| `accent: '#b81828'` | That colour, in every theme |
| `colors.accent` | That colour in the `'custom'` theme; it wins over `accent` there |
| `--fb-accent` in your CSS | That colour, overriding both options |

Check that a brand accent is visible against both the light and the dark background, or set it only for the theme it suits (`colors.accent`, or `--fb-accent` inside a media query).

To change the theme after `init()`, for example from your page's own light/dark toggle, call `setTheme`. With `'custom'` you can also pass new colours:

```js
FolioBot.setTheme('light');
FolioBot.setTheme('custom', { background: '#fdf6e3', text: '#073642' });  // replaces the previous custom colours
```

#### From CSS

If you'd rather style the widget from your stylesheet, set these CSS custom properties on your page. They cross the widget's shadow boundary and win over the `theme`, `colors` and `accent` options:

| Variable | What it changes |
| --- | --- |
| `--fb-bg` | Panel and launcher background |
| `--fb-text` | Text colour. Borders, message bubbles, the input and muted text are tints of it, so they follow automatically |
| `--fb-accent` | Hover and focus highlight (overrides the `accent` option) |
| `--fb-font` | Font family (the default is the system font) |
| `--fb-cursor` | Cursor on clickable elements, for pages that hide or replace the native cursor |

```css
#foliobot { --fb-bg: #0f172a; --fb-text: #e2e8f0; --fb-accent: #38bdf8; }
```

Set `--fb-bg` and `--fb-text` together so the text keeps its contrast. They apply whatever the theme is; for different colours in light and dark, put them inside your own `@media (prefers-color-scheme: ...)` or theme-toggle selector. The tints use CSS `color-mix()`, which needs a browser from 2023 or later.

### Restricting links

Today every bot answer comes from your own profile. Once an LLM writes the answers, a prompt-injected reply could include a link you never approved. `allowLink` lets the widget make only your own links clickable:

```js
FolioBot.init({
  // ...
  allowLink: function (href) {
    return /^mailto:/.test(href) || /^https:\/\/(github\.com|example\.com)\//.test(href);
  }
});
```

This is a second layer. The server should still only let the model output URLs from the profile.

### Content Security Policy

The widget uses no `innerHTML` and no `eval`, so it works on pages that enforce Trusted Types. Its CSS is one `<style>` element inside the shadow root. If your page's CSP has no `'unsafe-inline'` in `style-src`, add a nonce to your policy and pass the same value as `styleNonce`:

```html
<meta http-equiv="Content-Security-Policy" content="style-src 'self' 'nonce-r4nd0m'; script-src 'self' https://cdn.jsdelivr.net">
<script>FolioBot.init({ styleNonce: 'r4nd0m' /* ... */ });</script>
```

A nonce must be a fresh random value on every page load, so this needs a server that sets the header. On a static host, use `style-src 'self' 'unsafe-inline'` instead. Inline styles are a much smaller risk than inline scripts.

## The endpoint contract

This is the whole interface between the widget and any backend:

```
POST <endpoint>
Content-Type: application/json

{ "messages": [ { "role": "user", "content": "..." }, { "role": "assistant", "content": "..." } ] }

200 OK
{ "reply": "..." }
```

`role` follows the OpenAI chat format, so `messages` can be passed to a chat-completions call almost as-is.
Any backend that honours this contract works with the widget, whether that is a Cloudflare Worker, a Node server, or a Python function.

The widget sends at most `maxHistory` messages (starting with a user message) and gives up after `endpointTimeout` ms. A failed turn is not added to the history, so the next request does not contain the error message or the unanswered question. These are client-side conveniences: the server must still enforce its own size and rate limits.

**The server must treat `messages` as untrusted.** Anyone can POST to the endpoint without the widget, so a request can contain made-up `assistant` turns (for example one that "agrees" to ignore the rules), a `system` role, or hundreds of messages. Accept only `user` and `assistant` roles, and cap the message count and the length of each message on the server.

## Design decisions (and why)

- **Shadow DOM.** The host page's CSS cannot break the widget, and the widget's CSS cannot leak out. Only CSS custom properties (`--fb-bg`, `--fb-text`, `--fb-accent`, `--fb-font`, `--fb-cursor`) cross the boundary, so they act as the theming API.
- **No `innerHTML` anywhere.** Messages use `textContent`, so visitor text can never inject markup (XSS). URLs and emails are made clickable by creating `<a>` nodes, and the icons are built with `createElementNS`.
- **Conversation lives in memory only.** Nothing is written to cookies or storage, so there is nothing to consent to or leak.
- **Accessibility.** The panel is a `role="dialog"`, the message list is `role="log"` with `aria-live`, Esc closes it, focus returns to the launcher, and animations respect `prefers-reduced-motion`.
- **Transport is pluggable.** The UI never knows where answers come from. That is what lets v1 be scripted and later versions be AI-backed without touching the widget.

## Not built yet

- Streaming replies (token by token)
- Persisting conversations across page loads
- npm package
- Native iOS and Android wrappers

See [`LEARNING.md`](../docs/LEARNING.md) for the roadmap.
