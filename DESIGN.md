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

- **Sentry:** Aligned because issue triage depends on stable project context, grouped failures, and stack evidence.
- **Airtable:** Aligned because dense rows need strong key lines, predictable columns, and fast filtering.
- **Miro:** Contrast because freeform spatial composition would weaken scanning and issue comparison.
- **Langfuse:** Product reference for self-hosted observability and agent-readable operational data, not a visual template.

## Thesis

Error Mom feels like a calm incident desk: warm paper surfaces, ink-forward typography, a single coral incident accent, and a left project rail that keeps scope visible. The memorable device is the issue pulse, a narrow severity rail tied directly to issue state rather than decoration.

First glance shows open quantity and the ordered issue queue. Second glance exposes release, environment, first/last seen, and culprit. The primary action is opening an issue; resolution appears only inside issue detail.

## Tokens and craft

- **Type:** Manrope for interface hierarchy; IBM Plex Mono for fingerprints, releases, timestamps, and stack traces.
- **Color:** Warm neutral canvas and surfaces; coral for open/regressed incidents; green for resolved; blue for focus and links.
- **Geometry:** 4px base rhythm, 44px controls, 12px surface radius, 1px separators, shared 24px content insets.
- **Motion:** 160ms color/border transitions only. No hover translation. Reduced motion removes non-essential interpolation.
- **Icons:** Lucide only, with visible labels for unfamiliar actions.
- **Responsive:** Desktop keeps project rail and issue table. Narrow layouts turn the rail into a horizontal project scope list and each table row into a labeled issue block.

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

Final login captures: 1440×960 desktop, 390×844 mobile, and invalid-token recovery. The requested decorative hero logo, supporting paragraph, bullets, and panel subheading were removed; the remaining hero stays at two lines on both captured viewports.

- **Score: 22/24.** Brief specificity 2, hierarchy 2, composition 2, consistency 2, typography 2, material logic 2, state completeness 2, responsive behavior 2, accessibility 1, motion 2, authenticity 2, distinctiveness 1.
- **Verified:** Desktop/mobile rendering, two-line hero, 44px controls, native form labels, visible error recovery, responsive reflow, reduced-motion CSS, forced-colors CSS, source-level landmarks, production build, and TypeScript checks.
- **Unverified:** Automated accessibility scan, keyboard-only traversal, 200% zoom, and rendered dashboard data states. Local PostgreSQL integration could not run because Docker was unavailable; CI runs the integration test against PostgreSQL 17.
- **Weakest revision:** Accessibility/state feedback was improved by preserving the entered token, rendering a live error message, retaining visible labels, and keeping the primary action in the first mobile viewport.
