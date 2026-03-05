# PPM Design Tokens

## CSS Custom Properties

Source: `styles/tokens.css` (shared across all 4 platforms via sync-shared.sh)

```css
:root {
  --primary: #161F45;
  --accent: #CCB79E;
  --success: #34C759;
  --warning: #FF9500;
  --error: #FF3B30;
  --info: #3B82F6;
  --bg: #F5F5F4;
  --surface: #FFFFFF;
  --text: #1C1C1E;
  --text-secondary: rgba(0,0,0,0.6);
  --text-tertiary: rgba(0,0,0,0.4);
  --border: rgba(0,0,0,0.06);
  --border-strong: rgba(0,0,0,0.08);
}
```

## Dark Mode Color Mapping

Root element gets `.dark-mode` class. All dark mode overrides use platform-specific selectors like `.asset-dashboard.dark-mode`.

### Background Surfaces

| Light | Dark | Context |
|-------|------|---------|
| `#FAFAFA` | `#0D1332` | Topbar |
| `#F5F5F4` | `#0A0F28` | Sidebar |
| `#FFFFFF` | `#111638` | Main content area |
| `rgba(0,0,0,0.02)` | `rgba(255,255,255,0.04)` | Cards, KPIs |

### Text

| Light | Dark | Context |
|-------|------|---------|
| `#1C1C1E` | `#FFF` | Primary text, titles |
| `rgba(0,0,0,0.6)` | `rgba(255,255,255,0.7)` | Secondary text, table cells |
| `rgba(0,0,0,0.4)` | `rgba(255,255,255,0.35)` | Labels, tertiary text |
| `rgba(0,0,0,0.45)` | `rgba(255,255,255,0.4)` | Button/icon default |
| `rgba(0,0,0,0.7)` | `rgba(255,255,255,0.7)` | Button/icon hover |
| `rgba(0,0,0,0.35)` | `rgba(255,255,255,0.3)` | Table headers |

### Borders

| Light | Dark |
|-------|------|
| `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.04)` |
| `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.06)` |
| `rgba(0,0,0,0.08)` | `rgba(255,255,255,0.08)` |

### Interactive States

| Light | Dark | Context |
|-------|------|---------|
| `rgba(0,0,0,0.04)` | `rgba(255,255,255,0.06)` | Hover background |
| `rgba(22,31,69,0.08)` | `rgba(204,183,158,0.1)` | Active background |
| `var(--primary)` | `var(--accent)` | Active text/icon color |
| `rgba(22,31,69,0.2)` | `rgba(204,183,158,0.3)` | Active border |

### Semantic Colors (same in light/dark)

| Token | Value | Use |
|-------|-------|-----|
| `--success` | `#34C759` | Positive, confirmed |
| `--warning` | `#FF9500` | Caution |
| `--error` | `#FF3B30` | Danger, negative |
| `--info` | `#3B82F6` | Informational |

## Typography

**Font:** Inter via Google Fonts
**Weights:** 400 (body), 500 (medium), 600 (semibold), 700 (bold)
**Fallback:** `'Inter', -apple-system, BlinkMacSystemFont, sans-serif`

### Scale

| Size | Weight | Use |
|------|--------|-----|
| 22px | 700 | KPI values |
| 18px | 700 | Section titles |
| 16px | 600 | Card values |
| 14px | 300-500 | Product name, body |
| 12.5px | 500-600 | Sidebar items |
| 12px | 400-500 | Table cells, dropdown items |
| 11px | 500-600 | Buttons, filters, alerts |
| 10px | 600 | Labels (uppercase, letter-spacing: 0.05em), table headers, pills |

## Spacing Scale

| Value | Use |
|-------|-----|
| 4px | Small gaps |
| 6px | Compact spacing, dropdown item gap |
| 8px | Standard padding |
| 10px | Card/cell padding |
| 12px | Medium padding, grid gaps |
| 14px | Large card padding |
| 16px | Section padding, sidebar padding |
| 20px | Topbar/main padding |

## Border Radius

| Value | Use |
|-------|-----|
| 6px | Pills, small buttons |
| 8px | Alerts, filters, inputs, topbar buttons |
| 10px | Cards, sidebar items, detail cards |
| 12px | KPI cards |

## Shadows

| Use | Value |
|-----|-------|
| Dropdown | `0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)` |
| Dropdown (dark) | `0 4px 20px rgba(0,0,0,0.3)` |

## Transitions

| Pattern | Use |
|---------|-----|
| `all 0.15s` | Buttons, interactive elements |
| `background 0.15s, color 0.15s` | Sidebar items |
| `background 0.1s` | Table rows |
| `width 0.4s ease` | Progress bars |
