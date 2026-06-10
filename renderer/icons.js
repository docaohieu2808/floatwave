// Central inline-SVG icon set (Material Design paths, fill: currentColor).
// Hardcoded constants only — safe for innerHTML; sizing handled in CSS.
const svg = (path, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="${path}"/></svg>`;

export const ICONS = {
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 19h4V5H6v14zm8-14v14h4V5h-4z'),
  prev: svg('M6 6h2v12H6zm3.5 6l8.5 6V6z'),
  next: svg('M16 6h2v12h-2zm-2.5 6L5 18V6z'),
  repeat: svg('M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'),
  repeatOne: svg(
    'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z'
  ),
  heart: svg(
    'M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z'
  ),
  heartFilled: svg(
    'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
  ),
  pin: svg(
    'M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z'
  ),
  musicNote: svg(
    'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'
  ),
  queueList: svg(
    'M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zm14-2v-8h-2v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3v-6h3V8h-3z',
    '0 0 24 24'
  ),
  minimize: svg('M5 13h14v-2H5v2z'),
  close: svg(
    'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z'
  ),
  plus: svg('M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z'),
  back: svg('M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z'),
};
