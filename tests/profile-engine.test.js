// Tests for the scripted answer engine (widget/profile-engine.js).
// Run with:  node --test tests/*.test.js
// No dependencies: uses Node's built-in test runner. The engine is plain logic, so it only
// needs a fake `window` and an empty FolioBot object to load.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

globalThis.window = globalThis;
globalThis.FolioBot = {};
require('../widget/profile-engine.js');
const { fromProfile } = globalThis.FolioBot;

const profile = {
    schemaVersion: 1,
    name: 'Sam Sample',
    headline: 'Software Engineer',
    location: 'Manila, PH',
    bio: 'Builds mobile apps.',
    availability: 'Open to opportunities',
    contact: {
        email: 'sam@example.com',
        links: [{ label: 'GitHub', url: 'https://github.com/sam' }]
    },
    skills: { summary: 'Mostly Swift and Python.', items: ['Swift', 'Python', 'React Native'] },
    projects: [
        { name: 'Intro.u', type: 'app', description: 'Meet people.', role: 'Built it.', stack: ['SwiftUI', 'MVVM-C'], stats: ['★ 5.0 (2 ratings)'], link: 'https://example.com/introu' },
        { name: 'Dyna', type: 'app', description: 'Food diary.' },
        { name: 'Shop Site', type: 'website', description: 'A store.', link: 'https://example.com/shop' }
    ],
    faqs: [
        { q: 'Are you open to relocation?', a: 'Yes, remote or relocation.', keywords: ['relocate', 'relocation'] }
    ]
};

const respond = fromProfile(profile).respond;
const DECLINE = "I can only answer questions about Sam Sample's work, tech stack, and how to get in touch. Try one of the suggested questions, or ask about a project by name.";

test('fromProfile requires a name', () => {
    assert.throws(() => fromProfile({}), /name is required/);
    assert.throws(() => fromProfile(null), /name is required/);
});

test('defaults use the profile name', () => {
    const cfg = fromProfile(profile);
    assert.equal(cfg.title, 'Ask about Sam Sample');
    assert.equal(cfg.greeting, "Hi! I'm a small assistant for this portfolio. Ask me about Sam Sample.");
    assert.deepEqual(cfg.suggestions, []);
});

test('bot settings and overrides win over defaults', () => {
    const cfg = fromProfile(
        { name: 'Sam', bot: { title: 'Hello', greeting: 'Hey', suggestions: ['a'] } },
        { title: 'Override', position: { right: 1, bottom: 2 } }
    );
    assert.equal(cfg.title, 'Override');
    assert.equal(cfg.greeting, 'Hey');
    assert.deepEqual(cfg.suggestions, ['a']);
    assert.deepEqual(cfg.position, { right: 1, bottom: 2 });
});

test('a project named in the question returns its facts', () => {
    const answer = respond('What stack did Sam use on Intro.u?');
    assert.match(answer, /^Intro\.u - Meet people\./);
    assert.match(answer, /★ 5\.0 \(2 ratings\)/);
    assert.match(answer, /Role: Built it\./);
    assert.match(answer, /Stack: SwiftUI, MVVM-C/);
    assert.match(answer, /https:\/\/example\.com\/introu/);
});

test('project names match whole words only', () => {
    // "dynamic" contains "dyna" but is not the project; it falls through to the about topic.
    const answer = respond('tell me about dynamic things');
    assert.doesNotMatch(answer, /^Dyna -/);
    assert.match(answer, /Software Engineer/);
});

test('a project without a stack says so instead of inventing one', () => {
    const answer = respond('tell me about Dyna');
    assert.match(answer, /^Dyna - Food diary\./);
    assert.match(answer, /don't have stack details/);
    assert.doesNotMatch(answer, /Stack:/);
});

test('contact answer includes availability, email and links', () => {
    for (const q of ['How can I contact Sam?', 'is Sam available?', 'github?']) {
        const answer = respond(q);
        assert.match(answer, /Open to opportunities\./, q);
        assert.match(answer, /Email: sam@example\.com/, q);
        assert.match(answer, /GitHub: https:\/\/github\.com\/sam/, q);
    }
});

test('stack questions return the skills summary, including by skill name', () => {
    assert.equal(respond("What's the tech stack?"), 'Mostly Swift and Python.');
    assert.equal(respond('does Sam know Python?'), 'Mostly Swift and Python.');
    assert.equal(respond('any react native work?'), 'Mostly Swift and Python.');
});

test('project list is grouped by type', () => {
    const answer = respond('What apps has Sam shipped?');
    assert.match(answer, /Apps: Intro\.u, Dyna\./);
    assert.match(answer, /Websites: Shop Site\./);
    assert.doesNotMatch(answer, /Projects:/);
});

test('about question uses headline, location and bio', () => {
    const answer = respond('Who is Sam?');
    assert.equal(answer, 'Sam Sample - Software Engineer\nBased in Manila, PH.\nBuilds mobile apps.');
});

test('faqs match by exact question and by keyword', () => {
    assert.equal(respond('Are you open to relocation?'), 'Yes, remote or relocation.');
    assert.equal(respond('would you relocate?'), 'Yes, remote or relocation.');
});

test('faqs take priority over built-in topics', () => {
    const custom = fromProfile({
        name: 'Sam',
        contact: { email: 'sam@example.com' },
        faqs: [{ q: 'Can I hire you?', a: 'Custom answer.', keywords: ['hire'] }]
    }).respond;
    assert.equal(custom('can I hire Sam?'), 'Custom answer.');
});

test('greetings are answered', () => {
    assert.match(respond('hi'), /^Hello! Ask me about Sam Sample's work/);
    assert.match(respond('Good morning'), /^Hello!/);
});

test('off-topic questions get the decline message', () => {
    assert.equal(respond('what is the weather'), DECLINE);
    assert.equal(respond('write me a poem'), DECLINE);
});

test('a custom decline message is used', () => {
    const custom = fromProfile({ name: 'Sam', bot: { declineMessage: 'Not my area.' } }).respond;
    assert.equal(custom('what is the weather'), 'Not my area.');
});

test('a minimal profile (name only) never throws', () => {
    const minimal = fromProfile({ name: 'Sam' }).respond;
    for (const q of ['contact', 'stack', 'projects', 'who are you', 'hi', 'anything else']) {
        assert.equal(typeof minimal(q), 'string', q);
    }
    assert.equal(minimal('contact'), 'No contact details are listed yet.');
});

test('every suggestion in the example profile is answerable (none hits the decline message)', () => {
    const example = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'examples', 'profile.example.json'), 'utf8'));
    const answer = fromProfile(example).respond;
    const decline = "I can only answer questions about " + example.name + "'s work, tech stack, and how to get in touch. Try one of the suggested questions, or ask about a project by name.";
    assert.ok(example.bot.suggestions.length > 0);
    for (const suggestion of example.bot.suggestions) {
        assert.notEqual(answer(suggestion), decline, suggestion);
    }
});
