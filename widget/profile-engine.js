/*!
 * FolioBot.fromProfile - turns a profile.json (see profile.schema.json) into a
 * widget config whose answers come from that profile. Load it AFTER foliobot.js.
 *
 *   fetch('profile.json').then(r => r.json()).then(function (profile) {
 *     FolioBot.init(FolioBot.fromProfile(profile));
 *   });
 *
 * This is the scripted (no AI, no network) answer engine. It knows nothing about any
 * particular person: every fact comes from the profile. An AI backend would replace
 * `respond` with a call to an endpoint, but can still read the same profile.
 */
(function (global) {
    'use strict';

    var Chat = global.FolioBot;
    if (!Chat) throw new Error('profile-engine.js must load after foliobot.js');

    // " Intro.u " -> " intro u ": lowercase, punctuation to single spaces, padded with spaces
    // so `has()` below only ever matches whole words ("dyna" must not match "dynamic").
    function plain(text) {
        return ' ' + String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    }

    function has(haystackPlain, term) {
        return String(term).trim() !== '' && haystackPlain.indexOf(plain(term)) !== -1;
    }

    function anyTerm(haystackPlain, terms) {
        for (var i = 0; i < terms.length; i++) {
            if (has(haystackPlain, terms[i])) return true;
        }
        return false;
    }

    function describeProject(p) {
        var lines = [p.description ? p.name + ' - ' + p.description : p.name];
        if (p.stats && p.stats.length) lines.push(p.stats.join(' · '));
        if (p.role) lines.push('Role: ' + p.role);
        lines.push(p.stack && p.stack.length ? 'Stack: ' + p.stack.join(', ') : "I don't have stack details listed for this one yet.");
        if (p.link) lines.push(p.link);
        return lines.join('\n');
    }

    function listProjects(projects) {
        var groups = [['app', 'Apps'], ['website', 'Websites'], ['other', 'Projects']];
        var lines = [];
        groups.forEach(function (group) {
            var names = projects.filter(function (p) { return (p.type || 'other') === group[0]; })
                .map(function (p) { return p.name; });
            if (names.length) lines.push(group[1] + ': ' + names.join(', ') + '.');
        });
        lines.push('Ask about any of them by name to get the role and tech stack.');
        return lines.join('\n');
    }

    function describeContact(profile) {
        var contact = profile.contact || {};
        var lines = [];
        if (profile.availability) lines.push(profile.availability + '.');
        if (contact.email) lines.push('Email: ' + contact.email);
        (contact.links || []).forEach(function (l) { lines.push(l.label + ': ' + l.url); });
        return lines.length ? lines.join('\n') : 'No contact details are listed yet.';
    }

    function describeAbout(profile) {
        var lines = [profile.headline ? profile.name + ' - ' + profile.headline : profile.name];
        if (profile.location) lines.push('Based in ' + profile.location + '.');
        if (profile.bio) lines.push(profile.bio);
        return lines.join('\n');
    }

    function createResponder(profile) {
        var projects = profile.projects || [];
        var faqs = profile.faqs || [];
        var skills = profile.skills || {};
        var links = (profile.contact && profile.contact.links) || [];
        var name = profile.name;
        var decline = (profile.bot && profile.bot.declineMessage) ||
            "I can only answer questions about " + name + "'s work, tech stack, and how to get in touch. Try one of the suggested questions, or ask about a project by name.";

        // Words that signal each topic. Skill names and link labels come from the profile,
        // so asking "do you know React?" or "instagram?" works without any per-person code.
        var contactWords = ['contact', 'email', 'e mail', 'reach', 'hire', 'hiring', 'available', 'availability', 'opportunity', 'opportunities', 'talk']
            .concat(links.map(function (l) { return l.label; }));
        var stackWords = ['stack', 'tech', 'technology', 'technologies', 'skill', 'skills', 'language', 'languages', 'tools', 'framework', 'frameworks']
            .concat(skills.items || []);
        var projectWords = ['app', 'apps', 'project', 'projects', 'shipped', 'built', 'portfolio', 'work', 'website', 'websites'];
        var aboutWords = ['who', 'about', 'experience', 'years', 'background', 'introduce', 'yourself'];

        // Order matters: the first rule that matches wins, so more specific rules go first.
        return function respond(text) {
            var q = plain(text);

            // 1. A project named in the question
            for (var i = 0; i < projects.length; i++) {
                if (has(q, projects[i].name)) return describeProject(projects[i]);
            }
            // 2. Greetings
            if (/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b/i.test(text)) {
                return 'Hello! Ask me about ' + name + "'s work, tech stack, or how to get in touch.";
            }
            // 3. The person's own FAQs: exact question first (suggestion buttons), then keywords
            for (var j = 0; j < faqs.length; j++) {
                if (q === plain(faqs[j].q)) return faqs[j].a;
            }
            for (var k = 0; k < faqs.length; k++) {
                if (anyTerm(q, faqs[k].keywords || [])) return faqs[k].a;
            }
            // 4. Built-in topics
            if (anyTerm(q, contactWords)) return describeContact(profile);
            if (anyTerm(q, stackWords)) {
                if (skills.summary) return skills.summary;
                if (skills.items && skills.items.length) return 'Skills: ' + skills.items.join(', ') + '.';
            }
            if (projects.length && anyTerm(q, projectWords)) return listProjects(projects);
            if (anyTerm(q, aboutWords) || /what (does|do) \w+ do/i.test(text)) return describeAbout(profile);
            return decline;
        };
    }

    // Builds a full widget config. `overrides` wins over anything derived from the profile,
    // e.g. { position: { right: 24, bottom: 56 } } for site-specific layout.
    Chat.fromProfile = function (profile, overrides) {
        if (!profile || typeof profile.name !== 'string' || !profile.name) {
            throw new Error('profile.name is required');
        }
        var bot = profile.bot || {};
        var config = {
            title: bot.title || 'Ask about ' + profile.name,
            greeting: bot.greeting || "Hi! I'm a small assistant for this portfolio. Ask me about " + profile.name + ".",
            suggestions: bot.suggestions || [],
            respond: createResponder(profile)
        };
        Object.keys(overrides || {}).forEach(function (key) { config[key] = overrides[key]; });
        return config;
    };
})(window);
