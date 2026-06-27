# Knowledge Desk High-Fidelity Frontend Spec

## Product Frame

Knowledge Desk is a desktop-first personal knowledge workbench for collecting, organizing, retrieving, and revisiting long-lived learning material. It is not led by chat. The primary loop is: collect sources, route them through Inbox, enrich them with AI metadata, browse or search the Library, and revisit detail pages with source context intact.

## Visual Direction

The chosen direction is modern editorial workbench. The interface uses a light paper-like base, quiet panels, restrained sage green, deep teal gray, and low-saturation copper accents. Headings use an editorial serif, while operational text uses a readable sans serif. The layout should feel like a personal research desk and archive, not a SaaS admin console.

## Core Pages

1. Dashboard: daily overview with today additions, completed items, pending Inbox, high-frequency tags, recent visits, and a clear global search entry.
2. Inbox: import and excerpt staging area with pending, processing, completed, and retry states. It emphasizes the transition from raw material to ordered knowledge.
3. Library: recoverability-first browsing with filters for source, tag, time, and document type. It supports list and card views.
4. Detail: reading-centered page with source content in the main column and AI summary, tags, topic classification, source metadata, and related items in the context rail.
5. Search: standalone search page with prominent search input, filters, result snippets, source metadata, summaries, and no-result state.
6. Settings: low-frequency system space entered from the sidebar bottom. It includes Profile, Models, AI Preferences, Privacy, and Integrations.

## Design System

Colors:
- Background: `#f6f3ec`
- Paper surface: `#fffdf8`
- Panel: `#ffffff`
- Border: `#ded6c8`
- Text: `#2d302d`
- Muted text: `#74766f`
- Sage: `#5f7f70`
- Deep teal: `#365b5d`
- Copper: `#a97751`

Typography:
- Heading: `Newsreader`
- Body: `Source Sans 3`
- Mono: platform monospace for API keys and base URLs

Components:
- Sidebar navigation, command search, import actions, metric cards, item rows, filter rail, status pills, tag pills, context rail, settings secondary navigation, model provider cards, toggles, segmented controls, retry and empty states.

## Delivery

Static prototype:
- `/Users/liuyongze/Documents/AI-agent/knowledge-desk/pages/dashboard.html`
- `/Users/liuyongze/Documents/AI-agent/knowledge-desk/pages/inbox.html`
- `/Users/liuyongze/Documents/AI-agent/knowledge-desk/pages/library.html`
- `/Users/liuyongze/Documents/AI-agent/knowledge-desk/pages/detail.html`
- `/Users/liuyongze/Documents/AI-agent/knowledge-desk/pages/search.html`
- `/Users/liuyongze/Documents/AI-agent/knowledge-desk/pages/settings.html`

React mapping:
- `/Users/liuyongze/Documents/AI-agent/desktop/src/renderer/src/knowledge-desk/KnowledgeDeskApp.tsx`
- `/Users/liuyongze/Documents/AI-agent/desktop/src/renderer/src/knowledge-desk/knowledge-desk.css`
