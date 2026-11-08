/*!
 * FolioBot - a tiny embeddable chat widget (no dependencies, no build step).
 *
 * Embed it on any page:
 *
 *   <script src="foliobot.js"></script>
 *   <script>
 *     FolioBot.init({
 *       title: 'Ask me anything',
 *       greeting: 'Hi! What would you like to know?',
 *       suggestions: ['What do you do?'],
 *       respond: function (text, history) { return 'You said: ' + text; }
 *     });
 *   </script>
 *
 * The widget only handles the UI. Where answers come from is pluggable, and
 * that is the part you swap out as you learn:
 *
 *   1. respond(text, history)  - a function returning a string or a Promise<string>.
 *                                v1 uses this with scripted answers (see profile-engine.js).
 *   2. endpoint                - a URL. The widget POSTs { messages: [{role, content}] }
 *                                and expects { reply: "..." } back. This is where your
 *                                own backend (e.g. a Cloudflare Worker calling an LLM) plugs in.
 *
 * If both are given, `respond` wins.
 *
 * Public API:  FolioBot.init(config) / open() / close() / setTheme(theme, colors) / destroy()
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        title: 'Chat',
        greeting: 'Hi! How can I help?', // first bot message; '' shows none
        suggestions: [],
        maxSuggestions: 3,            // quick-question links shown; extras in `suggestions` are ignored
        maxHeight: 400,               // px cap for the open panel; it grows with the chat up to this, then scrolls
        placeholder: 'Type your question...',
        launcherLabel: 'Open chat',
        theme: 'auto',                // 'auto' follows the visitor's light/dark system setting; 'light' or 'dark' fixes it; 'custom' uses `colors`. Change it later with FolioBot.setTheme(). Defaults to 'custom' when only `colors` is given.
        colors: null,                 // { background, text, accent } for theme 'custom'. --fb-bg / --fb-text on the page override it.
        accent: null,                 // hover and focus colour in every theme. null brightens to the theme's text colour instead. A --fb-accent CSS variable on the page overrides it.
        zIndex: 200,                  // stacking order of the widget; raise it if your page has higher layers
        position: { right: 24, bottom: 24 }, // px offsets of the launcher from the viewport corner
        maxLength: 200,               // max characters a visitor can send per message
        typingDelay: 450,             // ms of fake "typing" for instant answers, so replies feel natural
        endpointTimeout: 20000,       // ms to wait for `endpoint` before giving up and showing errorMessage
        maxHistory: 20,               // most recent messages sent to `endpoint` (older ones are dropped)
        maxReplyLength: 2000,         // characters of a reply that are shown; the rest is cut off
        errorMessage: 'Sorry, something went wrong. Please try again in a moment.',
        styleNonce: null,             // CSP nonce for the widget's <style> element, for pages without style-src 'unsafe-inline'
        allowLink: null,              // function (href) -> false to show that link as plain text instead
        respond: null,
        endpoint: null
    };

    var THEMES = ['auto', 'light', 'dark', 'custom'];

    // A see-through tint of the text colour. Borders, bubbles and muted text are all drawn
    // with it, so they follow whatever the text and background resolve to (light, dark or a
    // page's own --fb-text / --fb-bg) without a separate colour for each.
    function tint(percent) { return 'color-mix(in srgb, var(--_fg) ' + percent + '%, transparent)'; }
    // Hover and focus colour. --_t-accent is set per theme below; with no accent configured it
    // is the theme's own text colour, so the highlight stays neutral in light, dark and custom.
    var ACCENT = 'var(--fb-accent, var(--_t-accent))';
    var LIGHT_TOKENS = '--_t-bg: #fff; --_t-fg: #1d1d1f; --_t-shadow: rgba(0,0,0,.12); color-scheme: light;';

    // All widget CSS lives inside the shadow root, so the host page's styles
    // cannot leak in and ours cannot leak out. Custom properties (--fb-*) are
    // the only things that cross the boundary, which makes them the theming API.
    var STYLES = [
        ':host { all: initial; }',
        '*, *::before, *::after { box-sizing: border-box; }',

        // Built-in palettes (--_t-*). Dark is the base; data-theme="light", or "auto" on a
        // light-preferring system, swaps in the light one. color-scheme makes the caret and
        // scrollbar match.
        '.fb { --_t-bg: #2b2b2d; --_t-fg: #f2f2f4; --_t-shadow: rgba(0,0,0,.25); color-scheme: dark; }',
        '.fb[data-theme="light"] { ' + LIGHT_TOKENS + ' }',
        '@media (prefers-color-scheme: light) { .fb[data-theme="auto"] { ' + LIGHT_TOKENS + ' } }',
        // "custom" uses the `colors` option (--_cfg-*), with the dark palette for anything it leaves out.
        '.fb[data-theme="custom"] { --_t-bg: var(--_cfg-bg, #2b2b2d); --_t-fg: var(--_cfg-fg, #f2f2f4); --_t-accent: var(--_cfg-accent, var(--fb-accent-cfg, var(--_fg))); }',
        // The page's --fb-bg / --fb-text / --fb-font, when set, win over the palette and `colors`.
        // The accent falls back from the `accent` option (--fb-accent-cfg) to the text colour.
        '.fb { --_t-accent: var(--fb-accent-cfg, var(--_fg)); }',
        '.fb { --_bg: var(--fb-bg, var(--_t-bg)); --_fg: var(--fb-text, var(--_t-fg)); font-family: var(--fb-font, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif); font-size: 14px; line-height: 1.45; color: var(--_fg); user-select: text; -webkit-user-select: text; }',

        // Launcher: a 44px tappable box (the recommended touch-target size) with a quieter 38px
        // circle drawn inside it by ::before. The accent colour only appears on hover and focus,
        // on the icon and the ring together.
        '.fb-launcher { position: fixed; width: 44px; height: 44px; padding: 0; border: 0; background: transparent; color: ' + tint(85) + '; display: flex; align-items: center; justify-content: center; cursor: var(--fb-cursor, pointer); transition: color .2s ease; }',
        '.fb-launcher::before { content: ""; position: absolute; width: 38px; height: 38px; border-radius: 50%; background: var(--_bg); border: 1px solid ' + tint(28) + '; transition: border-color .2s ease; }',
        '.fb-launcher svg { position: relative; width: 18px; height: 18px; }',
        '.fb-launcher:hover { color: ' + ACCENT + '; }',
        '.fb-launcher:hover::before { border-color: ' + ACCENT + '; }',
        // Two-tone focus ring (white inside, dark outside) so it is visible on light and dark host pages.
        '.fb-launcher:focus-visible { outline: none; color: ' + ACCENT + '; }',
        '.fb-launcher:focus-visible::before { border-color: ' + ACCENT + '; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #1d1d1f; }',
        '.fb-btn:focus-visible, .fb-chip:focus-visible, .fb-input:focus-visible, .fb-send:focus-visible { outline: 2px solid var(--_fg); outline-offset: 2px; }',

        '.fb-panel { position: fixed; width: 320px; max-width: calc(100vw - 32px); display: flex; flex-direction: column; background: var(--_bg); border: 1px solid ' + tint(12) + '; border-radius: 12px; box-shadow: 0 8px 24px var(--_t-shadow); overflow: hidden; opacity: 0; transform: translateY(8px); pointer-events: none; visibility: hidden; transition: opacity .15s ease, transform .15s ease, visibility 0s linear .15s; }',
        '.fb-panel.is-open { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition-delay: 0s; }',

        '.fb-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 8px 8px 14px; border-bottom: 1px solid ' + tint(8) + '; }',
        '.fb-title { margin: 0; font-size: 13px; font-weight: 600; color: ' + tint(90) + '; }',
        '.fb-btn { border: 0; background: transparent; color: ' + tint(70) + '; width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: var(--fb-cursor, pointer); }',
        '.fb-btn:hover { color: var(--_fg); background: ' + tint(10) + '; }',
        '.fb-btn svg { width: 16px; height: 16px; }',

        // scrollbar-color keeps the scrollbar matching custom colours, which color-scheme can't know.
        '.fb-log { flex: 0 1 auto; min-height: 0; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 8px; overscroll-behavior: contain; scrollbar-color: ' + tint(30) + ' transparent; }',
        '.fb-msg { max-width: 88%; padding: 8px 12px; border-radius: 10px; white-space: pre-wrap; overflow-wrap: anywhere; }',
        '.fb-msg--bot { align-self: flex-start; background: ' + tint(8) + '; }',
        '.fb-msg--user { align-self: flex-end; background: ' + tint(16) + '; }',
        '.fb-msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: var(--fb-cursor, pointer); }',

        '.fb-typing { display: inline-flex; gap: 4px; padding: 4px 0; }',
        '.fb-typing i { width: 6px; height: 6px; border-radius: 50%; background: ' + tint(60) + '; animation: fb-blink 1s infinite ease-in-out; }',
        '.fb-typing i:nth-child(2) { animation-delay: .15s; }',
        '.fb-typing i:nth-child(3) { animation-delay: .3s; }',
        '@keyframes fb-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }',

        // Suggestions are quiet text links rather than pills.
        '.fb-chips { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 0 14px 10px; }',
        '.fb-chip { border: 0; background: transparent; padding: 3px 0; color: ' + tint(72) + '; font: inherit; font-size: 13px; text-align: left; text-decoration: underline; text-decoration-color: ' + tint(30) + '; text-underline-offset: 3px; cursor: var(--fb-cursor, pointer); transition: color .2s ease; }',
        '.fb-chip:hover { color: var(--_fg); text-decoration-color: var(--_fg); }',

        '.fb-form { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid ' + tint(8) + '; }',
        '.fb-input { flex: 1; min-width: 0; border: 1px solid ' + tint(18) + '; background: ' + tint(5) + '; color: var(--_fg); font: inherit; padding: 8px 10px; border-radius: 8px; cursor: var(--fb-cursor, text); }',
        '.fb-input::placeholder { color: ' + tint(50) + '; }',
        // iOS Safari zooms the page when a focused input has text smaller than 16px.
        '@media (pointer: coarse) { .fb-input { font-size: 16px; } }',
        '.fb-send { border: 1px solid ' + tint(25) + '; background: transparent; color: ' + tint(85) + '; font: inherit; font-size: 13px; padding: 0 12px; border-radius: 8px; cursor: var(--fb-cursor, pointer); transition: border-color .2s ease, color .2s ease; }',
        '.fb-send:hover:not([aria-disabled="true"]) { color: var(--_fg); border-color: ' + ACCENT + '; }',
        '.fb-send[aria-disabled="true"] { opacity: .5; }',
        // Text for screen readers only (the typing indicator).
        '.fb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }',

        '@media (prefers-reduced-motion: reduce) { .fb-launcher, .fb-launcher::before, .fb-panel, .fb-chip, .fb-send { transition: none; } .fb-typing i { animation: none; opacity: .6; } }'
    ].join('\n');

    // Icon path data. The SVGs are built with DOM calls, not innerHTML, so the widget also
    // works on pages that enforce Trusted Types.
    var ICON_CHAT = ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z'];
    var ICON_CLOSE = ['M6 6l12 12M18 6L6 18'];

    var state = null; // set by init(), cleared by destroy()

    function el(tag, className, attrs) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        return node;
    }

    // Replaces the content of `node` with an icon drawn from `paths`.
    function setIcon(node, paths) {
        var NS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(NS, 'svg');
        var attrs = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75',
            'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
        Object.keys(attrs).forEach(function (k) { svg.setAttribute(k, attrs[k]); });
        paths.forEach(function (d) {
            var path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            svg.appendChild(path);
        });
        while (node.firstChild) node.removeChild(node.firstChild);
        node.appendChild(svg);
    }

    // Asks the host's allowLink(href) whether a link may be clickable. A throwing hook counts as "no".
    function linkAllowed(allowLink, href) {
        if (typeof allowLink !== 'function') return true;
        try { return allowLink(href) !== false; } catch (e) { return false; }
    }

    // Turns plain text into DOM nodes, making URLs and emails clickable.
    // We build nodes instead of using innerHTML, so message text can never inject markup.
    // Every quantifier before a fixed character is bounded, so a long run of letters with no
    // "@" stays linear instead of backtracking quadratically (and freezing the page).
    function renderText(container, text, allowLink) {
        var pattern = /(https?:\/\/[^\s]*[^\s.,;:!?)]|[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]{0,190}\w)/g;
        var last = 0;
        var match;
        while ((match = pattern.exec(text)) !== null) {
            var isEmail = match[0].indexOf('://') === -1;
            var href = isEmail ? 'mailto:' + match[0] : match[0];
            if (!linkAllowed(allowLink, href)) continue; // left in the text, rendered as plain text below
            if (match.index > last) container.appendChild(document.createTextNode(text.slice(last, match.index)));
            var a = el('a');
            a.href = href;
            if (!isEmail) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            a.textContent = match[0];
            container.appendChild(a);
            last = match.index + match[0].length;
        }
        if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
    }

    // Applies the `colors` option ({ background, text, accent }) to `node` as --_cfg-*, the
    // colours of the "custom" theme. A new set replaces the old one completely. Values the
    // browser doesn't recognise as a colour are skipped, so a typo keeps the default colour
    // instead of leaving the panel transparent.
    var COLOR_VARS = { background: '--_cfg-bg', text: '--_cfg-fg', accent: '--_cfg-accent' };
    function applyColors(node, colors) {
        if (!colors || typeof colors !== 'object') return;
        Object.keys(COLOR_VARS).forEach(function (key) {
            node.style.removeProperty(COLOR_VARS[key]);
            setColor(node, COLOR_VARS[key], colors[key]);
        });
    }

    function setColor(node, name, value) {
        if (typeof value !== 'string') return;
        if (global.CSS && typeof global.CSS.supports === 'function' && !global.CSS.supports('color', value)) return;
        node.style.setProperty(name, value);
    }

    function mergeConfig(user) {
        var cfg = {};
        Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = DEFAULTS[k]; });
        Object.keys(user || {}).forEach(function (k) { cfg[k] = user[k]; });
        cfg.position = {
            right: (user && user.position && user.position.right) != null ? user.position.right : DEFAULTS.position.right,
            bottom: (user && user.position && user.position.bottom) != null ? user.position.bottom : DEFAULTS.position.bottom
        };
        return cfg;
    }

    // The most recent `max` messages, starting on a user turn (many chat APIs reject a
    // conversation that opens with the assistant). Keeps the request size bounded.
    function trimHistory(history, max) {
        var recent = history.slice(-Math.max(1, max));
        while (recent.length && recent[0].role !== 'user') recent.shift();
        return recent;
    }

    // Asks the configured source for a reply. Always returns a Promise<string>, and a
    // synchronous throw (from respond() or fetch) becomes a rejection instead of escaping.
    function getReply(cfg, text, history) {
        return new Promise(function (resolve) {
            if (typeof cfg.respond === 'function') {
                resolve(cfg.respond(text, history.slice()));
                return;
            }
            if (!cfg.endpoint) throw new Error('No respond() or endpoint configured');

            // A hung backend must not leave the chat stuck on "typing" forever.
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer;
            var timeout = new Promise(function (resolveTimeout, reject) {
                timer = setTimeout(function () {
                    if (controller) controller.abort();
                    reject(new Error('Timed out'));
                }, cfg.endpointTimeout);
            });
            var request = fetch(cfg.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: trimHistory(history, cfg.maxHistory) }),
                signal: controller ? controller.signal : undefined
            }).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            }).then(function (data) {
                if (!data || typeof data.reply !== 'string') throw new Error('Bad response shape');
                return data.reply;
            });
            resolve(Promise.race([request, timeout]).then(function (reply) {
                clearTimeout(timer);
                return reply;
            }, function (err) {
                clearTimeout(timer);
                throw err;
            }));
        });
    }

    function init(userConfig) {
        if (state) return; // already mounted - init() twice would create two widgets
        var cfg = mergeConfig(userConfig);

        var host = el('div', null, { id: 'foliobot' });
        var zIndex = isFinite(Number(cfg.zIndex)) ? Number(cfg.zIndex) : DEFAULTS.zIndex;
        host.style.cssText = 'position:fixed;z-index:' + zIndex + ';left:0;top:0;width:0;height:0;';
        var root = host.attachShadow({ mode: 'open' });

        var style = el('style');
        if (cfg.styleNonce) style.setAttribute('nonce', cfg.styleNonce);
        style.textContent = STYLES;
        root.appendChild(style);

        var wrap = el('div', 'fb');
        // The config value is only a fallback: a --fb-accent set by the host page's CSS wins.
        setColor(wrap, '--fb-accent-cfg', cfg.accent);
        // setTheme('custom', colors) can also swap the custom colours at runtime.
        function setTheme(theme, colors) {
            applyColors(wrap, colors);
            wrap.setAttribute('data-theme', THEMES.indexOf(theme) !== -1 ? theme : 'auto');
        }
        var themeGiven = userConfig && userConfig.theme != null;
        setTheme(!themeGiven && cfg.colors ? 'custom' : cfg.theme, cfg.colors);

        var launcher = el('button', 'fb-launcher', {
            type: 'button',
            'aria-label': cfg.launcherLabel,
            'aria-expanded': 'false',
            'aria-controls': 'fb-panel'
        });
        setIcon(launcher, ICON_CHAT);
        launcher.style.right = cfg.position.right + 'px';
        launcher.style.bottom = cfg.position.bottom + 'px';
        // Position the panel just above the launcher, sharing its right edge.
        var panelBottom = cfg.position.bottom + 44 + 8;

        var panel = el('section', 'fb-panel', { id: 'fb-panel', role: 'dialog', 'aria-label': cfg.title });
        panel.style.right = cfg.position.right + 'px';
        panel.style.bottom = panelBottom + 'px';
        // Never taller than maxHeight, and never taller than the space above the launcher.
        panel.style.maxHeight = 'min(' + cfg.maxHeight + 'px, calc(100vh - ' + (panelBottom + 24) + 'px))';

        var header = el('div', 'fb-header');
        var title = el('h2', 'fb-title');
        title.textContent = cfg.title;
        var closeBtn = el('button', 'fb-btn', { type: 'button', 'aria-label': 'Close chat' });
        setIcon(closeBtn, ICON_CLOSE);
        header.appendChild(title);
        header.appendChild(closeBtn);

        // role="log" + aria-live makes screen readers announce new messages.
        var log = el('div', 'fb-log', { role: 'log', 'aria-live': 'polite' });
        var chips = el('div', 'fb-chips');

        var form = el('form', 'fb-form');
        var input = el('input', 'fb-input', {
            type: 'text',
            'aria-label': cfg.placeholder,
            placeholder: cfg.placeholder,
            maxlength: String(cfg.maxLength),
            autocomplete: 'off'
        });
        var send = el('button', 'fb-send', { type: 'submit' });
        send.textContent = 'Send';
        form.appendChild(input);
        form.appendChild(send);

        panel.appendChild(header);
        panel.appendChild(log);
        panel.appendChild(chips);
        panel.appendChild(form);
        wrap.appendChild(panel);
        wrap.appendChild(launcher);
        root.appendChild(wrap);

        var history = [];   // [{ role: 'user' | 'assistant', content }] - kept in memory only, never stored
        var pending = false;
        var greeted = false;

        function addMessage(role, text) {
            var bubble = el('div', 'fb-msg fb-msg--' + (role === 'user' ? 'user' : 'bot'));
            renderText(bubble, text, cfg.allowLink);
            log.appendChild(bubble);
            log.scrollTop = log.scrollHeight;
            return bubble;
        }

        function showTyping() {
            var bubble = el('div', 'fb-msg fb-msg--bot');
            // The animated dots are decoration; screen readers get the text instead.
            var dots = el('span', 'fb-typing', { 'aria-hidden': 'true' });
            for (var d = 0; d < 3; d++) dots.appendChild(el('i'));
            var label = el('span', 'fb-sr');
            label.textContent = 'Typing';
            bubble.appendChild(dots);
            bubble.appendChild(label);
            log.appendChild(bubble);
            log.scrollTop = log.scrollHeight;
            return bubble;
        }

        function setPending(value) {
            pending = value;
            // Not `disabled`: a disabled control drops keyboard and screen-reader focus (and Esc
            // stops reaching the widget). ask() ignores submits while pending anyway.
            send.setAttribute('aria-disabled', value ? 'true' : 'false');
            input.readOnly = value;
            input.setAttribute('aria-busy', value ? 'true' : 'false');
            if (!value && isOpen()) input.focus();
        }

        function ask(rawText) {
            var text = String(rawText || '').trim().slice(0, cfg.maxLength);
            if (!text || pending) return;
            chips.style.display = 'none'; // suggestions are only for the first question
            addMessage('user', text);
            var userTurn = { role: 'user', content: text };
            history.push(userTurn);
            input.value = '';
            setPending(true);

            var typing = showTyping();
            var started = Date.now();
            var failed = false;
            getReply(cfg, text, history).then(function (reply) {
                if (typeof reply !== 'string' || reply === '') throw new Error('Empty reply');
                // A runaway or hostile backend must not be able to flood the page.
                reply = reply.slice(0, cfg.maxReplyLength);
                // Pad instant answers so they do not feel robotic.
                var wait = Math.max(0, cfg.typingDelay - (Date.now() - started));
                return new Promise(function (resolve) { setTimeout(function () { resolve(reply); }, wait); });
            }).catch(function () {
                failed = true;
                return cfg.errorMessage;
            }).then(function (answer) {
                if (typing.parentNode) typing.parentNode.removeChild(typing);
                addMessage('assistant', answer);
                if (failed) {
                    // The apology is not something the assistant said, so it stays out of the
                    // history; the unanswered question goes too, so the roles keep alternating
                    // and a retry starts clean.
                    var index = history.lastIndexOf(userTurn);
                    if (index !== -1) history.splice(index, 1);
                } else {
                    history.push({ role: 'assistant', content: answer });
                }
                setPending(false);
            });
        }

        var suggestions = cfg.suggestions.slice(0, cfg.maxSuggestions);
        suggestions.forEach(function (label) {
            var chip = el('button', 'fb-chip', { type: 'button' });
            chip.textContent = label;
            chip.addEventListener('click', function () { ask(label); });
            chips.appendChild(chip);
        });
        if (!suggestions.length) chips.style.display = 'none';

        function open() {
            panel.classList.add('is-open');
            launcher.setAttribute('aria-expanded', 'true');
            setIcon(launcher, ICON_CLOSE);
            launcher.setAttribute('aria-label', 'Close chat');
            if (!greeted) {
                greeted = true;
                // An empty or missing greeting means none: the panel opens on the suggestions.
                if (typeof cfg.greeting === 'string' && cfg.greeting.trim() !== '') addMessage('assistant', cfg.greeting);
            }
            input.focus();
        }

        function close() {
            panel.classList.remove('is-open');
            launcher.setAttribute('aria-expanded', 'false');
            setIcon(launcher, ICON_CHAT);
            launcher.setAttribute('aria-label', cfg.launcherLabel);
        }

        function isOpen() { return panel.classList.contains('is-open'); }

        launcher.addEventListener('click', function () { if (isOpen()) close(); else open(); });
        closeBtn.addEventListener('click', function () { close(); launcher.focus(); });
        form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
        // Esc closes the panel; the listener is on the shadow root so it only fires while focus is inside the widget.
        root.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen()) { close(); launcher.focus(); }
        });

        document.body.appendChild(host);
        state = { host: host, open: open, close: close, setTheme: setTheme };
    }

    function destroy() {
        if (!state) return;
        if (state.host.parentNode) state.host.parentNode.removeChild(state.host);
        state = null;
    }

    global.FolioBot = {
        init: init,
        open: function () { if (state) state.open(); },
        close: function () { if (state) state.close(); },
        setTheme: function (theme, colors) { if (state) state.setTheme(theme, colors); },
        destroy: destroy
    };
})(window);
