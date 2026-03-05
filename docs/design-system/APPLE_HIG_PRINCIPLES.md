# Apple HIG Design Principles for PPM

Compact reference of Apple Human Interface Guidelines applied to PPM Platform web apps. Based on the full reference at `presentation-kit/docs/apple-hig-design-principles.md`.

## 4 Core Principles

### 1. Clarity (Helderheid)
- Text is readable at every size
- Icons are recognizable and precise
- Decoration is functional, never distracting
- Whitespace, color, and typography guide the user to the right action

**PPM application:** Use the typography scale consistently. Labels are always 10px uppercase with 0.05em letter-spacing. Values are 16-22px bold. Never use decorative elements.

### 2. Deference (Terughoudendheid)
- UI supports content, never replaces it
- Fluid motion gives context without distraction
- Translucent backgrounds and subtle layers add depth without dominating

**PPM application:** Cards use `rgba(0,0,0,0.02)` background, not solid white. Borders are subtle `rgba(0,0,0,0.06)`. Shadows are soft. Let the data speak.

### 3. Depth (Diepte)
- Visual layers and realistic motion communicate hierarchy
- Touch and discoverability enhance understanding
- Transitions give a spatial sense

**PPM application:** Profile dropdown uses `box-shadow: 0 4px 20px rgba(0,0,0,0.12)` for elevation. Sidebar items transition smoothly on hover. Active states have visible background change.

### 4. Consistency (Consistentie)
- Use standard UI components and familiar patterns
- Icons, text styles, and terminology are uniform throughout
- The app feels "at home" on the platform

**PPM application:** All 4 apps share the same topbar, sidebar, profile dropdown, dark mode, pills, and table patterns. Use `ui.js` for shell, use the same CSS class names.

## Color Usage

### Semantic Colors
| Color | Token | When to use |
|-------|-------|-------------|
| Green | `--success` | Positive values, completed, active, healthy |
| Orange | `--warning` | Attention needed, in-progress, medium priority |
| Red | `--error` | Negative values, critical, danger, errors |
| Blue | `--info` | Informational, links, neutral indicators |

### Opacity Hierarchy
Use opacity to create visual hierarchy, not different colors:
- **Primary content:** 100% opacity (`#1C1C1E`)
- **Secondary content:** 60% opacity (`rgba(0,0,0,0.6)`)
- **Tertiary/labels:** 40% opacity (`rgba(0,0,0,0.4)`)
- **Hints/placeholders:** 35% opacity (`rgba(0,0,0,0.35)`)

### Contrast Requirements (WCAG AA)
- Normal text (< 18px): 4.5:1 contrast ratio
- Large text (>= 18px bold): 3:1 contrast ratio
- All PPM tokens meet these thresholds

## Typography Hierarchy

### When to use which weight
| Weight | Use |
|--------|-----|
| 400 (Regular) | Body text, table cells, descriptions |
| 500 (Medium) | Buttons, sidebar items, table name cells |
| 600 (Semibold) | Active sidebar, table headers, card values, pills |
| 700 (Bold) | KPI values, section titles, primary headings |

### When to use which size
| Size | Use |
|------|-----|
| 22px | KPI hero values only |
| 18px | Section/view titles |
| 16px | Card detail values |
| 14px | Product name in topbar |
| 12-12.5px | Body text, sidebar items, table cells |
| 11px | Buttons, filters, alerts |
| 10px | Labels, table headers, pills, badges |

### Uppercase Rule
Only use `text-transform: uppercase` + `letter-spacing: 0.05em` for:
- KPI labels
- Table headers
- Card field labels (`.od-label`, `.kpi-label`)

Never uppercase body text, values, or interactive elements.

## Spacing: 8pt Grid

All spacing should be multiples of 4 or 8:

| Multiplier | Value | Use |
|-----------|-------|-----|
| 1x | 4px | Micro gaps |
| 1.5x | 6px | Compact spacing |
| 2x | 8px | Standard small |
| 2.5x | 10px | Cell padding |
| 3x | 12px | Grid gaps, medium padding |
| 4x | 16px | Section padding |
| 5x | 20px | Main area padding |

## Interaction Patterns

### Hover States
- Background: add `rgba(0,0,0,0.04)` (light) / `rgba(255,255,255,0.06)` (dark)
- Text: increase opacity from 0.4 to 0.7
- Transition: `all 0.15s` or `background 0.15s`
- Cursor: `pointer` on all clickable elements

### Active States
- Background: `rgba(22,31,69,0.08)` (light) / `rgba(204,183,158,0.1)` (dark)
- Text: full color `#161F45` (light) / `var(--accent)` (dark)
- Font-weight: increase to 600

### Transitions
- Standard: `all 0.15s`
- Table rows: `background 0.1s`
- Progress/charts: `0.4-0.6s ease`
- Never use transitions longer than 0.6s

## Dark Mode Principles

### What changes
- Backgrounds: light grays become deep navy blues
- Text: dark text becomes white/light
- Borders: black alpha becomes white alpha (same opacity)
- Active accent: `--primary` becomes `--accent`

### What stays the same
- Semantic colors (green/orange/red/blue) don't change
- Font sizes and weights don't change
- Spacing doesn't change
- Border radius doesn't change
- Layout doesn't change

### Implementation Checklist
For every new component:
1. Define light mode styles with opacity-based colors
2. Add `.xxx-dashboard.dark-mode` overrides
3. Swap background/text/border using the mapping in TOKENS.md
4. Test both modes before committing

## Do's and Don'ts

### Do
- Use the existing PPM component patterns (pills, KPIs, tables, cards)
- Follow the opacity hierarchy for text
- Use `rgba()` for backgrounds, borders, and overlays
- Keep transitions subtle (0.15s max for interactive)
- Use Ionicons outline variants for consistency
- Match the 8pt spacing grid

### Don't
- Invent new color tokens — use the existing ones
- Use solid backgrounds for cards (use `rgba(0,0,0,0.02)`)
- Use heavy shadows — PPM uses flat design with subtle borders
- Use different fonts or font weights outside the scale
- Hard-code colors — always use CSS variables or `rgba()`
- Skip dark mode overrides for new components
