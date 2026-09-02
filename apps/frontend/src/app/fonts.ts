import { Inter, JetBrains_Mono } from 'next/font/google';

// Self-hosted via next/font (build-time download → served from our origin), so
// there is no render-blocking Google Fonts request. DESIGN.md §3 specifies
// Inter for UI and JetBrains Mono for tabular/numeric runs; the CSS variables
// below are what tailwind.config.cjs reads for fontFamily.{sans,mono}.
export const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});
