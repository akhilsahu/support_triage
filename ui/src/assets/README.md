# Assets Folder Structure

This folder contains all static assets for the React application.

## Directory Structure

```
assets/
├── images/
│   ├── logos/          # Company logos, brand assets
│   ├── icons/          # UI icons, SVG icons
│   ├── banners/        # Marketing banners, hero images
│   └── backgrounds/    # Background images, patterns
├── fonts/              # Custom fonts (TTF, WOFF, WOFF2)
├── videos/            # Video files (MP4, WebM)
├── documents/         # PDFs, documents for download
└── index.ts           # Central export file for easy importing
```

## Usage Examples

### Adding a Logo
1. Place your logo file in `images/logos/` (e.g., `logo.svg`)
2. Update `index.ts` to export it:
   ```typescript
   export { default as logo } from './images/logos/logo.svg'
   ```
3. Import in your component:
   ```typescript
   import { logo } from '@/assets'
   ```

### Importing Individual Assets
```typescript
// Direct import
import logo from '@/assets/images/logos/logo.svg'
import heroImage from '@/assets/images/banners/hero.jpg'

// Using in JSX
<img src={logo} alt="Company Logo" />
```

### TypeScript Declarations
For TypeScript support with image imports, ensure you have proper type declarations in your `vite-env.d.ts` file.

## Best Practices

1. **Optimize Images**: Use appropriate formats (SVG for icons, WebP for photos)
2. **Consistent Naming**: Use kebab-case for file names
3. **Size Variants**: Provide different sizes for logos (e.g., logo-sm.svg, logo-lg.svg)
4. **Organization**: Keep similar assets together in their respective folders
5. **Version Control**: Avoid committing large binary files; consider using Git LFS

## File Naming Convention

- Logos: `logo.svg`, `logo-light.svg`, `logo-dark.svg`
- Icons: `icon-name.svg`, `menu.svg`, `close.svg`
- Images: `descriptive-name.jpg`, `hero-banner.png`
- Fonts: `font-name-regular.woff2`, `font-name-bold.ttf`