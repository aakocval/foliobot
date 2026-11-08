// Tests for the widget's config logic (widget/foliobot.js): themes, colours, accent, greeting.
// Run with:  node --test tests/*.test.js
// No dependencies: Node has no DOM, so this file brings a tiny fake one with just the calls the
// widget makes. It checks what the widget sets (attributes, CSS variables, messages), not how
// the result looks; rendering still needs a real browser (see examples/demo.html).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// --- A minimal fake DOM -------------------------------------------------------------------

class FakeStyle {
    constructor() { this.vars = {}; }
    setProperty(name, value) { this.vars[name] = String(value); }
    removeProperty(name) { delete this.vars[name]; }
    getPropertyValue(name) { return this.vars[name] || ''; }
}

class FakeNode {
    constructor(tag) {
        this.tagName = tag;
        this.children = [];
        this.parentNode = null;
        this.attributes = {};
        this.listeners = {};
        this.className = '';
        this.style = new FakeStyle();
        this.ownText = '';
        const node = this;
        this.classList = {
            add(name) { if (!this.contains(name)) node.className = (node.className + ' ' + name).trim(); },
            remove(name) { node.className = node.className.split(' ').filter((c) => c !== name).join(' '); },
            contains(name) { return node.className.split(' ').includes(name); }
        };
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
    appendChild(child) {
        if (child.parentNode) child.parentNode.removeChild(child);
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    removeChild(child) {
        this.children.splice(this.children.indexOf(child), 1);
        child.parentNode = null;
        return child;
    }
    get firstChild() { return this.children[0] || null; }
    get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(''); }
    set textContent(value) { this.children = []; this.ownText = String(value); }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
    attachShadow() { this.shadowRoot = new FakeNode('#shadow-root'); return this.shadowRoot; }
    focus() {}
    // Every descendant whose class list contains `className`.
    findAll(className) {
        const found = [];
        const walk = (n) => n.children.forEach((c) => {
            if (c.classList.contains(className)) found.push(c);
            walk(c);
        });
        walk(this);
        return found;
    }
}

globalThis.window = globalThis;
globalThis.document = {
    body: new FakeNode('body'),
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (ns, tag) => new FakeNode(tag),
    createTextNode: (text) => { const n = new FakeNode('#text'); n.ownText = String(text); return n; }
};
// The widget asks CSS.supports('color', value) before using a colour. This stand-in accepts
// hex colours only, which is enough to tell valid input from a typo.
globalThis.CSS = { supports: (prop, value) => prop === 'color' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) };

require('../widget/foliobot.js');
const FolioBot = globalThis.FolioBot;

// --- Helpers ------------------------------------------------------------------------------

// Mounts a fresh widget and returns handles to the parts the tests look at.
function mount(config) {
    FolioBot.destroy();
    FolioBot.init(Object.assign({ respond: () => 'ok' }, config));
    const root = document.body.children[0].shadowRoot;
    const wrap = root.findAll('fb')[0];
    return {
        root,
        wrap,
        theme: () => wrap.getAttribute('data-theme'),
        vars: () => Object.assign({}, wrap.style.vars),
        messages: () => root.findAll('fb-msg').map((m) => m.textContent),
        css: root.children[0].textContent
    };
}

test.afterEach(() => FolioBot.destroy());

// --- Themes -------------------------------------------------------------------------------

test('theme defaults to auto', () => {
    assert.equal(mount().theme(), 'auto');
});

test('light, dark and custom are accepted; anything else falls back to auto', () => {
    for (const theme of ['auto', 'light', 'dark', 'custom']) assert.equal(mount({ theme }).theme(), theme);
    assert.equal(mount({ theme: 'blue' }).theme(), 'auto');
    assert.equal(mount({ theme: 42 }).theme(), 'auto');
});

test('setTheme switches the theme after init, and unknown values fall back to auto', () => {
    const w = mount({ theme: 'dark' });
    FolioBot.setTheme('light');
    assert.equal(w.theme(), 'light');
    FolioBot.setTheme('nope');
    assert.equal(w.theme(), 'auto');
});

test('setTheme, open and close are safe to call before init and after destroy', () => {
    FolioBot.destroy();
    assert.doesNotThrow(() => { FolioBot.setTheme('dark'); FolioBot.open(); FolioBot.close(); });
});

// --- Custom colours -----------------------------------------------------------------------

test('colors without a theme means the custom theme', () => {
    const w = mount({ colors: { background: '#0f172a', text: '#e2e8f0' } });
    assert.equal(w.theme(), 'custom');
    assert.equal(w.vars()['--_cfg-bg'], '#0f172a');
    assert.equal(w.vars()['--_cfg-fg'], '#e2e8f0');
});

test('an explicit theme wins over colors, which are kept for a later switch to custom', () => {
    const w = mount({ theme: 'light', colors: { background: '#0f172a' } });
    assert.equal(w.theme(), 'light');
    FolioBot.setTheme('custom');
    assert.equal(w.theme(), 'custom');
    assert.equal(w.vars()['--_cfg-bg'], '#0f172a');
});

test('colour values the browser does not recognise are ignored', () => {
    const w = mount({ colors: { background: 'not-a-colour', text: '#073642', accent: 12 } });
    assert.equal(w.vars()['--_cfg-bg'], undefined);
    assert.equal(w.vars()['--_cfg-fg'], '#073642');
    assert.equal(w.vars()['--_cfg-accent'], undefined);
});

test('setTheme with new colours replaces the old set completely', () => {
    const w = mount({ colors: { background: '#000', text: '#fff', accent: '#f00' } });
    FolioBot.setTheme('custom', { background: '#fdf6e3', text: '#073642' });
    assert.deepEqual(
        [w.vars()['--_cfg-bg'], w.vars()['--_cfg-fg'], w.vars()['--_cfg-accent']],
        ['#fdf6e3', '#073642', undefined]
    );
});

// --- Accent -------------------------------------------------------------------------------

test('accent is unset by default, so hover falls back to the theme text colour', () => {
    assert.equal(mount().vars()['--fb-accent-cfg'], undefined);
});

test('a valid accent is applied and an invalid one is ignored', () => {
    assert.equal(mount({ accent: '#b81828' }).vars()['--fb-accent-cfg'], '#b81828');
    assert.equal(mount({ accent: 'reddish' }).vars()['--fb-accent-cfg'], undefined);
});

test('hover and focus use the accent chain: page CSS, then theme accent, then text colour', () => {
    const { css } = mount();
    assert.match(css, /\.fb-launcher:hover \{ color: var\(--fb-accent, var\(--_t-accent\)\); \}/);
    assert.match(css, /\.fb \{ --_t-accent: var\(--fb-accent-cfg, var\(--_fg\)\); \}/);
    assert.match(css, /\.fb\[data-theme="custom"\] \{[^}]*--_t-accent: var\(--_cfg-accent, var\(--fb-accent-cfg, var\(--_fg\)\)\)/);
});

test('secondary colours are tints of the text colour, not hardcoded white', () => {
    // Hardcoded white overlays would vanish on the light theme.
    assert.doesNotMatch(mount().css, /rgba\(255,\s*255,\s*255/);
});

// --- Greeting -----------------------------------------------------------------------------

test('the greeting is shown once, on first open', () => {
    const w = mount({ greeting: 'Hello there' });
    assert.deepEqual(w.messages(), []);
    FolioBot.open();
    FolioBot.close();
    FolioBot.open();
    assert.deepEqual(w.messages(), ['Hello there']);
});

test('an empty or blank greeting shows no message', () => {
    for (const greeting of ['', '   ', null]) {
        const w = mount({ greeting });
        FolioBot.open();
        assert.deepEqual(w.messages(), [], 'greeting: ' + JSON.stringify(greeting));
    }
});
