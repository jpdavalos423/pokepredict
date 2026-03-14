# PokePredict Theme Spec v1

## Purpose
This document defines the visual theme, design principles, and implementation rules for the PokePredict frontend. It is intended to be used by both human developers and coding agents (including Codex) so that UI work stays visually consistent across pages and components.

## Product Positioning
PokePredict should feel like a **trustworthy market dashboard first** and a **Pokémon collector product second**.

The UI should be:
- premium
- minimal
- analytical
- dark-first
- slightly playful through accents only

The app should not feel childish, noisy, over-gamified, or overly corporate.

### Core brand message
**This is a serious but accessible decision-support tool for Pokémon collectors.**

## Theme Summary
**PokePredict v1 should feel like a premium dark market dashboard for Pokémon collectors: clean, trustworthy, chart-first, and subtly infused with collector identity.**

## Design Principles
When visual decisions are unclear, use these rules:

1. **Trust over spectacle**
2. **Data clarity over decoration**
3. **Dark premium surfaces over flat generic black**
4. **Pokémon flavor through accents, not gimmicks**
5. **Charts and pricing data should command attention**
6. **Every page should feel calm, high-signal, and decision-focused**

## Visual Direction
The interface should use a **dark premium dashboard look** with:
- deep black / charcoal surfaces
- restrained contrast
- subtle glassy elevation
- clean card layouts
- clean charts
- Pokémon-inspired accent colors used sparingly

### Priority of visual emphasis
1. pricing and trends
2. charts and signals
3. portfolio / alert actions
4. supporting metadata
5. collectible flavor through small accents and imagery

## Color System

### Usage rule
The interface should stay roughly **85–90% neutral** and **10–15% accent**.

### Base neutrals
Use these as the primary design tokens for dark mode:

- `bg-app`: `#0A0A0B`
- `bg-surface-1`: `#111214`
- `bg-surface-2`: `#16181C`
- `bg-surface-3`: `rgba(255,255,255,0.04)`
- `border-subtle`: `rgba(255,255,255,0.08)`
- `border-strong`: `rgba(255,255,255,0.14)`
- `text-primary`: `#F5F7FA`
- `text-secondary`: `#B4BCC8`
- `text-muted`: `#7E8794`

### Accent colors
Use accents sparingly and with clear purpose:

- `accent-primary`: `#5DA8FF` (main interactive / brand accent)
- `accent-yellow`: `#F6C945` (rare highlights, premium details)
- `accent-success`: `#34C77B` (positive trend)
- `accent-danger`: `#F05D5E` (negative trend)
- `accent-signal`: `#8B7CFF` (signal / predictive states)

### Recommended usage
- Blue is the default interactive accent.
- Yellow is reserved for important highlights, featured states, or premium collector cues.
- Green and red are reserved for semantic financial movement or success/error contexts.
- Violet is reserved for signal, prediction, or model-related cues.

### Background and surface guidance
- Main page background should be `bg-app`.
- Standard cards should use `bg-surface-1` or a glass-tinted equivalent.
- Elevated surfaces can use `bg-surface-2` or a translucent overlay.
- Avoid large bright gradients in backgrounds.

## Mode Support
For v1, support **dark mode only**.

Do not spend implementation time on light mode in v1.

## Typography

### Font family
- Primary UI font: **Inter**

Use Inter for all body and interface text in v1.

### Typography goals
Typography should feel:
- clean
- product-grade
- modern
- dense enough for dashboards
- never decorative

### Suggested type scale
- Page title: `28–32px`, `600`
- Section title: `18–20px`, `600`
- Card title: `15–16px`, `500–600`
- Body: `14–15px`, `400`
- Supporting / metadata text: `12–13px`, `400–500`
- Numeric highlights: `20–28px`, `600`

### Numeric styling
For prices, changes, percentages, and counts:
- use semibold emphasis
- keep alignment clean
- prefer stable spacing and legibility over stylized formatting

## Layout

### Global container
- max width: `1200px`
- centered layout
- responsive horizontal padding
- avoid full-bleed content except where clearly intentional

### Spacing scale
Use the following spacing values consistently:
- `4`
- `8`
- `12`
- `16`
- `20`
- `24`
- `32`
- `40`

### Common layout patterns
- Page section gap: `24–32px`
- Standard card padding: `16–20px`
- Chart card padding: `20–24px`
- Form field gap: `12–16px`
- Grid gap for cards: `16–20px`

### Dashboard layout
- mobile: 2-up stat cards where possible
- desktop: 3-up stat cards
- use consistent card heights where practical

### Market page layout
- default to a clean card grid
- prioritize readability and quick scanning over density
- keep controls compact and polished

## Navigation

### Desktop navigation
- sticky top nav
- dark translucent background
- subtle backdrop blur
- thin bottom border
- restrained active state

### Mobile header
- compact top header
- same dark elevated surface treatment
- no large or noisy mobile navigation interactions

### Active state styling
Use one or more of:
- brighter text
- slightly elevated or filled background
- subtle border emphasis

Do not use loud underlines or flashy glow effects.

## Surfaces and Elevation
The app should use **controlled glassy elevation**, not dramatic glassmorphism.

### Card recipe
Cards and panels should generally include:
- dark elevated background
- subtle translucent border
- low-opacity soft shadow
- optional backdrop blur on top-level shell elements

### Surface feel
Cards should feel:
- sleek
- premium
- separated from the page background
- chart-friendly
- data-first

### Avoid
- heavy blur on every component
- overly bright glows
- thick neon borders
- loud gradients

## Shape Language
Use **subtle rounding** throughout the interface.

### Recommended radii
- cards / panels: `14px`
- buttons / inputs: `10px`
- modals / dialogs: `16px`
- badges: `9999px` for pills or `8px` for compact rect badges

The UI should feel modern, but not soft or bubbly.

## Component Guidelines

### Buttons
Buttons should feel **neutral and polished**.

#### Primary button
- dark-accent or muted blue emphasis
- semibold label
- sleek hover and focus states
- not overly saturated

#### Secondary button
- dark surface
- subtle border
- hover through border brightening or small background lift

#### Destructive button
- understated red treatment
- reserve stronger red only for final destructive confirmation moments

### Inputs
Inputs should use:
- dark filled background
- subtle border
- crisp focus styling using primary accent blue
- no stark white input surfaces

### Cards
Cards are the primary building block of the UI.

Each card should support:
- title area
- content area
- optional action area
- consistent padding
- easy placement of stats, charts, lists, or form controls

### Tables and list rows
When using denser data layouts:
- minimize harsh separators
- rely on spacing and soft lines
- keep alignment clean
- avoid a spreadsheet look

## Chart Styling
Charts are the main visual focus of the app and should be treated as a first-class UI element.

### Chart goals
Charts should feel:
- clean
- understated
- premium
- readable
- trustworthy

### Chart rules
- integrate charts into card surfaces
- keep axes and gridlines muted
- use one dominant line color at a time
- keep tooltip styling minimal and premium
- avoid visual noise

### Preferred chart token usage
- main chart line: `accent-primary`
- positive trend emphasis: `accent-success`
- negative trend emphasis: `accent-danger`
- signal overlays / prediction emphasis: `accent-signal`
- gridlines: very low-contrast neutral
- tooltip background: elevated dark surface with subtle border

### Avoid
- too many saturated series at once
- thick gridlines
- over-animated transitions
- loud trading-dashboard gimmicks

## Pokémon Identity and Collector Flavor
PokePredict should acknowledge that it is a Pokémon collector app, but the interface should not be themed like a game.

### Allowed collector signals
Use Pokémon identity through:
- card thumbnails
- set names
- rarity badges
- subtle accent moments
- small collectible-oriented cues

### Avoid
- cartoonish layouts
- bright rainbow UI systems
- overly nostalgic or childlike design language
- decorative Pokémon motifs that distract from data

## Badges and Semantic Labels
Use light color coordination while keeping badge styling restrained.

### Suggested badge categories
- bullish / positive: muted green tint
- bearish / negative: muted red tint
- neutral: gray tint
- special / featured / rare: yellow or violet tint
- signal / model-driven: blue or violet tint

### Badge styling rules
- compact
- soft tinted background
- subtle border
- readable small text
- never visually dominate the page

## Interaction and Motion
Motion should be subtle, calm, and premium.

### Preferred interactions
- slight hover lift on cards
- soft transitions on background, border, and shadow
- clean focus states
- restrained modal motion

### Avoid
- exaggerated bounce
- flashy glows
- dramatic transforms
- highly playful animation

## Page-Level Styling Notes

### Dashboard
- stat cards should feel compact, elevated, and scannable
- quick actions should not dominate the analytics
- maintain even spacing and consistent card rhythm

### Market page
- clean, scan-friendly card grid
- filters should be compact and secondary to content
- card imagery can appear but should not overpower pricing data

### Card detail page
- chart is the hero section
- supporting sections should stack cleanly beneath the chart
- metadata, signal, and action areas should remain visually secondary

### Portfolio page
- holdings should feel structured and easy to scan
- summary area should feel trustworthy and slightly emphasized
- add/delete interactions should be simple and polished

### Alerts page
- forms should feel light and efficient
- empty state should be friendly but still premium
- alert rows should feel compact and administrative, not flashy

## Accessibility and Readability
Even in dark mode, readability and contrast must remain strong.

### Requirements
- primary text should remain high-contrast
- muted text should remain readable, not washed out
- semantic color should not be the only way status is conveyed
- focus states must be visible and keyboard-friendly
- charts should remain legible without requiring heavy saturation

## Tailwind / Token Mapping Guidance
Recommended semantic token categories for implementation:

- `background`
- `foreground`
- `card`
- `card-foreground`
- `popover`
- `popover-foreground`
- `primary`
- `primary-foreground`
- `secondary`
- `secondary-foreground`
- `muted`
- `muted-foreground`
- `accent`
- `accent-foreground`
- `border`
- `input`
- `ring`
- `destructive`
- `success`
- `warning`
- `signal`

### Suggested semantic mapping
- `background` -> `#0A0A0B`
- `card` -> `#111214`
- `popover` -> `#16181C`
- `foreground` -> `#F5F7FA`
- `muted-foreground` -> `#7E8794`
- `primary` -> `#5DA8FF`
- `accent` -> `#8B7CFF`
- `border` -> `rgba(255,255,255,0.08)`
- `ring` -> `#5DA8FF`
- `destructive` -> `#F05D5E`
- `success` -> `#34C77B`
- `warning` -> `#F6C945`
- `signal` -> `#8B7CFF`

## shadcn/ui Guidance
When customizing shadcn components for PokePredict:
- keep components visually restrained
- prefer darker fills over high-contrast outlines
- keep hover states subtle
- preserve consistent radii
- avoid over-styling defaults unless it improves clarity

### shadcn priorities
1. consistency
2. readability
3. calm premium feel
4. chart-first support

## Non-Goals for v1
These are intentionally out of scope unless specifically needed later:
- light mode
- highly branded illustration system
- flashy animation system
- extensive multi-color theming
- overly gamified Pokémon visual language
- highly dense trader-style professional chart UI

## Implementation Heuristics for Codex / Developers
When generating or editing frontend code, prefer the following:
- default to dark premium surfaces
- use cards as the main layout primitive
- use blue as the main accent for interactive elements
- keep spacing clean and consistent
- prioritize chart readability
- keep badges restrained
- avoid bright or toy-like Pokémon styling
- choose clean, polished component patterns over clever ones

If uncertain between two design directions, choose the one that is:
1. cleaner
2. calmer
3. more trustworthy
4. more data-focused

## Final Reminder
PokePredict is not a game UI and not a sterile enterprise dashboard. It should sit in the middle: a premium, modern, dark analytics product built specifically for Pokémon collectors.