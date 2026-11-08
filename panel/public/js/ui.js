// Takrorlanadigan qismlar: avatar, rol, daraja, kartalar, oynalar, diagrammalar, voqealar qatori.
import { S, h, replaceKids, svgPath, highlight, api, send, runAction, AuthError, allowedKits, fmtDate, fmtDateTime, fmtAgo, fmtNum, KIT_ICON, KIT_NAMES, TIER_VALUES } from './core.js';
import { sfx } from './look.js';

// Foydalanuvchi chizgan ikonkalar: rangi matn rangidan olinadi.
const PICTURE_ICONS = new Set(['sword', 'trophy', 'swap', 'chart', 'folder', 'open', 'verified', 'shield-check', 'gavel-shield', 'tools', 'tie', 'crown-badge']);
const ICONS = {
  moderator: 'M12 2.5l7.5 2.7v6.3c0 4.9-3.2 8.1-7.5 10-4.3-1.9-7.5-5.1-7.5-10V5.2zM12 8l1.2 2.5 2.7.4-2 1.9.5 2.7-2.4-1.3-2.4 1.3.5-2.7-2-1.9 2.7-.4z',
  'tester-check': 'M12 21.5a9.5 9.5 0 1 0 0-19 9.5 9.5 0 0 0 0 19zM6.8 12.4l2.6 2.6 4.6-5.2M12.6 14.6l.4.4 4.4-5.2',
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z',
  players: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  staff: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6 6 0 0 1 3 5.5',
  chat: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  logs: 'M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 9h6M9 13h6M9 17h3',
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  close: 'M18 6 6 18M6 6l12 12',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  ticket: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2zM13 5v2M13 17v2M13 11v2',
  ban: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  trash: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  muted: 'M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6',
  sound: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  badge: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11l2 2 4-4',
  unbadge: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 11h6',
  pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  check: 'M20 6 9 17l-5-5',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8',
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1z',
  note: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5zM15 3v6h6',
  palette: 'M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.5 3.3c.6.7.2 2.7-2.5 2.7zM7.5 11h.01M12 7h.01M16.5 11h.01',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  reply: 'M9 17l-5-5 5-5M4 12h11a5 5 0 0 1 5 5v2',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4',
  plus: 'M12 5v14M5 12h14',
  crown: 'M2 7l5 5 5-8 5 8 5-5-2 12H4z',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  eye: 'M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  calendar: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  chevron: 'M9 18l6-6-6-6',
  at: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  copy: 'M9 9h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
  tag: 'M12 2H3a1 1 0 0 0-1 1v9l9.3 9.3a1 1 0 0 0 1.4 0l8.6-8.6a1 1 0 0 0 0-1.4zM7.5 7.5h.01',
  settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'
};
// To'ldirilgan Material ikonkalar (Apache 2.0): yon panel va yuqori panel uchun, mytiers kabi.
const FILLED = {
  'm-home': 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  'm-people': 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  'm-groups': 'M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z',
  'm-chat': 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  'm-audit': 'M20 19.59V8l-6-6H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c.45 0 .85-.15 1.19-.4l-4.43-4.43c-.8.52-1.74.83-2.76.83-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5c0 1.02-.31 1.96-.83 2.75L20 19.59zM9 13c0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3-3 1.34-3 3z',
  'm-settings': 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  'm-block': 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z',
  'm-ticket': 'M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.89-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z',
  'm-palette': 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
  'm-bell': 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  'm-search': 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  'm-dashboard': 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  'm-list': 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
  'm-logout': 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  'm-person': 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  'm-menu': 'M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z',
  'm-chevron-left': 'M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z',
  'm-expand': 'M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z',
  'm-folder': 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
  'm-panels': 'M10 18h5v-6h-5v6zm-6 0h5V5H4v13zm12 0h5v-6h-5v6zM10 5v6h11V5H10z',
  'm-modal': 'M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.89-2-2-2zm0 14H5V8h14v10z',
  'm-timer': 'M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z',
  'm-dns': 'M20 13H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-6c0-.55-.45-1-1-1zM7 19c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM20 3H4c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h16c.55 0 1-.45 1-1V4c0-.55-.45-1-1-1zM7 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
  'm-discord': 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z'
};
export const icon = (name, cls = 'ico') => {
  if (PICTURE_ICONS.has(name)) return h('span', { class: `${cls} picon`, 'aria-hidden': 'true', vars: { '--pi': `url(/img/icons/${name}.webp)` } });
  if (FILLED[name]) return svgPath(FILLED[name], `${cls} fill`);
  return svgPath(ICONS[name] || ICONS.star, cls);
};
export const ROLE_ICONS = { OWNER: 'crown-badge', 'Network Admin': 'tie', Manager: 'gavel-shield', Administrator: 'tools', Moderator: 'moderator', 'Senior Tester': 'shield-check', 'Tester Tasdiqluvchi': 'tester-check', 'Tasdiqlangan Tester': 'verified' };
export const roleIcon = role => (ROLE_ICONS[role] ? icon(ROLE_ICONS[role], 'ico role-ico') : null);

// ---------- bildirishnoma ----------
let toastBox = null;
export function setToastBox(el) { toastBox = el; }
export function toast(message, kind = 'good') {
  sfx(kind === 'bad' ? 'bad' : 'ok');
  const el = h('div', { class: `toast toast-${kind}`, role: 'status' }, icon(kind === 'bad' ? 'close' : 'check', 'ico toast-ico'), h('span', null, message));
  toastBox.append(el);
  setTimeout(() => el.remove(), 3800);
}
export function handleActionError(err) {
  if (err instanceof AuthError) S.showLogin(null);
  else toast(err.message, 'bad');
}

// ---------- oyna ----------
// fields: [{ name, label, type: select|text|textarea|number|time, options, value, required, hint, max, placeholder }]
export function openDialog({ title, description, body = null, fields = [], submitLabel = 'Tasdiqlash', danger = false, wide = false, onSubmit, onDone }) {
  const inputs = {};
  const errorBox = h('div', { class: 'dialog-error', role: 'alert', hidden: true });
  const rows = fields.map(f => {
    const id = `f-${f.name}`;
    let input;
    if (f.type === 'select') {
      input = h('select', { id, class: 'field', required: f.required }, f.options.map(o => h('option', { value: o.value, selected: o.value === f.value }, o.label)));
    } else if (f.type === 'textarea') {
      input = h('textarea', { id, class: 'field', rows: 3, maxlength: f.max || 200, required: f.required, placeholder: f.placeholder }, f.value || '');
    } else {
      input = h('input', { id, class: 'field', type: f.type || 'text', required: f.required, min: f.min, max: f.type === 'number' ? f.max : null, maxlength: f.type === 'number' || f.type === 'time' ? null : (f.max || 200), value: f.value ?? '', placeholder: f.placeholder, autocomplete: 'off' });
    }
    inputs[f.name] = input;
    return h('label', { class: 'dialog-row', for: id }, h('span', null, f.label), input, f.hint ? h('span', { class: 'note' }, f.hint) : null);
  });
  const submit = onSubmit ? h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'submit' }, submitLabel) : null;
  const dialog = h('dialog', { class: `dialog${wide ? ' wide' : ''}` });
  const close = () => { dialog.close(); dialog.remove(); };
  const form = h('form', {
    method: 'dialog',
    onsubmit: async e => {
      e.preventDefault();
      if (!onSubmit) return;
      const values = {};
      for (const [name, input] of Object.entries(inputs)) values[name] = input.value.trim();
      submit.disabled = true;
      errorBox.hidden = true;
      try {
        const result = await onSubmit(values);
        dialog.close();
        dialog.remove();
        if (result?.message) toast(result.message);
        if (onDone) onDone(result);
        else S.refreshPage();
      } catch (err) {
        if (err instanceof AuthError) { dialog.remove(); S.showLogin(null); return; }
        sfx('bad');
        errorBox.textContent = err.message;
        errorBox.hidden = false;
        submit.disabled = false;
      }
    }
  },
  h('h2', null, title),
  description ? h('p', { class: 'dialog-text' }, description) : null,
  body,
  rows,
  errorBox,
  h('div', { class: 'dialog-buttons' }, h('button', { class: 'btn', type: 'button', onclick: close }, onSubmit ? 'Bekor qilish' : 'Yopish'), submit));
  dialog.append(form);
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
    return dialog;
}
export const kitField = (action, value) => ({
  name: 'kit',
  label: 'Server',
  type: 'select',
  required: true,
  value,
  options: allowedKits(action).map(k => ({ value: k.kit, label: k.name })),
  hint: 'Log va xabarlar shu serverga yuboriladi.'
});

// Rasmni butun ekranda ko'rsatadi.
export function openLightbox(url, caption) {
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': caption || 'Rasm', onclick: close },
    h('img', { src: url, alt: caption || '' }),
    h('button', { class: 'icon-btn lightbox-close', type: 'button', 'aria-label': 'Yopish' }, icon('close')),
    caption ? h('div', { class: 'lightbox-cap' }, caption) : null);
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  }

// ---------- rasm va odamlar ----------
export function avatar(url, name, size) {
  const letter = () => {
    const el = h('span', { class: 'avatar-letter', 'aria-hidden': 'true', vars: { '--s': `${size}px` } }, String(name || '?').charAt(0).toUpperCase());
    return el;
  };
  if (!url) return letter();
  const img = h('img', { class: 'avatar', src: url, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(letter()));
  return img;
}
const STEVE = { bust: '/img/steve-bust.png', full: '/img/steve-full.png' };
// O'yinchi /skin qilgan bo'lsa, sayt kabi o'sha skin chiziladi. Topilmasa Steve ko'rsatiladi.
function skinUrls(p, type) {
  const nick = p.nickname || p.nick || p.name;
  const crafty = id => `https://render.crafty.gg/3d/${type}/${encodeURIComponent(id)}`;
  const urls = [];
  if (p.skinUuid) urls.push(type === 'bust' ? `https://mc-heads.net/head/${p.skinUuid}/128` : `https://mc-heads.net/body/${p.skinUuid}/256`);
  if (p.skinName) urls.push(crafty(p.skinName));
  if (nick) urls.push(crafty(nick));
  urls.push(STEVE[type]);
  return urls;
}
export function skinImg(p, type = 'bust', size = 128, cls = '') {
  const urls = skinUrls(p, type);
  let index = 0;
  const img = h('img', { class: `skin skin-${type}${cls ? ` ${cls}` : ''}`, src: urls[0], alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
  img.addEventListener('error', () => {
    index += 1;
    if (index < urls.length) img.src = urls[index];
  });
  return img;
}
const ROLE_CLASS = { OWNER: 'owner', 'Network Admin': 'netadmin', Manager: 'manager', Administrator: 'admin', Moderator: 'mod', 'Senior Tester': 'senior', 'Tester Tasdiqluvchi': 'checker', 'Tasdiqlangan Tester': 'tester' };
// Eng yuqori rol: Discord'dagi rangi bilan.
export function rolePill(role, color, small = false) {
  if (!role) return null;
  const pill = h('span', { class: `role-pill role-${ROLE_CLASS[role] || 'other'}${small ? ' small' : ''}${ROLE_ICONS[role] ? ' with-ico' : ''}` }, roleIcon(role), role);
  if (color) pill.style.setProperty('--role', color);
  return pill;
}
export function personChip(p, q) {
  if (!p) return null;
  const inner = [avatar(p.avatar, p.name, 22), h('span', { class: 'chip-name' }, q ? highlight(p.name, q) : p.name)];
  return p.id ? h('a', { class: 'person-chip', href: p.role ? `#/staff/${p.id}` : `#/players/${p.id}` }, inner) : h('span', { class: 'person-chip' }, inner);
}
export function person(url, name, sub, size = 36, online = false) {
  const pic = online
    ? h('span', { class: 'avatar-wrap' }, avatar(url, name, size), h('span', { class: 'online-dot', title: 'Onlayn' }), h('span', { class: 'sr-only' }, 'Onlayn'))
    : avatar(url, name, size);
  return h('span', { class: 'person' }, pic, h('span', { class: 'person-text' }, h('span', { class: 'person-name' }, name), sub ? h('span', { class: 'person-sub' }, sub) : null));
}
export function tierClass(tier) {
  const m = /^(?:HT|LT)([1-5])$/.exec(tier || '');
  return m ? `t${m[1]}` : '';
}
export const tierChip = tier => (tier ? h('span', { class: `tier ${tierClass(tier)}` }, tier) : h('span', { class: 'tier none', 'aria-label': "Daraja yo'q" }, '—'));
export const kitIcon = (kit, name, cls) => h('img', { class: cls || null, src: KIT_ICON(kit), alt: name || KIT_NAMES[kit] || kit, title: name || KIT_NAMES[kit] || kit, width: 24, height: 24, draggable: 'false' });
// Daraja kuboklari: Tier 1 oltin, Tier 2 kumush, Tier 3 bronza.
export function trophyFor(tier) {
  const m = /^(HT|LT)([1-5])$/.exec(tier || '');
  if (!m) return null;
  if (m[2] === '1') return m[1] === 'HT' ? 'amber' : 'gold';
  if (m[2] === '2') return 'silver';
  if (m[2] === '3') return 'bronze';
  return null;
}
export function trophy(kind, cls = '') {
  if (!kind) return null;
  return h('span', { class: `trophy trophy-${kind}${cls ? ` ${cls}` : ''}`, 'aria-hidden': 'true' }, h('img', { src: `/img/trophy/${kind}.webp`, alt: '', draggable: 'false', loading: 'lazy' }));
}
// Kit halqasi: rangi kit rangi, to'lishi daraja balandligiga qarab.
export function kitOrb(kit, tier, { size = '' } = {}) {
  const name = KIT_NAMES[kit] || kit;
  return h('span', {
    class: `orb${tier ? ' has' : ' off'}${size ? ` ${size}` : ''}`,
    'data-kit': kit,
    title: tier ? `${name}: ${tier} · ${TIER_VALUES[tier]} ball` : `${name}: daraja yo'q`
  },
  h('span', { class: 'orb-ring' }, h('img', { src: KIT_ICON(kit), alt: '', width: 22, height: 22, draggable: 'false', loading: 'lazy' })),
  h('span', { class: `orb-tier ${tierClass(tier)}` }, tier || '—'));
}
export function tile(label, value, hint, iconName) {
  return h('div', { class: 'tile' },
    h('span', { class: 'tile-ico' }, icon(iconName || 'star')),
    h('div', { class: 'tile-label' }, label),
    h('div', { class: 'tile-value' }, fmtNum(value)),
    hint ? h('div', { class: 'tile-hint' }, hint) : null);
}
export const card = (title, hint, ...body) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), hint ? (hint.nodeType ? hint : h('span', { class: 'hint' }, hint)) : null), body);
export const empty = (text, iconName = 'search', desc = null) => h('div', { class: 'empty' }, h('span', { class: 'empty-ico' }, icon(iconName)), h('span', { class: 'empty-title' }, text), desc ? h('span', { class: 'empty-desc' }, desc) : null);
export const statusBadge = open => h('span', { class: `badge ${open ? 'dot-good live' : 'dot-off'}` }, open ? 'Ochiq' : 'Yopiq');
export const historyNote = since => (since ? `Tarix ${fmtDate(since)} dan boshlab yozilgan.` : "Tarix hali bo'sh.");
export const select = (id, label, options, value, onchange) => [
  h('label', { class: 'sr-only', for: id }, label),
  h('select', { id, class: 'field', onchange }, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)))
];
// Har bir bo'limning o'z qidiruv qatori.
export function searchBar({ id, placeholder, value = '', oninput, onsubmit, cls = '', autofocus = false }) {
  const input = h('input', { id, type: 'search', placeholder, 'aria-label': placeholder, autocomplete: 'off', value, autofocus });
  const clear = h('button', { class: 'search-clear', type: 'button', 'aria-label': 'Tozalash', hidden: !value, onclick: () => { input.value = ''; clear.hidden = true; if (oninput) oninput(''); if (onsubmit) onsubmit(''); input.focus(); } }, icon('close'));
  input.addEventListener('input', () => { clear.hidden = !input.value; if (oninput) oninput(input.value.trim()); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && onsubmit) { e.preventDefault(); onsubmit(input.value.trim()); } });
  return h('div', { class: `searchbar${cls ? ` ${cls}` : ''}` }, icon('search', 'ico search-ico'), input, clear);
}
export function segmented(options, value, onchange, { small = false, label = 'Tanlash' } = {}) {
  let current = value;
  const buttons = options.map(([v, text, ico]) => {
    const btn = h('button', {
      type: 'button',
      'aria-pressed': String(v === current),
      onclick: () => {
        current = v;
        buttons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        onchange(v);
      }
    }, ico ? icon(ico) : null, text);
    return btn;
  });
  return h('div', { class: `segmented${small ? ' small' : ''}`, role: 'group', 'aria-label': label }, buttons);
}
export function pager(page, pages, go) {
  return h('div', { class: 'pager' },
    h('span', { class: 'note' }, `Sahifa ${page} / ${pages}`),
    h('div', { class: 'pager-btns' },
      h('button', { class: 'btn', type: 'button', disabled: page <= 1, onclick: () => go(page - 1) }, 'Oldingi'),
      h('button', { class: 'btn', type: 'button', disabled: page >= pages, onclick: () => go(page + 1) }, 'Keyingi')));
}
export const actionBtn = (text, onclick, cls = '', iconName = null) => h('button', { class: `btn small ${cls}`, type: 'button', onclick }, iconName ? icon(iconName) : null, text);
export function roleChips(roles) {
  if (!roles?.length) return null;
  return h('div', { class: 'roles' }, roles.map(r => {
    const chip = h('span', { class: `role-chip${ROLE_ICONS[r.name] ? ' with-ico' : ''}` }, roleIcon(r.name), r.name);
    if (r.color) chip.style.setProperty('--dot', r.color);
    return chip;
  }));
}

// Kategoriya paneli. Katta ko'rinishda ikonka burchakda kesilib turadi, ixcham ko'rinishda matn ustida.
// Sichqoncha kelganda ikonka sekin buriladi. options: [{ value, text, icon yoki img, count }]
export function catBar(options, value, onchange, { label = 'Tanlash', compact = false } = {}) {
  let current = value;
  const buttons = options.map(o => {
    const art = o.img ? h('img', { class: 'cat-art', src: o.img, alt: '', draggable: 'false' }) : icon(o.icon, 'ico cat-art');
    const btn = h('button', {
      class: 'cat',
      type: 'button',
      'aria-pressed': String(o.value === current),
      onclick: () => {
        current = o.value;
        buttons.forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
        onchange(o.value);
      }
    }, art, h('span', { class: 'cat-text' }, o.text), o.count === undefined || o.count === null ? null : h('span', { class: 'cat-count' }, fmtNum(o.count)));
    return btn;
  });
  return h('div', { class: `catbar${compact ? ' compact' : ''}`, role: 'group', 'aria-label': label }, buttons);
}

// Xodim rollari: kerakli rollar belgilanib saqlanadi. Har bir o'zgarish alohida yuboriladi va logga yoziladi.
export function staffRoleDialog(name, kits, targetId, startKit = null) {
  const wanted = new Map(kits.map(k => [k.kit, new Map(k.roleControl.map(r => [r.name, r.has]))]));
  let current = kits.find(k => k.kit === startKit) || kits[0];
  const box = h('div', { class: 'stack small-gap' });
  const roleButton = r => {
    const picks = wanted.get(current.kit);
    const btn = h('button', {
      class: 'day-chip role-toggle',
      type: 'button',
      'aria-pressed': String(picks.get(r.name)),
      disabled: !(r.exists && r.editable),
      onclick: () => {
        picks.set(r.name, !picks.get(r.name));
        btn.setAttribute('aria-pressed', String(picks.get(r.name)));
      }
    }, roleIcon(r.name), r.name);
    return btn;
  };
  function renderRoles() {
    const blocked = current.roleControl.filter(r => r.exists && !r.editable).map(r => r.name);
    const missing = current.roleControl.filter(r => !r.exists).map(r => r.name);
    replaceKids(box,
      h('div', { class: 'day-chips' }, current.roleControl.map(roleButton)),
      blocked.length ? h('p', { class: 'note' }, `Bot bu rollarni o'zgartira olmaydi, chunki Discord'da bot roli ulardan pastda: ${blocked.join(', ')}.`) : null,
      missing.length ? h('p', { class: 'note' }, `Bu serverda yo'q rollar: ${missing.join(', ')}.`) : null);
  }
  renderRoles();
  const picker = h('select', {
    id: 'f-role-kit',
    class: 'field',
    onchange: e => {
      current = kits.find(k => k.kit === e.target.value);
      renderRoles();
    }
  }, kits.map(k => h('option', { value: k.kit, selected: k === current }, k.name)));
  openDialog({
    title: `${name}: rollar`,
    description: 'Administrator va undan yuqori rollar panelga kira oladi.',
    body: h('div', { class: 'stack small-gap' }, h('label', { class: 'dialog-row', for: 'f-role-kit' }, h('span', null, 'Server'), picker), box),
    submitLabel: 'Saqlash',
    onSubmit: async () => {
      const changes = kits.flatMap(k => k.roleControl
        .filter(r => wanted.get(k.kit).get(r.name) !== r.has)
        .map(r => ({ kit: k.kit, targetId, role: r.name, on: wanted.get(k.kit).get(r.name) })));
      for (const change of changes) await runAction('staffRole', change);
      return { message: changes.length ? `${changes.length} ta rol o'zgartirildi.` : "Hech narsa o'zgarmadi." };
    }
  });
}

// ---------- diagrammalar ----------
function niceMax(value) {
  if (value <= 4) return 4;
  const power = Math.pow(10, Math.floor(Math.log10(value)));
  for (const step of [1, 2, 5, 10]) if (value <= step * power) return step * power;
  return 10 * power;
}
function shortDate(iso) {
  const [, month, day] = iso.split('-');
  return `${day}.${month}`;
}
export function columnChart(rows, emptyText) {
  if (!rows.length || rows.every(r => r.count === 0)) return empty(emptyText, 'chart');
  const top = niceMax(Math.max(...rows.map(r => r.count)));
  const plot = h('div', { class: 'chart-plot' });
  for (const value of [top, top / 2]) {
    const pos = `${100 - value / top * 100}%`;
    plot.append(h('div', { class: 'chart-grid', vars: { top: pos } }), h('div', { class: 'chart-tick', vars: { top: pos } }, value));
  }
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const bars = h('div', { class: rows.length > 60 ? 'chart-bars dense' : 'chart-bars' });
  const showTip = (slot, row) => {
    tip.textContent = `${shortDate(row.date)}: ${row.count} ta test`;
    tip.hidden = false;
    tip.style.left = `${slot.offsetLeft + slot.offsetWidth / 2}px`;
    tip.style.top = `${Math.max(100 - row.count / top * 100, 12)}%`;
  };
  rows.forEach(row => {
    const bar = h('div', { class: 'chart-bar', vars: { height: row.count ? `${Math.max(row.count / top * 100, 2)}%` : '0' } });
    const slot = h('div', { class: 'chart-slot' }, bar);
    slot.addEventListener('mouseenter', () => showTip(slot, row));
    slot.addEventListener('click', () => showTip(slot, row));
    bars.append(slot);
  });
  plot.addEventListener('mouseleave', () => { tip.hidden = true; });
  plot.append(bars, tip);
  const middle = rows[Math.floor(rows.length / 2)];
  const table = h('table', { class: 'sr-only' },
    h('caption', null, 'Kunlik testlar soni'),
    h('thead', null, h('tr', null, h('th', null, 'Sana'), h('th', null, 'Testlar'))),
    h('tbody', null, rows.map(r => h('tr', null, h('td', null, shortDate(r.date)), h('td', null, r.count)))));
  return h('div', { class: 'chart' }, plot,
    h('div', { class: 'chart-x', 'aria-hidden': 'true' }, h('span', null, shortDate(rows[0].date)), h('span', null, shortDate(middle.date)), h('span', null, shortDate(rows[rows.length - 1].date))),
    table);
}
export function chartCard(title, initialRows, params, emptyText) {
  const body = h('div', null, columnChart(initialRows, emptyText));
  const control = segmented([[30, '30 kun'], [90, '90 kun'], [180, '180 kun'], [365, '365 kun']], 30, async value => {
    const query = new URLSearchParams({ days: value, ...params });
    const data = await api(`/api/stats/tests?${query}`).catch(() => null);
    if (data) replaceKids(body, columnChart(data.perDay, emptyText));
  }, { small: true, label: 'Davr' });
  return card(title, control, body);
}
export function tierBars(rows) {
  const max = Math.max(...rows.map(r => r.count), 1);
  return h('div', { class: 'hbars' }, rows.map(r => h('div', { class: 'hbar' },
    tierChip(r.tier),
    h('div', { class: 'hbar-track' }, h('div', { class: `hbar-fill ${tierClass(r.tier)}${r.count ? '' : ' zero'}`, title: `${r.tier}: ${r.count}`, vars: { width: `${r.count / max * 100}%` } })),
    h('div', { class: 'hbar-value' }, r.count))));
}
// Faollik xaritasi: oxirgi 12 hafta, har bir katak bir kun.
export function heatMap(days) {
  if (!days?.length) return null;
  const max = Math.max(...days.map(d => d.count), 1);
  const first = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
  const offset = (first + 6) % 7;
  const cells = [...Array(offset).fill(null), ...days];
  return h('div', { class: 'heat', role: 'img', 'aria-label': 'Oxirgi 12 haftadagi faollik' }, cells.map(d => (d
    ? h('span', { class: 'heat-cell', title: `${d.date.split('-').reverse().join('.')}: ${d.count} ta amal`, vars: { '--a': d.count ? (0.25 + d.count / max * 0.75).toFixed(2) : '0' } })
    : h('span', { class: 'heat-cell blank' }))));
}
// Kunning qaysi soatlarida faol.
export function hoursChart(hours) {
  if (!hours?.some(Boolean)) return null;
  const max = Math.max(...hours, 1);
  return h('div', { class: 'hours' }, hours.map((count, i) => h('span', { class: 'hour', title: `${String(i).padStart(2, '0')}:00 — ${count} ta amal` }, h('i', { vars: { height: `${count ? Math.max(count / max * 100, 6) : 0}%` } }))));
}

// ---------- voqealar ----------
const EVENT_LOOK = {
  test: ['sword', 'blue', 'Oddiy test'],
  high_win: ['trophy', 'gold', 'Yuqori test: yutuq'],
  high_loss: ['down', 'rose', 'Yuqori test: mag\'lubiyat'],
  tier_set: ['swap', 'violet', 'Daraja berildi'],
  tier_demote: ['down', 'orange', 'Daraja tushirildi'],
  tier_delete: ['trash', 'red', "Daraja o'chirildi"],
  restrict: ['ban', 'red', 'Cheklov'],
  unrestrict: ['shield-check', 'green', 'Cheklov olindi'],
  mute: ['muted', 'amber', 'Mute'],
  unmute: ['sound', 'green', 'Mute olindi'],
  cooldown_set: ['clock', 'cyan', 'Cooldown berildi'],
  cooldown_reset: ['clock', 'teal', 'Cooldown tiklandi'],
  staff_add: ['badge', 'teal', 'Rol berildi'],
  staff_remove: ['unbadge', 'slate', 'Rol olindi'],
  kick_tester: ['logout', 'orange', 'Tester chiqarildi'],
  verified: ['check', 'green', 'Akkaunt tasdiqlandi'],
  nickname: ['pencil', 'violet', "Nik o'zgardi"],
  retired: ['moon', 'slate', 'Retired'],
  unretired: ['flame', 'orange', 'Retired olindi'],
  note_add: ['note', 'amber', "Izoh qo'shildi"],
  note_delete: ['note', 'slate', "Izoh o'chirildi"],
  queue_remove: ['list', 'orange', 'Navbatdan olindi'],
  queue_move: ['list', 'blue', "Navbat o'zgardi"],
  queue_close: ['lock', 'slate', 'Navbat yopildi'],
  ticket_close: ['folder', 'slate', 'Chipta yopildi'],
  application: ['doc', 'blue', 'Tester arizasi'],
  chat_delete: ['trash', 'rose', "Chat xabari o'chirildi"],
  panel_login: ['key', 'cyan', 'Panelga kirish'],
  settings_change: ['settings', 'slate', "Sozlama o'zgardi"],
  panel_publish: ['send', 'blue', 'Xabar Discordga yuborildi'],
  news_add: ['note', 'blue', "Yangilik qo'shildi"],
  news_delete: ['note', 'slate', "Yangilik o'chirildi"]
};
export const eventLook = type => EVENT_LOOK[type] || ['star', 'slate', type];
export function typeIcon(type, cls = '') {
  const [name, tone, label] = eventLook(type);
  return h('span', { class: `type-ico${tone === 'red' || tone === 'rose' ? ' danger' : ''}${cls ? ` ${cls}` : ''}`, title: label }, icon(name), h('span', { class: 'sr-only' }, label));
}
function eventSentence(e, q) {
  const target = e.target ? personChip({ ...e.target, role: null }, q) : h('span', { class: 'person-chip plain' }, "O'yinchi");
  const actorBlock = e.actor
    ? h('span', { class: 'actor' }, personChip(e.actor, q), rolePill(e.actor.role, e.actor.roleColor, true))
    : null;
  const anyone = actorBlock || h('span', { class: 'person-chip plain' }, 'Tizim');
  const t = (...parts) => parts;
  const strong = text => h('strong', null, text);
  switch (e.type) {
    case 'test': return t(anyone, ' testda ', target, ' ga ', tierChip(e.newValue), ' berdi', e.oldValue ? [' (avval ', strong(e.oldValue), ')'] : '');
    case 'high_win': return t(target, ' yuqori testda ', tierChip(e.newValue), ' oldi', e.oldValue ? [' (avval ', strong(e.oldValue), ')'] : '', ', tester: ', anyone);
    case 'high_loss': return t(target, ' ', tierChip(e.newValue), ' testidan yiqildi, tester: ', anyone);
    case 'tier_set': return t(anyone, ' ', target, ' ga ', tierChip(e.newValue), ' berdi', e.oldValue ? [' (avval ', strong(e.oldValue), ')'] : '');
    case 'tier_demote': return t(anyone, ' ', target, ' darajasini ', tierChip(e.oldValue), ' dan ', tierChip(e.newValue), ' ga tushirdi');
    case 'tier_delete': return t(anyone, ' ', target, ' darajasini o\'chirdi', e.oldValue ? [' (', strong(e.oldValue), ')'] : '');
    case 'restrict': return e.actor ? t(anyone, ' ', target, e.newValue ? [' ni ', strong(e.newValue), 'ga chekladi'] : ' ni chekladi') : t(target, e.newValue ? [' ', strong(e.newValue), 'ga cheklandi'] : ' cheklandi');
    case 'unrestrict': return e.actor ? t(anyone, ' ', target, ' cheklovini olib tashladi') : t(target, ' cheklovi olib tashlandi');
    case 'mute': return t(anyone, ' ', target, ' ni ', strong(fmtMinutes(e.newValue)), 'ga mute qildi');
    case 'unmute': return t(anyone, ' ', target, ' dan mute ni olib tashladi');
    case 'staff_add': return t(target, ' ga ', strong(e.newValue), ' roli berildi', e.actor ? [', kim: ', anyone] : '');
    case 'staff_remove': return t(target, ' dan ', strong(e.oldValue), ' roli olindi', e.actor ? [', kim: ', anyone] : '');
    case 'verified': return t(target, ' akkauntini tasdiqladi: ', strong(e.newValue));
    case 'nickname': {
      // Xodim o'zgartirgan bo'lsa ikkalasi ko'rinadi; o'yinchi o'zi o'zgartirgan bo'lsa bitta nom.
      const who = e.actor && e.actorId !== e.targetId ? [anyone, ' ', target] : target;
      const newName = h('span', { class: 'nick-new' }, highlight(e.newValue || '', q));
      return e.oldValue && e.oldValue !== e.newValue
        ? t(who, ' nikini ', h('span', { class: 'nick-old' }, highlight(e.oldValue, q)), ' dan ', newName, " ga o'zgartirdi")
        : t(who, ' nikini ', newName, " ga o'zgartirdi");
    }
    case 'retired': return t(anyone, ' ', target, ' ga Retired berdi');
    case 'unretired': return t(anyone, ' ', target, ' dan Retired olib tashladi');
    case 'cooldown_set': return t(anyone, ' ', target, ' ga cooldown berdi (', strong(e.newValue || '—'), ')');
    case 'cooldown_reset': return t(anyone, ' ', target, ' cooldownini tikladi (', strong(e.newValue || '—'), ')');
    case 'kick_tester': return t(anyone, ' ', target, ' ni navbatdan chiqardi');
    case 'queue_remove': return t(anyone, ' ', target, ' ni navbatdan olib tashladi');
    case 'queue_move': return t(anyone, ' ', target, ` ni navbatda ${e.oldValue}-o'rindan ${e.newValue}-o'ringa o'tkazdi`);
    case 'queue_close': return t(anyone, ' navbatni yopdi');
    case 'ticket_close': return t(anyone, ` chiptani yopdi (${e.newValue || ''})`);
    case 'application': return t(anyone, ` tester arizasini ${e.newValue === 'ochiq' ? 'ochdi' : 'yopdi'}`);
    case 'chat_delete': return t(anyone, ' ', target, ' xabarini o\'chirdi');
    case 'note_add': return t(anyone, ' ', target, ' haqida izoh qoldirdi');
    case 'note_delete': return t(anyone, ' ', target, ' haqidagi izohni o\'chirdi');
    case 'panel_login': return t(anyone, ' panelga kirdi');
    case 'settings_change': return t(anyone, ' ', strong(e.newValue || 'sozlama'), { 'standart holatga qaytarildi': ' ni standart holatga qaytardi', "o'chirildi": " ni o'chirdi" }[e.note] || " ni o'zgartirdi");
    case 'panel_publish': return t(anyone, ' ', strong(e.newValue || 'xabar'), ' ni Discordga yubordi', e.note ? [' (', strong(e.note), ')'] : '');
    case 'news_add': return t(anyone, ' yangilik qo\'shdi: ', strong(e.newValue || ''));
    case 'news_delete': return t(anyone, ' yangilikni o\'chirdi: ', strong(e.newValue || ''));
    default: return t(e.type);
  }
}
function fmtMinutes(value) {
  const n = parseInt(value, 10);
  if (!n) return value || '—';
  if (n >= 1440) return `${Math.round(n / 1440)} kun`;
  if (n >= 60) return `${Math.round(n / 60)} soat`;
  return `${n} daqiqa`;
}
const SOURCE_LABEL = { discord: 'Discord tarixi', panel: 'Panel' };
export function eventRow(e, { full = false, q = '' } = {}) {
  return h('div', { class: `event${e.kit ? `` : ''}` },
    typeIcon(e.type),
    h('div', { class: 'event-text' },
      h('div', { class: 'event-line' }, eventSentence(e, q)),
      e.note ? h('span', { class: 'event-note' }, icon(e.type === 'panel_login' ? 'key' : 'tag'), h('span', null, highlight(e.note, q))) : null),
    h('div', { class: 'event-side' },
      full && SOURCE_LABEL[e.source] ? h('span', { class: 'badge plain' }, SOURCE_LABEL[e.source]) : null,
      e.kit ? h('span', { class: 'event-kit', title: KIT_NAMES[e.kit] || e.kit }, kitIcon(e.kit)) : null,
      h('time', { class: 'event-time', title: fmtDateTime(e.createdAt) }, full ? fmtDateTime(e.createdAt) : fmtAgo(e.createdAt))));
}
export const eventList = (rows, emptyText, options) => (rows.length ? h('div', { class: 'events' }, rows.map(e => eventRow(e, options))) : empty(emptyText, 'logs'));

