# Error Mom design system

## Design read

- **Surface:** A data-dense operations dashboard with a secondary developer-tool role.
- **Audience:** Developers and coding agents triaging production failures across several apps.
- **Single job:** Find the highest-impact unresolved issue and retrieve enough evidence to fix it.
- **Task and risk:** Frequent scanning, high information density, and costly false resolution. Status, project, release, quantity, and recency must remain visible.
- **Content:** Real project and issue data from PostgreSQL. Empty states are explicit; illustrative production metrics are never invented.
- **Platform:** Responsive web from 320px upward, keyboard and pointer input, current evergreen browsers, Railway deployment.
- **Constraints:** Self-hosted, one instance for many projects, secrets must never render after initial project creation.

## Evidence

- **System.css:** User-selected primary visual source. Its classic Macintosh windows, Chicago/Geneva typography, monochrome palette, striped title bars, hard borders, checkerboard desktop, native controls, and offset shadows define the app-wide material system.
- **Sentry:** Structural alignment only: stable project context, grouped failures, and stack evidence remain visible inside the new Macintosh treatment.
- **Airtable:** Structural alignment only: dense rows keep predictable columns and fast filtering.
- **Miro:** Contrast because freeform spatial composition would weaken incident scanning and does not fit System.css window conventions.

## Thesis

Error Mom is a classic Macintosh incident workstation. Every route is a black-and-white System.css window on a checkerboard desktop; striped title bars, hard two-pixel borders, offset shadows, Chicago controls, and crisp monospace evidence replace the previous warm SaaS styling.

First glance shows the ordered issue queue and occurrence totals. Second glance exposes project, status, quantity, recency, releases, and stack evidence. Project selection stays in one compact control; issue opening remains the primary action.

## Tokens and craft

- **Type:** System.css Chicago/Chicago_12 for interface and hierarchy; native SF Mono/Menlo/Consolas for legible fingerprints, releases, timestamps, and stack traces. The interface uses an 18px minimum for bitmap UI text, with dense technical text at 16–17px.
- **Color:** Strict white, black, and functional grays. State remains understandable through labels, icons, borders, fill, and hatch patterns rather than color alone.
- **Geometry:** Square corners, two-pixel borders, double rules, 22px checkerboard desktop rhythm, and 2–3px offset shadows.
- **Motion:** 80ms stepped color/shadow feedback only. No hover translation; reduced motion removes non-essential interpolation.
- **Controls:** System.css is imported from `@sakun/system.css`; local overrides adapt its buttons, inputs, selects, scrollbars, title bars, dialogs, and fonts to Error Mom components.
- **Icons:** Lucide remains only for functional labels already present; the select uses System.css's native asset and Error Mom has no decorative logo.
- **Responsive:** Desktop keeps a sidebar and issue table inside one Macintosh window. Narrow layouts stack project controls and turn table rows into bordered labeled records without losing selected scope.

## Core states

- Authentication: idle, submitting, invalid token, server failure.
- Projects: loading through server rendering, empty, create pending, created with one-time key, create failure.
- Issues: open/regressed/resolved filters, empty filter, long title/culprit, detail missing.
- Resolution: pending, success redirect, validation failure, request failure.
- API: structured JSON errors with status codes; agent endpoints default to unresolved issues.

## Production checks

- Native landmarks, headings, links, buttons, forms, labels, and table semantics.
- Visible focus, 44px primary targets, status text paired with color, and live regions for async forms.
- Layout reflows at 320px and text remains readable at 200% zoom.
- No secrets in URLs, issue summaries, screenshots, or retained breadcrumbs after redaction.
- Deep links and browser navigation remain stable for project filters and issue details.
- Performance target: server-rendered issue list with no dashboard hydration except forms.

## Rendered review

System.css captures cover the login window, seeded dashboard, issue detail, desktop 1440×960, and mobile 390×844. The two-line hero, project dropdown, modal workflow, grouped fixtures, and renamed Reopened state remain intact.

- **Score: 22/24.** Brief specificity 2, hierarchy 2, composition 2, consistency 2, typography 2, material logic 2, state completeness 2, responsive behavior 2, accessibility 1, motion 2, authenticity 2, distinctiveness 1.
- **Verified:** Desktop/mobile rendering, login, dashboard, detail evidence, responsive card reflow, visible labels, monochrome state differentiation, reduced-motion CSS, forced-colors CSS, production build, TypeScript checks, and PostgreSQL-backed seeded data.
- **Unverified:** Automated accessibility scan, keyboard-only traversal, and 200% zoom.
- **Weakest revision:** The bundled bitmap Monaco had a very small visual x-height. Technical text now uses a native monospace stack, and dashboard/card spacing was widened so larger text stays readable without collisions.
