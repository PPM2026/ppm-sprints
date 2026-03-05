# PPM Component Patterns

HTML + CSS patterns for all shared PPM components. Use these when building new views or components.

## App Shell (ui.js)

```
.xxx-dashboard         ← Root (grid: topbar 48px | sidebar 240px + main)
  .xxx-topbar          ← Fixed top bar
    .topbar-brand      ← PPM + platform name
    .topbar-actions    ← Profile + dark mode buttons
    .profile-dropdown  ← Hidden until .active
  .xxx-sidebar         ← Left sidebar
    .side-item         ← Nav items (.active, .back states)
  .xxx-main            ← Scrollable content
```

Layout grid:
```css
.xxx-dashboard {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 48px 1fr;
  height: 100vh;
}
.xxx-topbar { grid-column: 1 / -1; }
```

## Topbar

```html
<div class="xxx-topbar">
  <div class="topbar-brand">
    <span class="topbar-ppm">PPM</span>
    <span class="topbar-product">Naam</span>
  </div>
  <div class="topbar-actions">
    <span class="topbar-btn" id="btn-export">...</span>
    <span class="topbar-btn" id="btn-profile">...</span>
    <span class="topbar-btn" id="btn-darkmode">...</span>
  </div>
</div>
```

Key styles:
```css
.xxx-topbar {
  background: #FAFAFA;
  border-bottom: 1px solid rgba(0,0,0,0.08);
  padding: 0 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.topbar-ppm { font-size: 16px; font-weight: 800; color: var(--primary); }
.topbar-product { font-size: 14px; font-weight: 300; color: var(--accent); }
.topbar-btn {
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(0,0,0,0.45);
  border: 1px solid rgba(0,0,0,0.06);
  transition: all 0.15s;
}
.topbar-btn:hover {
  background: rgba(0,0,0,0.04);
  color: rgba(0,0,0,0.7);
}
```

## Sidebar

```html
<div class="xxx-sidebar" id="xxx-sidebar">
  <div class="side-item active" data-view="dashboard">
    <ion-icon name="grid-outline"></ion-icon>Dashboard
  </div>
  <div class="side-item" data-view="objects">
    <ion-icon name="business-outline"></ion-icon>Objecten
  </div>
</div>
```

Key styles:
```css
.xxx-sidebar {
  background: #F5F5F4;
  padding: 16px 12px;
  border-right: 1px solid rgba(0,0,0,0.06);
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-y: auto;
}
.side-item {
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 500;
  color: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.side-item:hover { background: rgba(0,0,0,0.04); color: rgba(0,0,0,0.7); }
.side-item.active { background: rgba(22,31,69,0.08); color: #161F45; font-weight: 600; }
.side-item.back { font-size: 11px; }
.side-item ion-icon { font-size: 16px; }
```

## KPI Cards

```html
<div class="kpi-row">
  <div class="asset-kpi">
    <div class="kpi-label">LABEL</div>
    <div class="kpi-value">42</div>
    <div class="kpi-change up">+2.3%</div>
  </div>
</div>
```

```css
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.asset-kpi {
  background: rgba(0,0,0,0.02);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 12px;
  padding: 14px 14px 12px;
}
.kpi-label {
  font-size: 10px; color: rgba(0,0,0,0.4);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.kpi-value { font-size: 22px; font-weight: 700; color: #1C1C1E; margin-top: 4px; }
.kpi-change { font-size: 10px; margin-top: 2px; }
.kpi-change.up { color: var(--success); }
.kpi-change.down { color: var(--error); }
```

## Tables

```html
<table class="asset-table">
  <thead><tr><th>Naam</th><th>Waarde</th></tr></thead>
  <tbody>
    <tr><td class="asset-name">Item</td><td>42</td></tr>
  </tbody>
</table>
```

```css
.asset-table { width: 100%; border-collapse: collapse; }
.asset-table th {
  font-size: 10px; font-weight: 600; color: rgba(0,0,0,0.35);
  text-transform: uppercase; letter-spacing: 0.05em;
  padding: 8px 10px; border-bottom: 1px solid rgba(0,0,0,0.08);
  text-align: left;
}
.asset-table td {
  font-size: 12px; color: rgba(0,0,0,0.6);
  padding: 9px 10px; border-bottom: 1px solid rgba(0,0,0,0.04);
}
.asset-table tbody tr { cursor: pointer; transition: background 0.1s; }
.asset-table tr:hover td { background: rgba(0,0,0,0.02); }
.asset-name { color: #1C1C1E; font-weight: 500; }
```

## Pills & Badges

```html
<span class="pill-sm green">Actief</span>
<span class="pill-sm orange">In behandeling</span>
<span class="pill-sm red">Kritiek</span>
<span class="pill-sm blue">Info</span>
<span class="pill-sm gray">Gesloten</span>
```

```css
.pill-sm {
  padding: 2px 8px; border-radius: 6px;
  font-size: 10px; font-weight: 600;
  display: inline-block;
}
.pill-sm.green  { background: rgba(52,199,89,0.12); color: #1B7D3A; }
.pill-sm.orange { background: rgba(255,149,0,0.12); color: #B36B00; }
.pill-sm.red    { background: rgba(255,59,48,0.12); color: #C9302C; }
.pill-sm.blue   { background: rgba(59,130,246,0.12); color: #2563EB; }
.pill-sm.gray   { background: rgba(0,0,0,0.05); color: rgba(0,0,0,0.45); }
```

## Filter Pills

```html
<div class="pf-pills">
  <span class="pf-pill active" data-filter="all">Alles</span>
  <span class="pf-pill" data-filter="type-a">Type A</span>
</div>
```

```css
.pf-pill {
  padding: 4px 12px; border-radius: 8px;
  font-size: 11px; font-weight: 600;
  background: rgba(0,0,0,0.03); color: rgba(0,0,0,0.4);
  border: 1px solid rgba(0,0,0,0.06);
  cursor: pointer; transition: all 0.15s;
}
.pf-pill:hover { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.7); }
.pf-pill.active {
  background: rgba(22,31,69,0.08); color: #161F45;
  border-color: rgba(22,31,69,0.2); font-weight: 700;
}
```

## Detail Cards

```html
<div class="od-grid">
  <div class="od-card">
    <div class="od-label">LABEL</div>
    <div class="od-value">Value</div>
  </div>
</div>
```

```css
.od-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.od-card {
  background: rgba(0,0,0,0.02); border-radius: 10px;
  padding: 12px 14px; border: 1px solid rgba(0,0,0,0.06);
}
.od-label {
  font-size: 10px; color: rgba(0,0,0,0.4);
  text-transform: uppercase; letter-spacing: 0.05em;
}
.od-value { font-size: 16px; font-weight: 600; color: #1C1C1E; margin-top: 3px; }
```

## Alerts

```html
<div class="cr-alert warn"><ion-icon name="alert-circle"></ion-icon> Waarschuwing</div>
<div class="cr-alert info"><ion-icon name="information-circle"></ion-icon> Info</div>
<div class="cr-alert ok"><ion-icon name="checkmark-circle"></ion-icon> OK</div>
```

```css
.cr-alert {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 8px;
  font-size: 11px; font-weight: 500;
}
.cr-alert ion-icon { font-size: 14px; }
.cr-alert.warn { background: rgba(255,149,0,0.1); color: #B36B00; border: 1px solid rgba(255,149,0,0.15); }
.cr-alert.info { background: rgba(59,130,246,0.08); color: #2563EB; border: 1px solid rgba(59,130,246,0.12); }
.cr-alert.ok { background: rgba(52,199,89,0.08); color: #1B7D3A; border: 1px solid rgba(52,199,89,0.12); }
```

## Profile Dropdown

```html
<div class="profile-dropdown" id="profile-dropdown">
  <div class="dd-item" id="dd-profile"><ion-icon name="person-circle-outline"></ion-icon> Profiel</div>
  <div class="dd-item" id="dd-settings"><ion-icon name="settings-outline"></ion-icon> Instellingen</div>
  <div class="dd-item danger" id="dd-logout"><ion-icon name="log-out-outline"></ion-icon> Uitloggen</div>
</div>
```

```css
.profile-dropdown {
  position: absolute; top: 44px; right: 20px; z-index: 100;
  background: #FFF; border-radius: 10px; padding: 6px; min-width: 160px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06);
  display: none;
}
.profile-dropdown.active { display: block; }
.dd-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 6px;
  font-size: 12px; color: rgba(0,0,0,0.6); cursor: pointer;
}
.dd-item:hover { background: rgba(0,0,0,0.04); color: var(--text); }
.dd-item.danger { color: var(--error); }
.dd-item ion-icon { font-size: 16px; }
```

## Section Headers

```html
<div class="main-title">Titel</div>
<div class="main-subtitle">Beschrijving</div>
```

```css
.main-title { font-size: 18px; font-weight: 700; color: #1C1C1E; }
.main-subtitle { font-size: 12px; color: rgba(0,0,0,0.4); margin-top: 2px; }
```
