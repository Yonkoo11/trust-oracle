# Design Research Brief

## Product Category
Autonomous agent monitoring dashboard / x402 endpoint reliability oracle

## Comparables Studied
1. BetterStack (status pages, uptime monitoring)
2. Instatus (modern status page builder)
3. L2Beat (blockchain infrastructure monitoring with scores)
4. x402station.com (direct competitor -- x402 endpoint monitoring)

## Common Patterns (table stakes)
- Status color convention: green=up, amber=degraded, red=down, gray=unknown
- Large numerical scores for at-a-glance assessment
- Uptime bars or calendar grids for historical visualization
- Monospace font for technical data (URLs, addresses, timestamps)
- Card-based layout over dense tables
- Live badge showing connection/update status
- Responsive: 1-col mobile, multi-col desktop

## Differentiation Opportunities
- **Agent identity as a first-class section.** No competitor shows on-chain identity. This is unique to ERC-8004 and should be prominent.
- **Execution log transparency.** No status page shows the internal decision-making of the monitoring system itself. Our agent_log.json is a differentiator.
- **Budget/guardrails visibility.** Showing the agent's compute budget in real-time is novel.

## Design Constraints
- Single HTML file (no build system, vanilla JS)
- Dark mode only (agent/developer audience)
- Must work in demo video (font sizes must be visible at 720p)
- Real-time data refresh (30s interval)
- Must clearly communicate "autonomous agent" not "monitoring service"

## Anti-Patterns (must avoid)
- 11px text anywhere (current dashboard's biggest problem)
- Generic SaaS dashboard aesthetic
- Purple-blue AI gradients
- Overloaded information density without hierarchy
- Card grids that all look the same

## Typography Fix (Critical)
Current dashboard: 20 occurrences of 11px. Minimum allowed: 12px (badges/captions only). Target minimum for body/labels: 14px. All mono text: 13px minimum.

Type scale to enforce:
- 12px: badges, captions ONLY
- 14px: secondary labels, metadata, timestamps
- 16px: body text, primary labels
- 20px: section titles, card titles
- 28-32px: key metrics, scores
- 36-48px: hero, agent ID

## Stolen Elements (adopt and adapt)
- From BetterStack: clean uptime calendar grid pattern
- From L2Beat: stage/score badges with sentiment colors
- From x402station: live counters in header area, glass-morphism nav
- From Instatus: expandable service rows (progressive disclosure)
