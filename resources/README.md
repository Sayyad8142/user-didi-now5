# Brand Assets: Icons & Splash

## Primary color
- Pink: `#ff007a` (solid)  
- Background suggestions: white `#ffffff` or soft rose `#fff1f5`

## Icon (all stores)
- Base: **1024×1024 PNG**, no transparency
- Simple mark: white "Didi Now" monogram (DN) or a bold "D" on pink square
- Avoid tiny text; keep edges clean (no rounded corners—stores mask automatically)
- Save to: `resources/icon.png`
- Generate all sizes: `npm run cap:assets`

## Splash
- **2732×2732 PNG** (large square), logo centered, enough padding
- Background: solid white or soft rose; high contrast logo
- Save to: `resources/splash.png`
- Generate all sizes: `npm run cap:assets`

**Tip:** Test on both light & dark mode devices for contrast.