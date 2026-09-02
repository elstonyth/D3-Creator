// D3 Creator — see /DESIGN.md. One brand hue (#F2E600, from the logo), one
// neutral ramp on near-black, flat surfaces, hairline borders.
//
// Token names say what a thing IS, not what it looks like: `surface`, `line`,
// `fg`. The old Postiz aliases (customColor1..55, lambo*, aurora*, glass*) were
// removed with the site rebuild — if you find one in a class name, it is a
// leftover and renders unstyled.
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,html}', '../../libraries/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // ---- Brand — scarce by design. See DESIGN.md §1 "Yellow Ledger" for
        // the six places it is allowed: logo, primary CTA, focus ring, active
        // nav indicator, active data point, CTA hover.
        brand: {
          50: '#FFFEF0',
          100: '#FFFBC4',
          200: '#FFF587',
          300: '#FFEE4A',
          400: '#F8EA10',
          500: '#F2E600', // *** LOGO ***
          600: '#D4C900',
          700: '#A89F00',
          800: '#7C7500',
          900: '#3E3A00',
          DEFAULT: '#F2E600',
        },

        // ---- Surfaces
        canvas: 'var(--canvas)',
        'canvas-deep': 'var(--canvas-deep)',
        surface: {
          DEFAULT: 'var(--surface)',
          subtle: 'var(--surface-subtle)',
          elevated: 'var(--surface-elevated)',
        },
        scrim: 'var(--scrim)',

        // ---- Hairlines. `border-line`, `divide-line`, `border-line-strong`.
        line: {
          DEFAULT: 'var(--border)',
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },

        // ---- Foreground
        fg: {
          DEFAULT: 'var(--fg)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
          'on-brand': 'var(--fg-on-brand)',
        },

        // ---- Semantic — yellow-mono. Always paired with an icon and a label;
        // the hue never carries the meaning on its own (DESIGN.md §2).
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        'danger-fg': 'var(--danger-fg)',
        info: 'var(--info)',
      },

      fontFamily: {
        sans: [
          'var(--font-sans)',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          '"JetBrains Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },

      // Linear-style scale: large confident headings, 15px body at 1.6.
      fontSize: {
        'display-1': [
          'clamp(44px, 6vw, 84px)',
          { lineHeight: '1.04', letterSpacing: '-0.035em', fontWeight: '600' },
        ],
        'display-2': [
          'clamp(32px, 4vw, 52px)',
          { lineHeight: '1.08', letterSpacing: '-0.03em', fontWeight: '600' },
        ],
        section: [
          'clamp(26px, 2.4vw, 34px)',
          { lineHeight: '1.15', letterSpacing: '-0.025em', fontWeight: '600' },
        ],
        subsection: [
          '21px',
          { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '600' },
        ],
        heading: [
          '17px',
          { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' },
        ],
        'body-lg': ['17px', { lineHeight: '1.6' }],
        body: ['15px', { lineHeight: '1.6' }],
        'body-sm': ['13.5px', { lineHeight: '1.55' }],
        label: ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        caption: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        // Section eyebrows. Uppercase + wide tracking is the only place we
        // shout, and it is always at 11px so it never competes with a heading.
        micro: [
          '11px',
          { lineHeight: '1.4', letterSpacing: '0.08em', fontWeight: '500' },
        ],
        // Metric readouts. Paired with `.tnum` so columns do not jitter.
        'metric-lg': [
          'clamp(30px, 3.4vw, 44px)',
          { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '600' },
        ],
        metric: [
          '24px',
          { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
      },

      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '6px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        '3xl': '16px',
        full: '9999px',
      },

      maxWidth: {
        // The page gutter container, and a narrower measure for long-form
        // prose (privacy, terms) where 1200px would run past 90 characters.
        content: '1200px',
        prose: '760px',
      },

      boxShadow: {
        // Dark only. DESIGN.md §1: depth comes from hairlines, never glow.
        sm: '0 1px 2px rgba(0, 0, 0, 0.30)',
        DEFAULT: '0 1px 2px rgba(0, 0, 0, 0.40), 0 4px 12px rgba(0, 0, 0, 0.30)',
        lg: '0 4px 16px rgba(0, 0, 0, 0.40), 0 16px 48px rgba(0, 0, 0, 0.50)',
        focus: '0 0 0 2px rgba(242, 230, 0, 0.45)',
        none: 'none',
      },

      transitionTimingFunction: {
        // Linear uses ease-out exclusively.
        DEFAULT: 'cubic-bezier(0, 0, 0.2, 1)',
      },
      transitionDuration: {
        DEFAULT: '160ms',
      },

      keyframes: {
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        // The one sanctioned loop: a loading indicator is feedback, not
        // decoration. prefers-reduced-motion caps it to a single iteration.
        pulseDot: { '0%, 100%': { opacity: '0.25' }, '50%': { opacity: '1' } },
      },
      animation: {
        riseIn: 'riseIn 0.2s ease-out forwards',
        scaleIn: 'scaleIn 0.18s ease-out forwards',
        fadeIn: 'fadeIn 0.18s ease-out forwards',
        pulseDot: 'pulseDot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
