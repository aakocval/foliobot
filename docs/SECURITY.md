# Security and threat model

FolioBot lets a visitor chat with a bot that answers from a person's profile. Today only the widget and a scripted answer engine exist, with no server and no LLM. This document says what is already protected, and what **must** be true before any backend, upload, or "paste a link" feature ships.

Treat the "Required for the backend" sections as a checklist, not as things that already exist.

## Reporting a vulnerability

Please report privately instead of opening a public issue. Contact details are on the author's portfolio: <https://aakocval.github.io/portfolio/>.

## Assets and trust boundaries

| Asset | Who should be able to see it |
| --- | --- |
| The reviewed `profile.json` | Anyone. It is published in the widget. |
| Raw resumes and scraped pages (once ingest exists) | Only the owner and the process that handles them |
| API keys (LLM provider) | The server only. Never the browser, never git. |
| Visitor questions | The server, briefly. Not logged by default. |

Trust boundaries: the **host page** (embeds the widget), the **visitor** (untrusted), the **backend** (trusted, holds keys), the **LLM provider** (third party), and **ingested content** (resumes, web pages: always untrusted data).

## Implemented today (widget and scripted engine)

| Threat | Mitigation |
| --- | --- |
| XSS through chat text | Message text is rendered with `textContent` and created `<a>` nodes, never `innerHTML`. Only static icon SVGs use `innerHTML`. |
| Host page styles or scripts interfering | Shadow DOM isolates styles. (It does not isolate JavaScript: the host page can always reach the widget's open shadow root.) |
| Visitor data persisting | Conversation state lives in memory only. No cookies, no `localStorage`. |
| Oversized input | `maxLength` (default 200 characters) on the input and on what is sent. |
| Tampered widget on a consumer site | Consumers should load the widget pinned to an exact commit with `integrity` (SRI) hashes. The author's portfolio does this. |
| Link hijacking from bot text | Generated links use `rel="noopener noreferrer"` and only `http(s)` URLs or `mailto:` are created. |

Known limits: the scripted engine can reveal anything in `profile.json`, by design. Do not put private data in it.

## Required for the backend (not built yet)

### Abuse and cost

- Per-IP **and** global rate limits, a cap on tokens in and out, a cap on retrieved chunks, and a daily budget kill-switch.
- A hard monthly spending limit set with the LLM provider itself, not only in code.
- **An `Origin` check is not a security boundary.** Scripts can fake the header. It only stops casual cross-site use from browsers, so it never replaces rate limits and budgets.
- If chat sessions exist, use short-lived signed tokens with limited message counts.
- Add a bot check (for example a CAPTCHA) in front of any hosted endpoint that triggers embedding or ingestion.

### Prompt injection

Text from a resume, a web page, or a visitor can contain instructions ("ignore previous instructions..."). It cannot be fully prevented, so limit the damage:

- Wrap retrieved text in clear delimiters and label it as untrusted data in the prompt.
- Keep secrets out of prompts entirely.
- Give the model **read-only tools only**. Nothing reachable from retrieved text may cause a side effect.
- Only allow the bot to output URLs that appear in the profile.
- The structured profile wins over retrieved text when they disagree.
- Test it: the eval suite (`evals/`) must include injection attempts, with pass rates tracked per version.

### Privacy

- Resumes and pages are personal data. Keep uploads in memory or temporary storage with a short expiry, delete after processing, and do not log their content.
- Redact phone numbers and street addresses by default before indexing.
- Tell users clearly that their text is sent to the LLM provider, which is a third-party processor, and which provider.
- Only the reviewed `profile.json` is exposed to visitors. The review step is where owners remove anything private.

### Fetching user-supplied URLs (SSRF)

If the server (not just a local CLI) fetches URLs:

- Allow only `http` and `https`, and only ports 80 and 443.
- Resolve DNS first and block loopback, private, link-local, and cloud-metadata ranges (including IPv6 and IPv4-mapped forms such as `::ffff:127.0.0.1`).
- Connect to the resolved IP address, so DNS rebinding cannot swap it afterwards.
- Follow redirects manually, re-validate every hop, and limit them (about 3).
- Cap response size (around 2 MB), time, and allowed content types. Send no cookies or auth headers.
- Run the fetcher with minimal privileges and restricted network egress where possible.
- Do not scrape LinkedIn. Let people paste their own text instead.

### Uploads

- Limit file size and page count. Detect the type from the content, not the filename.
- Parse PDFs in a separate process with a timeout. PDF parsers have a history of vulnerabilities.
- Never execute uploaded content.

### Isolation between users

- Namespace all data per session or tenant, use unguessable IDs, and never mix embeddings or profiles across users.
- Expire sessions automatically.

### Supply chain

- Pin dependencies, commit lockfiles, and run an audit (for example `pip-audit`) in CI.
- Keep the widget dependency-free. Any added dependency needs a reason.

## Staged rollout

1. **Local CLI first:** ingest runs on the owner's own machine, so there is no multi-user attack surface and resumes never leave it except for the LLM call.
2. **Hosted demo later:** only after the sections above are implemented and tested, with ephemeral sessions and strict limits.
