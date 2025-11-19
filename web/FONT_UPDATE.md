# Font Update: Quicksand

## Overview

Updated the frontend application to use **Quicksand** as the primary font family, replacing the default system fonts.

## Changes Made

### 1. Google Fonts Integration

**File:** `src/routes/__root.tsx` (lines 30-42)

Added Google Fonts preconnect and stylesheet links to load Quicksand:

```tsx
links: [
  {
    rel: "preconnect",
    href: "https://fonts.googleapis.com",
  },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap",
  },
  // ... other links
]
```

**Font weights loaded:**
- 300 (Light)
- 400 (Regular)
- 500 (Medium)
- 600 (Semi-Bold)
- 700 (Bold)

### 2. CSS Configuration

**File:** `src/styles.css` (lines 80-81, 127)

Updated the font family declarations:

```css
@theme inline {
  /* Using Quicksand font */
  --font-sans: 'Quicksand', ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono', monospace;
  /* ... other theme variables */
}

@layer base {
  body {
    @apply bg-background text-foreground;
    font-family: 'Quicksand', ui-sans-serif, system-ui, sans-serif;
  }
}
```

## Font Characteristics

### Quicksand

**Type:** Modern geometric sans-serif

**Characteristics:**
- Clean and rounded letterforms
- Excellent readability at all sizes
- Professional yet friendly appearance
- Great for UI/UX applications
- Optimal for both headings and body text

**Use Cases:**
- Dashboard interfaces
- Data visualization
- Modern web applications
- SaaS products
- Professional tools

### Font Fallbacks

The font stack includes fallbacks for optimal compatibility:

```
'Quicksand' → ui-sans-serif → system-ui → sans-serif
```

1. **Quicksand**: Primary font (loaded from Google Fonts)
2. **ui-sans-serif**: Modern browsers' default UI font
3. **system-ui**: System default font
4. **sans-serif**: Generic sans-serif fallback

## Performance Optimization

### Preconnect

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

Establishes early connections to Google Fonts servers, reducing font loading time.

### Display Swap

```
display=swap
```

Uses `font-display: swap` to show fallback fonts immediately while Quicksand loads, preventing FOIT (Flash of Invisible Text).

### Font Subset

Only loads the weights actually used (300-700), reducing download size compared to loading all weights.

## Visual Impact

### Before (System Fonts)
- Variable appearance across operating systems
- Less consistent brand identity
- Standard/generic look

### After (Quicksand)
- Consistent appearance across all platforms
- Modern, professional aesthetic
- Friendly, approachable design
- Enhanced readability
- Stronger brand identity

## Testing

### Verify Font Loading

1. **Start the application**:
   ```bash
   cd web
   npm run dev
   ```

2. **Open browser DevTools**:
   - Navigate to http://localhost:5173
   - Open DevTools (F12 or Cmd+Opt+I)
   - Go to Network tab
   - Filter by "Font"

3. **Verify Quicksand loads**:
   - Should see requests to `fonts.googleapis.com`
   - Should see `Quicksand` font files loading
   - Status should be 200 (OK)

4. **Check computed styles**:
   - Inspect any text element
   - Check Computed styles
   - Font family should show: `Quicksand, ui-sans-serif, system-ui, sans-serif`

### Visual Testing

1. **Dashboard Page**:
   - Check header text
   - Check card titles
   - Check body text
   - All should render in Quicksand

2. **Different Font Weights**:
   - Regular text: 400
   - Semibold headings: 600
   - Bold titles: 700

3. **Cross-browser Testing**:
   - Chrome/Edge
   - Firefox
   - Safari
   - Mobile browsers

### Performance Testing

Use Lighthouse or WebPageTest to verify:
- Font loading doesn't block rendering
- No layout shifts (CLS)
- Good First Contentful Paint (FCP)

## Browser Support

Quicksand is supported in all modern browsers:
- Chrome 4+
- Firefox 3.5+
- Safari 3.1+
- Edge (all versions)
- Opera 10+
- Mobile browsers (iOS Safari, Chrome Mobile, etc.)

## Accessibility

### Readability

Quicksand maintains excellent readability:
- Clear letterforms at all sizes
- Good character distinction (e.g., I, l, 1)
- Appropriate x-height
- Sufficient spacing

### Contrast

Ensure sufficient color contrast with Quicksand:
- Minimum 4.5:1 for normal text
- Minimum 3:1 for large text (18px+ or 14px+ bold)
- Use the existing color system which maintains proper contrast

## Maintenance

### Updating Font Weights

To add or remove weights, update the Google Fonts URL:

```tsx
// Current: wght@300;400;500;600;700
// Add 800: wght@300;400;500;600;700;800
// Remove 300: wght@400;500;600;700
```

### Self-Hosting Alternative

If you want to self-host fonts (for better privacy/performance):

1. Download Quicksand from [Google Fonts](https://fonts.google.com/specimen/Quicksand)
2. Place font files in `public/fonts/`
3. Update `styles.css`:

```css
@font-face {
  font-family: 'Quicksand';
  src: url('/fonts/Quicksand-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}
/* Repeat for other weights */
```

4. Remove Google Fonts links from `__root.tsx`

## Files Modified

1. **src/routes/__root.tsx**
   - Added Google Fonts preconnect links
   - Added Quicksand stylesheet link

2. **src/styles.css**
   - Updated `--font-sans` variable
   - Added explicit font-family to body

## Rollback

To revert to system fonts:

1. Remove Google Fonts links from `__root.tsx`:
   ```tsx
   // Remove these three link objects
   ```

2. Update `styles.css`:
   ```css
   --font-sans: ui-sans-serif, system-ui, sans-serif;

   body {
     @apply bg-background text-foreground;
     /* Remove font-family line */
   }
   ```

## Summary

The application now uses Quicksand as the primary font, providing:
- ✅ Modern, professional appearance
- ✅ Consistent cross-platform experience
- ✅ Enhanced readability
- ✅ Better brand identity
- ✅ Optimized loading with preconnect and display swap
- ✅ Multiple weights for design flexibility

The font integrates seamlessly with the existing design system and maintains excellent performance and accessibility.
