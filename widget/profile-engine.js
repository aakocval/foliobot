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

    // A profile is hand-written JSON that only an editor checks against the schema, so the
    // engine tolerates wrong shapes (a string where an array belongs, a missing name) by
    // ignoring them instead of throwing in the middle of a chat.
    function list(value) { return Array.isArray(value) ? value : []; }
    function isText(value) { return typeof value === 'string' && value.trim() !== ''; }
    function objectOrEmpty(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

    // Skills of one or two letters (C, R, Go, C#) are also ordinary words or letters, so a
    // case-insensitive match would fire on "where did you go to school". They only count when
    // typed exactly as written in the profile ("Go", "C++"), as a standalone token.
    function isShortSkill(skill) { return skill.replace(/[^A-Za-z0-9]/g, '').length <= 2; }

    function mentionsSkill(text, skills) {
        return skills.some(function (skill) {
            var escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp('(^|[^A-Za-z0-9+#])' + escaped + '(?![A-Za-z0-9+#])').test(text);
        });
    }

    function describeProject(p) {
        var stats = list(p.stats);
        var stack = list(p.stack);
        var lines = [p.description ? p.name + ' - ' + p.description : p.name];
        if (stats.length) lines.push(stats.join(' · '));
        if (p.role) lines.push('Role: ' + p.role);
        lines.push(stack.length ? 'Stack: ' + stack.join(', ') : "I don't have stack details listed for this one yet.");
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

    function describeContact(profile, contact, links) {
        var lines = [];
        if (profile.availability) lines.push(profile.availability + '.');
        if (contact.email) lines.push('Email: ' + contact.email);
        links.forEach(function (l) { lines.push(l.label + ': ' + l.url); });
        return lines.length ? lines.join('\n') : 'No contact details are listed yet.';
    }

    function describeAbout(profile) {
        var lines = [profile.headline ? profile.name + ' - ' + profile.headline : profile.name];
        if (profile.location) lines.push('Based in ' + profile.location + '.');
        if (profile.bio) lines.push(profile.bio);
        return lines.join('\n');
    }

    function createResponder(profile) {
        var projects = list(profile.projects).filter(function (p) { return p && isText(p.name); });
        var faqs = list(profile.faqs).filter(function (f) { return f && isText(f.q) && typeof f.a === 'string'; });
        var skills = objectOrEmpty(profile.skills);
        var skillItems = list(skills.items).filter(isText);
        var contact = objectOrEmpty(profile.contact);
        var links = list(contact.links).filter(function (l) { return l && isText(l.label) && isText(l.url); });
        var name = profile.name;
        var decline = objectOrEmpty(profile.bot).declineMessage ||
            "I can only answer questions about " + name + "'s work, tech stack, and how to get in touch. Try one of the suggested questions, or ask about a project by name.";

        // Words that signal each topic. Skill names and link labels come from the profile,
        // so asking "do you know React?" or "instagram?" works without any per-person code.
        var contactWords = ['contact', 'email', 'e mail', 'reach', 'hire', 'hiring', 'available', 'availability', 'opportunity', 'opportunities', 'talk to']
            .concat(links.map(function (l) { return l.label; }));
        var stackWords = ['stack', 'tech', 'technology', 'technologies', 'skill', 'skills', 'language', 'languages', 'tools', 'framework', 'frameworks']
            .concat(skillItems.filter(function (s) { return !isShortSkill(s); }));
        var shortSkills = skillItems.filter(isShortSkill);
        var projectWords = ['app', 'apps', 'project', 'projects', 'shipped', 'built', 'portfolio', 'work', 'website', 'websites'];
        var aboutWords = ['who', 'about', 'experience', 'years', 'background', 'introduce', 'yourself'];

        // Order matters: the first rule that matches wins, so more specific rules go first.
        return function respond(text) {
            var q = plain(text);

            // 1. A project named in the question
            for (var i = 0; i < projects.length; i++) {
                if (has(q, projects[i].name)) return describeProject(projects[i]);
            }
            // 2. The person's own FAQs: exact question first (suggestion buttons), then keywords
            for (var j = 0; j < faqs.length; j++) {
                if (q === plain(faqs[j].q)) return faqs[j].a;
            }
            for (var k = 0; k < faqs.length; k++) {
                if (anyTerm(q, list(faqs[k].keywords).filter(isText))) return faqs[k].a;
            }
            // 3. Built-in topics
            if (anyTerm(q, contactWords)) return describeContact(profile, contact, links);
            if (anyTerm(q, stackWords) || mentionsSkill(text, shortSkills)) {
                if (isText(skills.summary)) return skills.summary;
                if (skillItems.length) return 'Skills: ' + skillItems.join(', ') + '.';
            }
            // "where do you work" asks about the person, not about their portfolio, so it must
            // be caught before the generic "work" keyword sends it to the project list.
            var asksEmployer = /where (do|does|did) \w+ work|who (do|does|did) \w+ work for/i.test(text);
            if (!asksEmployer && projects.length && anyTerm(q, projectWords)) return listProjects(projects);
            if (asksEmployer || anyTerm(q, aboutWords) || /what (does|do) \w+ do/i.test(text)) return describeAbout(profile);
            // 4. Greetings come last, so "Hi, what projects have you built?" gets the real answer
            // and only a bare greeting gets the hello.
            if (/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening))\b/i.test(text)) {
                return 'Hello! Ask me about ' + name + "'s work, tech stack, or how to get in touch.";
            }
            return decline;
        };
    }

    // Builds a full widget config. `overrides` wins over anything derived from the profile,
    // e.g. { position: { right: 24, bottom: 56 } } for site-specific layout.
    Chat.fromProfile = function (profile, overrides) {
        if (!profile || typeof profile.name !== 'string' || !profile.name) {
            throw new Error('profile.name is required');
        }
        var bot = objectOrEmpty(profile.bot);
        var config = {
            title: bot.title || 'Ask about ' + profile.name,
            // An explicit "" means "no greeting", so only a missing greeting gets the default.
            greeting: typeof bot.greeting === 'string' ? bot.greeting : "Hi! I'm a small assistant for this portfolio. Ask me about " + profile.name + ".",
            suggestions: list(bot.suggestions).filter(isText),
            respond: createResponder(profile)
        };
        Object.keys(overrides || {}).forEach(function (key) { config[key] = overrides[key]; });
        return config;
    };
})(window);
