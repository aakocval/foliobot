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
 *                                v1 uses this with scripted answers (see js/chat-init.js).
 *   2. endpoint                - a URL. The widget POSTs { messages: [{role, content}] }
 *                                and expects { reply: "..." } back. This is where your
 *                                own backend (e.g. a Cloudflare Worker calling an LLM) plugs in.
 *
 * If both are given, `respond` wins.
 *
 * Public API:  FolioBot.init(config) / open() / close() / destroy()
 */
(function (global) {
    'use strict';

    var DEFAULTS = {
        title: 'Chat',
        greeting: 'Hi! How can I help?',
        suggestions: [],
        placeholder: 'Type your question...',
        launcherLabel: 'Open chat',
        accent: '#b81828',            // launcher + send button + user bubbles
        position: { right: 24, bottom: 24 }, // px offsets of the launcher from the viewport corner
        maxLength: 200,               // max characters a visitor can send per message
        typingDelay: 450,             // ms of fake "typing" for instant answers, so replies feel natural
        errorMessage: 'Sorry, something went wrong. Please try again in a moment.',
        respond: null,
        endpoint: null
    };

    // All widget CSS lives inside the shadow root, so the host page's styles
    // cannot leak in and ours cannot leak out. Custom properties (--fb-*) are
    // the only things that cross the boundary, which makes them the theming API.
    var STYLES = [
        ':host { all: initial; }',
        '*, *::before, *::after { box-sizing: border-box; }',
        '.fb { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif; font-size: 15px; line-height: 1.45; color: #f2f2f4; user-select: text; -webkit-user-select: text; }',

        '.fb-launcher { position: fixed; width: 56px; height: 56px; border: 0; border-radius: 50%; background: var(--fb-accent); color: #fff; display: flex; align-items: center; justify-content: center; cursor: var(--fb-cursor, pointer); box-shadow: 0 8px 24px rgba(0,0,0,.35); transition: transform .2s ease, box-shadow .2s ease; }',
        '.fb-launcher:hover { transform: translateY(-2px) scale(1.04); }',
        '.fb-launcher:focus-visible, .fb-btn:focus-visible, .fb-chip:focus-visible, .fb-input:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }',
        '.fb-launcher svg { width: 26px; height: 26px; }',

        '.fb-panel { position: fixed; width: 360px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px); display: flex; flex-direction: column; background: #2b2b2d; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; box-shadow: 0 24px 60px rgba(0,0,0,.45); overflow: hidden; opacity: 0; transform: translateY(12px) scale(.98); pointer-events: none; visibility: hidden; transition: opacity .2s ease, transform .2s ease, visibility 0s linear .2s; }',
        '.fb-panel.is-open { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition-delay: 0s; }',

        '.fb-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.1); }',
        '.fb-title { margin: 0; font-size: 15px; font-weight: 600; }',
        '.fb-btn { border: 0; background: transparent; color: rgba(255,255,255,.75); width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: var(--fb-cursor, pointer); }',
        '.fb-btn:hover { color: #fff; background: rgba(255,255,255,.1); }',
        '.fb-btn svg { width: 18px; height: 18px; }',

        '.fb-log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }',
        '.fb-msg { max-width: 85%; padding: 9px 13px; border-radius: 14px; white-space: pre-wrap; overflow-wrap: anywhere; }',
        '.fb-msg--bot { align-self: flex-start; background: rgba(255,255,255,.1); border-bottom-left-radius: 4px; }',
        '.fb-msg--user { align-self: flex-end; background: var(--fb-accent); color: #fff; border-bottom-right-radius: 4px; }',
        '.fb-msg a { color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: var(--fb-cursor, pointer); }',

        '.fb-typing { display: inline-flex; gap: 4px; padding: 4px 0; }',
        '.fb-typing i { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.6); animation: fb-blink 1s infinite ease-in-out; }',
        '.fb-typing i:nth-child(2) { animation-delay: .15s; }',
        '.fb-typing i:nth-child(3) { animation-delay: .3s; }',
        '@keyframes fb-blink { 0%, 80%, 100% { opacity: .25; } 40% { opacity: 1; } }',

        '.fb-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 16px 12px; }',
        '.fb-chip { border: 1px solid rgba(255,255,255,.25); background: transparent; color: #f2f2f4; font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px; cursor: var(--fb-cursor, pointer); transition: background .2s ease; }',
        '.fb-chip:hover { background: rgba(255,255,255,.12); }',

        '.fb-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(255,255,255,.1); }',
        '.fb-input { flex: 1; min-width: 0; border: 1px solid rgba(255,255,255,.2); background: rgba(255,255,255,.06); color: #fff; font: inherit; padding: 9px 12px; border-radius: 10px; cursor: var(--fb-cursor, text); }',
        '.fb-input::placeholder { color: rgba(255,255,255,.5); }',
        '.fb-send { border: 0; background: var(--fb-accent); color: #fff; font: inherit; font-weight: 600; padding: 0 16px; border-radius: 10px; cursor: var(--fb-cursor, pointer); }',
        '.fb-send:disabled { opacity: .5; }',

        '@media (prefers-reduced-motion: reduce) { .fb-launcher, .fb-panel, .fb-chip { transition: none; } .fb-typing i { animation: none; opacity: .6; } }'
    ].join('\n');

    var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>';
    var ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    var state = null; // set by init(), cleared by destroy()

    function el(tag, className, attrs) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        return node;
    }

    // Turns plain text into DOM nodes, making URLs and emails clickable.
    // We build nodes instead of using innerHTML, so message text can never inject markup.
    function renderText(container, text) {
        var pattern = /(https?:\/\/[^\s]*[^\s.,;:!?)]|[\w.+-]+@[\w-]+\.[\w.-]*\w)/g;
        var last = 0;
        var match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > last) container.appendChild(document.createTextNode(text.slice(last, match.index)));
            var isEmail = match[0].indexOf('://') === -1;
            var a = el('a');
            a.href = isEmail ? 'mailto:' + match[0] : match[0];
            if (!isEmail) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            a.textContent = match[0];
            container.appendChild(a);
            last = match.index + match[0].length;
        }
        if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
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

    // Asks the configured source for a reply. Always returns a Promise<string>.
    function getReply(cfg, text, history) {
        if (typeof cfg.respond === 'function') {
            return Promise.resolve(cfg.respond(text, history.slice()));
        }
        if (cfg.endpoint) {
            return fetch(cfg.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: history })
            }).then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            }).then(function (data) {
                if (!data || typeof data.reply !== 'string') throw new Error('Bad response shape');
                return data.reply;
            });
        }
        return Promise.reject(new Error('No respond() or endpoint configured'));
    }

    function init(userConfig) {
        if (state) return; // already mounted - init() twice would create two widgets
        var cfg = mergeConfig(userConfig);

        var host = el('div', null, { id: 'foliobot' });
        host.style.cssText = 'position:fixed;z-index:200;left:0;top:0;width:0;height:0;';
        var root = host.attachShadow({ mode: 'open' });

        var style = el('style');
        style.textContent = STYLES;
        root.appendChild(style);

        var wrap = el('div', 'fb');
        wrap.style.setProperty('--fb-accent', cfg.accent);

        var launcher = el('button', 'fb-launcher', {
            type: 'button',
            'aria-label': cfg.launcherLabel,
            'aria-expanded': 'false',
            'aria-controls': 'fb-panel'
        });
        launcher.innerHTML = ICON_CHAT;
        launcher.style.right = cfg.position.right + 'px';
        launcher.style.bottom = cfg.position.bottom + 'px';
        // Position the panel just above the launcher, sharing its right edge.
        var panelBottom = cfg.position.bottom + 56 + 12;

        var panel = el('section', 'fb-panel', { id: 'fb-panel', role: 'dialog', 'aria-label': cfg.title });
        panel.style.right = cfg.position.right + 'px';
        panel.style.bottom = panelBottom + 'px';

        var header = el('div', 'fb-header');
        var title = el('h2', 'fb-title');
        title.textContent = cfg.title;
        var closeBtn = el('button', 'fb-btn', { type: 'button', 'aria-label': 'Close chat' });
        closeBtn.innerHTML = ICON_CLOSE;
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
            renderText(bubble, text);
            log.appendChild(bubble);
            log.scrollTop = log.scrollHeight;
            return bubble;
        }

        function showTyping() {
            var bubble = el('div', 'fb-msg fb-msg--bot');
            var dots = el('span', 'fb-typing', { 'aria-label': 'Typing' });
            dots.innerHTML = '<i></i><i></i><i></i>';
            bubble.appendChild(dots);
            log.appendChild(bubble);
            log.scrollTop = log.scrollHeight;
            return bubble;
        }

        function setPending(value) {
            pending = value;
            send.disabled = value;
            input.disabled = value;
            if (!value) input.focus();
        }

        function ask(rawText) {
            var text = String(rawText || '').trim().slice(0, cfg.maxLength);
            if (!text || pending) return;
            chips.style.display = 'none'; // suggestions are only for the first question
            addMessage('user', text);
            history.push({ role: 'user', content: text });
            input.value = '';
            setPending(true);

            var typing = showTyping();
            var started = Date.now();
            getReply(cfg, text, history).then(function (reply) {
                // Pad instant answers so they do not feel robotic.
                var wait = Math.max(0, cfg.typingDelay - (Date.now() - started));
                return new Promise(function (resolve) { setTimeout(function () { resolve(reply); }, wait); });
            }).catch(function () {
                return cfg.errorMessage;
            }).then(function (reply) {
                var answer = String(reply);
                if (typing.parentNode) typing.parentNode.removeChild(typing);
                addMessage('assistant', answer);
                history.push({ role: 'assistant', content: answer });
                setPending(false);
            });
        }

        cfg.suggestions.forEach(function (label) {
            var chip = el('button', 'fb-chip', { type: 'button' });
            chip.textContent = label;
            chip.addEventListener('click', function () { ask(label); });
            chips.appendChild(chip);
        });
        if (!cfg.suggestions.length) chips.style.display = 'none';

        function open() {
            panel.classList.add('is-open');
            launcher.setAttribute('aria-expanded', 'true');
            launcher.innerHTML = ICON_CLOSE;
            launcher.setAttribute('aria-label', 'Close chat');
            if (!greeted) {
                greeted = true;
                addMessage('assistant', cfg.greeting);
            }
            input.focus();
        }

        function close() {
            panel.classList.remove('is-open');
            launcher.setAttribute('aria-expanded', 'false');
            launcher.innerHTML = ICON_CHAT;
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
        state = { host: host, open: open, close: close };
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
        destroy: destroy
    };
})(window);
