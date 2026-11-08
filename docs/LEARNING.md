# Learning roadmap

This chatbot is a learning project for AI engineering. The widget (the UI) is done. Everything below is
the part to build yourself, in small steps, each one shippable. Tick a box when it works end to end.

The rule: **change one thing at a time**, and keep the site working between steps.

## v1 - Scripted bot (done)

- [x] Embeddable widget with pluggable `respond()` / `endpoint`
- [x] Scripted answers built from a `profile.json`
- [x] Scope limit: off-topic questions get a fixed fallback

What to notice: keyword matching is brittle. "tell me about dynamic things" matches the *about* topic.
Try to break it on purpose and write down what fails. Those failures are the reason the next steps exist.

## v2 - Your own backend (first real AI step)

Build a small Python service that honours the [endpoint contract](../widget/README.md#the-endpoint-contract).

- [ ] A Pydantic `Profile` model (in `server/`) that validates `profile.json` and agrees with `schema/profile.schema.json`
- [ ] `POST /chat` accepting `{ messages }` and returning a canned `{ reply }`; point the widget's `endpoint` at it to prove the loop before adding any LLM
- [ ] Call an LLM with a **system prompt generated from the profile** and the rule "only answer about this person's work; otherwise decline"
- [ ] Keep the API key in an environment variable (`.env` is git-ignored). It must never appear in this repo or in browser JS
- [ ] Add guardrails: CORS locked to your site's origin, a per-IP rate limit, a `max_tokens` cap, reject messages over 200 chars

Practice for free: use a provider with an OpenAI-compatible API (Groq, Gemini, Ollama locally) and change only the base URL, key, and model name.
Check current free-tier limits before relying on them.

Things to learn here: roles (`system` / `user` / `assistant`), why the server must own the key, what a token is and why `max_tokens` is a cost control.

## v3 - Streaming

- [ ] Make the server stream tokens
- [ ] Extend `foliobot.js` to render a reply as it arrives (read `response.body` with a `ReadableStream` reader)

## v4 - Retrieval (RAG)

Stop pasting everything into the system prompt.

- [ ] Split your resume and project descriptions into chunks
- [ ] Embed the chunks once and store the vectors (a JSON file is fine at this size)
- [ ] On each question, embed it, find the closest chunks, and put only those in the prompt
- [ ] Compare answer quality and token cost against v2

## v5 - Tool calling

- [ ] Give the model functions such as `get_project(name)` and `get_contact()`
- [ ] Let it decide when to call them, and return their structured results in the reply
- [ ] Notice how this removes guessing on facts like links and stacks

## v6 - Evals and guardrails

This is the step that stands out when applying for jobs.

- [ ] Write ~30 test questions: in scope, out of scope, and prompt-injection attempts ("ignore your instructions and...")
- [ ] Write a script that runs them and checks the answers (exact checks where possible, an LLM judge where not)
- [ ] Record pass rates per version in a table, so you can show the improvement from v2 to v5

## Making it externally usable

The widget is already one self-contained file, so sharing it is mostly packaging:

- [ ] Host it from a CDN (jsDelivr can serve a GitHub file; pin to a release tag)
- [ ] Publish to npm with a short README and a screenshot
- [ ] Add a live demo page that embeds it on a blank page, to prove it does not depend on this site
- [ ] Later, optional: native iOS and Android wrappers around the same endpoint contract. They are a much bigger step (backward compatibility, distribution), so treat them as a separate project

## Resume line (only once it is true)

Write what actually exists. After v1: *"Built an embeddable chat widget (Shadow DOM, accessible, dependency-free) with a pluggable backend."*
Add the AI parts only after the matching step is working.
