# FolioBot

A tiny embeddable chat widget. No dependencies, no build step, one file: [`foliobot.js`](foliobot.js).

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

## Config

| Option | Default | What it does |
| --- | --- | --- |
| `title` | `'Chat'` | Panel header text |
| `greeting` | `'Hi! How can I help?'` | First bot message, shown when the panel first opens |
| `suggestions` | `[]` | Quick-question links, shown until the first message is sent |
| `maxSuggestions` | `3` | How many of `suggestions` are shown; extras are ignored |
| `maxHeight` | `400` | Max height of the open panel in px. It grows with the conversation up to this, then scrolls |
| `placeholder` | `'Type your question...'` | Input placeholder |
| `accent` | `'#b81828'` | Launcher, send button, and user-bubble colour |
| `position` | `{ right: 24, bottom: 24 }` | Launcher offset from the viewport corner, in px |
| `maxLength` | `200` | Max characters per visitor message |
| `typingDelay` | `450` | Minimum "typing" time in ms, so instant answers feel natural |
| `errorMessage` | generic apology | Shown when `respond` or `endpoint` fails |
| `respond` | `null` | `function (text, history)` returning a string or a Promise of one |
| `endpoint` | `null` | URL the widget POSTs `{ messages: [{ role, content }] }` to; expects `{ reply: "..." }` back |

If both `respond` and `endpoint` are set, `respond` wins.

Methods: `FolioBot.init(config)`, `.open()`, `.close()`, `.destroy()`.

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

## Design decisions (and why)

- **Shadow DOM.** The host page's CSS cannot break the widget, and the widget's CSS cannot leak out. Only CSS custom properties (`--fb-accent`, `--fb-cursor`) cross the boundary, so they act as the theming API.
- **Messages are built with `textContent`, never `innerHTML`.** Visitor text can never inject markup (XSS). URLs and emails are made clickable by creating `<a>` nodes.
- **Conversation lives in memory only.** Nothing is written to cookies or storage, so there is nothing to consent to or leak.
- **Accessibility.** The panel is a `role="dialog"`, the message list is `role="log"` with `aria-live`, Esc closes it, focus returns to the launcher, and animations respect `prefers-reduced-motion`.
- **Transport is pluggable.** The UI never knows where answers come from. That is what lets v1 be scripted and later versions be AI-backed without touching the widget.

## Not built yet

- Streaming replies (token by token)
- Persisting conversations across page loads
- npm package / CDN-hosted build
- Native iOS and Android wrappers

See [`LEARNING.md`](../docs/LEARNING.md) for the roadmap.
