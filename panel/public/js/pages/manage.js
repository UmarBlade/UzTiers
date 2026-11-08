// Boshqaruv: tarmoqdagi kit serverlari, rollar ierarxiyasi va bot holati (faqat ko'rish).
import { h, replaceKids, api, fmtNum, fmtDuration, KIT_ICON } from '../core.js';
import { icon, card, segmented, roleIcon } from '../ui.js';
import { statePill } from './kit.js';

export async function pageManage(ctx) {
  const d = await api('/api/manage');
  document.title = 'Boshqaruv · UzTiers Panel';
  let tab = ['kits', 'roles', 'bot'].includes(ctx.query.get('tab')) ? ctx.query.get('tab') : 'kits';
  const body = h('div', { class: 'stack' });
  const kits = () => h('section', { class: 'card' },
    h('div', { class: 'card-head stacked' }, h('h2', null, 'Kitlar tarmog\'i'), h('span', { class: 'hint' }, 'Bitta bot, umumiy o\'yinchilar, har bir kitning alohida Discord serveri.')),
    h('div', { class: 'tl-list' }, d.kits.map(k => h('div', { class: 'net-row' },
      h('a', { class: 'tl-card', href: `#/kits/${k.kit}` },
        h('span', { class: 'tl-card-ava' }, h('img', { src: KIT_ICON(k.kit), alt: '', width: 38, height: 38, draggable: 'false' }), h('span', { class: `kit-status${k.open ? ' on' : ''}` })),
        h('span', { class: 'tl-card-copy' },
          h('span', { class: 'tl-card-title' }, k.name),
          h('span', { class: 'tl-card-meta' }, h('span', null, k.guildName || 'Server topilmadi'), h('span', { class: 'dot-sep' }, '·'), h('span', null, k.members !== null ? `${fmtNum(k.members)} a'zo` : '—'))),
        h('span', { class: 'net-badges' },
          statePill(k.open, `Navbat · ${k.queue}`, 'Navbat yopiq'),
          statePill(k.applicationOpen, 'Ariza ochiq', 'Ariza yopiq'),
          h('span', { class: `state-pill ${k.channelsFound === k.channelsTotal ? 'on' : 'bad'}`, title: k.missing.length ? `Topilmagan: ${k.missing.join(', ')}` : 'Hamma kanallar joyida' }, h('i'), `Kanallar ${k.channelsFound}/${k.channelsTotal}`),
          k.changed ? h('span', { class: 'mini-chip' }, `${k.changed} ta matn o'zgartirilgan`) : null),
        h('span', { class: 'tl-card-chevron' }, icon('chevron'))),
      k.missing.length ? h('div', { class: 'net-missing' }, icon('close'), `Topilmagan kanallar: ${k.missing.join(', ')}`, h('a', { class: 'hint link', href: `#/kits/${k.kit}/settings?tab=channels` }, 'Ko\'rish')) : null))));
  const roles = () => card('Rollar ierarxiyasi', 'Yuqoridagi rol pastdagilarga amal qila oladi; teng va yuqori rolga amal qilib bo\'lmaydi',
    h('ol', { class: 'role-ladder' }, d.roles.map((r, i) => h('li', { class: 'role-step' },
      h('span', { class: 'role-step-rank' }, i + 1),
      h('span', { class: 'role-step-ico', vars: r.color ? { '--role': r.color } : {} }, roleIcon(r.name)),
      h('b', null, r.name),
      h('span', { class: 'grow' }),
      h('span', { class: 'note' }, r.rank >= 4 ? (r.rank >= 5 ? 'Panel · hamma kitlar' : 'Panel · o\'z kiti') : 'Panelga kira olmaydi')))));
  const bot = () => [
    h('div', { class: 'stat-grid' },
      botStat('Discord kechikishi', d.bot.ping === null ? '—' : `${d.bot.ping} ms`, 'm-dashboard'),
      botStat('Ishlash vaqti', fmtDuration(d.bot.uptime), 'clock'),
      botStat('Serverlar', fmtNum(d.bot.guilds), 'm-groups'),
      botStat('Xotira', `${fmtNum(d.bot.memory)} MB`, 'chart')),
    card('Buyruqlar', `${d.slashCommands.length} ta slash buyruq`, h('div', { class: 'cmd-chips' }, d.slashCommands.map(c => h('code', { class: 'cmd-chip' }, `/${c}`)))),
    h('p', { class: 'note' }, `Node.js ${d.bot.node}`)
  ];
  const render = () => replaceKids(body, tab === 'kits' ? kits() : tab === 'roles' ? roles() : bot());
  render();
  return [
    h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, 'Boshqaruv'), h('div', { class: 'sub' }, 'UzTiers tarmog\'i: kit serverlari, rollar va bot holati'))),
    segmented([['kits', 'Kitlar', 'm-dashboard'], ['roles', 'Ierarxiya', 'crown'], ['bot', 'Bot', 'settings']], tab, value => { tab = value; history.replaceState(null, '', `#/manage${value === 'kits' ? '' : `?tab=${value}`}`); render(); }, { label: 'Bo\'lim' }),
    body
  ];
}
function botStat(label, value, iconName) {
  return h('div', { class: 'stat-card' },
    h('p', { class: 'stat-label' }, label),
    h('div', { class: 'stat-row' }, h('div', { class: 'stat-copy' }, h('p', { class: 'stat-value' }, value)), h('span', { class: 'tile-ico static' }, icon(iconName))));
}
