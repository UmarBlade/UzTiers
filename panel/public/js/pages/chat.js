// Umumiy chat va xodimlar orasidagi shaxsiy xabarlar.
import { S, h, replaceKids, api, send, highlight, rankOfRole, fmtDateTime, fmtTime, fmtAgo, storageSet } from '../core.js';
import { sfx } from '../look.js';
import { icon, avatar, rolePill, openDialog, handleActionError, empty, searchBar } from '../ui.js';

function endpoints(otherId) {
  if (!otherId) {
    return { list: '/api/chat', post: '/api/chat', edit: id => `/api/chat/${id}`, remove: id => `/api/chat/${id}`, read: null };
  }
  return { list: `/api/dm/${otherId}`, post: `/api/dm/${otherId}`, edit: id => `/api/dm/msg/${id}`, remove: id => `/api/dm/msg/${id}`, read: `/api/dm/${otherId}/read` };
}

export async function pageChat(ctx) {
  const otherId = ctx.params[0] || null;
  const urls = endpoints(otherId);
  const messages = new Map();
  const replies = {};
  let lastSync = 0;
  let replyTo = null;
  let editing = null;
  let hasOlder = true;
  let filter = '';
  let other = null;

  const list = h('div', { class: 'chat-list', role: 'log', 'aria-label': 'Chat xabarlari' });
  const composerNote = h('div', { class: 'chat-context', hidden: true });
  const input = h('textarea', { class: 'field chat-input', rows: 1, maxlength: S.me.chatMaxLength, placeholder: "Xabar yozing… (Enter: yuborish, Shift+Enter: yangi qator)", 'aria-label': 'Xabar' });
  const sendBtn = h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Yuborish' }, icon('send'));
  const atBottom = () => list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const scrollDown = () => { list.scrollTop = list.scrollHeight; };

  function setContext(mode, message) {
    replyTo = mode === 'reply' ? message : null;
    editing = mode === 'edit' ? message : null;
    if (!mode) {
      composerNote.hidden = true;
      composerNote.textContent = '';
      return;
    }
    composerNote.hidden = false;
    replaceKids(composerNote,
      h('span', null, mode === 'reply' ? `${message.authorName} ga javob` : 'Xabarni tahrirlash'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Bekor qilish', onclick: () => { setContext(null); input.value = ''; } }, icon('close')));
    if (mode === 'edit') input.value = message.body;
    input.focus();
  }

  function canRemove(m) {
    if (m.authorId === S.me.id) return true;
    if (otherId) return false;
    return S.me.isOwner || rankOfRole(m.authorRole) < S.me.rank;
  }
  function messageNode(m, compact) {
    const own = m.authorId === S.me.id;
    const original = m.replyTo ? (messages.get(m.replyTo) || replies[m.replyTo]) : null;
    const tools = m.deleted ? null : h('div', { class: 'chat-tools' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Javob berish', 'aria-label': 'Javob berish', onclick: () => setContext('reply', m) }, icon('reply')),
      own ? h('button', { class: 'icon-btn', type: 'button', title: 'Tahrirlash', 'aria-label': 'Tahrirlash', onclick: () => setContext('edit', m) }, icon('pencil')) : null,
      canRemove(m) ? h('button', { class: 'icon-btn danger', type: 'button', title: "O'chirish", 'aria-label': "O'chirish", onclick: () => openDialog({
        title: "Xabarni o'chirish",
        description: own ? "Xabaringiz o'chiriladi." : `${m.authorName} ning xabari o'chiriladi va bu logga yoziladi.`,
        submitLabel: "O'chirish",
        danger: true,
        onSubmit: async () => { await send('DELETE', urls.remove(m.id), {}); await poll(); return null; },
        onDone: () => {}
      }) }, icon('trash')) : null);
    return h('div', { class: `chat-msg${compact ? ' compact' : ''}${own ? ' own' : ''}`, 'data-id': m.id },
      compact ? h('span', { class: 'chat-gutter' }, h('time', { class: 'chat-time-hover', title: fmtDateTime(m.createdAt) }, fmtTime(m.createdAt))) : avatar(m.authorAvatar, m.authorName, 40),
      h('div', { class: 'chat-body' },
        compact ? null : h('div', { class: 'chat-head' },
          h('a', { class: 'chat-author', href: `#/staff/${m.authorId}` }, m.authorName),
          rolePill(m.author?.role || m.authorRole, m.author?.roleColor, true),
          h('time', { class: 'chat-time', title: fmtDateTime(m.createdAt) }, fmtDateTime(m.createdAt))),
        m.replyTo ? h('div', { class: 'chat-reply' }, icon('reply'), original ? (original.deleted ? "O'chirilgan xabar" : `${original.authorName}: ${String(original.body).slice(0, 90)}`) : 'Oldingi xabar') : null,
        m.deleted
          ? h('div', { class: 'chat-text deleted' }, "Xabar o'chirildi")
          : h('div', { class: 'chat-text' }, highlight(m.body, filter), m.edited ? h('span', { class: 'chat-edited' }, ' (tahrirlangan)') : null),
        otherId && own && m.readAt && !m.deleted ? h('span', { class: 'chat-read' }, icon('check'), "o'qildi") : null),
      tools);
  }

  function render(keepBottom) {
    const wasBottom = keepBottom ?? atBottom();
    const previousHeight = list.scrollHeight;
    const previousTop = list.scrollTop;
    const needle = filter.toLowerCase();
    const ordered = [...messages.values()].sort((a, b) => a.id - b.id).filter(m => !needle || String(m.body).toLowerCase().includes(needle) || String(m.authorName).toLowerCase().includes(needle));
    const nodes = [];
    if (hasOlder && ordered.length && !needle) nodes.push(h('button', { class: 'btn chat-older', type: 'button', onclick: loadOlder }, 'Oldingi xabarlar'));
    if (!ordered.length) nodes.push(empty(needle ? 'Bu so\'z topilmadi.' : "Hali xabar yo'q. Birinchi bo'lib yozing!", 'chat'));
    let previous = null;
    for (const m of ordered) {
      const compact = !needle && previous && previous.authorId === m.authorId && m.createdAt - previous.createdAt < 5 * 60000 && !m.replyTo;
      nodes.push(messageNode(m, compact));
      previous = m;
    }
    replaceKids(list, nodes);
    if (wasBottom) scrollDown();
    else if (keepBottom === false) list.scrollTop = list.scrollHeight - previousHeight + previousTop;
    else list.scrollTop = previousTop;
  }
  function merge(data) {
    for (const m of data.messages) messages.set(m.id, m);
    Object.assign(replies, data.replies);
    if (data.serverTime) lastSync = data.serverTime;
    if (data.other) other = data.other;
    const newest = Math.max(0, ...messages.keys());
    if (newest && !otherId) { storageSet('uzp_chat_read', newest); ctx.onChatRead?.(newest); }
  }
  const markRead = () => { if (urls.read) send('POST', urls.read, {}).then(() => ctx.onChatRead?.()).catch(() => {}); };
  async function poll() {
    const data = await api(`${urls.list}?since=${lastSync - 2000}`);
    if (!data) return;
    if (!data.messages.length) { lastSync = data.serverTime; return; }
    const incoming = data.messages.filter(m => !messages.has(m.id) && m.authorId !== S.me.id);
    const fresh = data.messages.some(m => { const old = messages.get(m.id); return !old || old.updatedAt !== m.updatedAt; });
    merge(data);
    if (fresh) render();
    if (incoming.length) {
      sfx(otherId ? 'dm' : 'msg');
      if (urls.read && !document.hidden) markRead();
      refreshContacts();
    }
  }
  async function loadOlder() {
    const first = Math.min(...messages.keys());
    const data = await api(`${urls.list}?before=${first}`);
    if (!data) return;
    if (data.messages.length < 60) hasOlder = false;
    const sync = lastSync;
    merge(data);
    lastSync = sync;
    render(false);
  }
  async function submit() {
    const text = input.value.trim();
    if (!text) return;
    sendBtn.disabled = true;
    try {
      if (editing) {
        const data = await send('PATCH', urls.edit(editing.id), { text });
        messages.set(data.message.id, data.message);
      } else {
        const data = await send('POST', urls.post, { text, replyTo: replyTo?.id || null });
        messages.set(data.message.id, data.message);
        if (!otherId) { storageSet('uzp_chat_read', data.message.id); ctx.onChatRead?.(data.message.id); }
      }
      input.value = '';
      input.style.height = '';
      setContext(null);
            render(true);
      refreshContacts();
    } catch (err) {
      handleActionError(err);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') setContext(null);
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  });

  // ---------- chap ustun: umumiy chat va xodimlar ----------
  const contactsBox = h('div', { class: 'chat-contacts' });
  let contacts = [];
  let contactFilter = '';
  function renderContacts() {
    const needle = contactFilter.toLowerCase();
    const rows = contacts.filter(c => !needle || c.name.toLowerCase().includes(needle));
    replaceKids(contactsBox, rows.length ? rows.map(c => h('a', { class: `chat-contact${c.id === otherId ? ' active' : ''}`, href: `#/chat/dm/${c.id}`, 'aria-current': c.id === otherId ? 'page' : null },
      h('span', { class: 'avatar-wrap' }, avatar(c.avatar, c.name, 40), c.online ? h('span', { class: 'online-dot', title: 'Onlayn' }) : null),
      h('span', { class: 'contact-text' },
        h('span', { class: 'contact-name' }, highlight(c.name, contactFilter), rolePill(c.role, c.roleColor, true)),
        h('span', { class: 'contact-last' }, c.lastBody !== null ? `${c.lastMine ? 'Siz: ' : ''}${c.lastBody || "Xabar o'chirildi"}` : 'Hali yozishmagansiz')),
      h('span', { class: 'contact-side' },
        c.lastAt ? h('time', null, fmtAgo(c.lastAt)) : null,
        c.unread ? h('span', { class: 'count-dot' }, c.unread) : null))) : h('div', { class: 'note contact-empty' }, contacts.length ? 'Hech kim topilmadi.' : 'Boshqa xodim panelga kira olmaydi.'));
  }
  async function refreshContacts() {
    const data = await api('/api/dm').catch(() => null);
    if (!data) return;
    contacts = data.contacts;
    renderContacts();
  }

  const first = await api(urls.list);
  if (!first) return ctx.notFound('Bu xodim bilan yozishib bo\'lmaydi.');
  merge(first);
  hasOlder = (first.messages.length || 0) >= 60;
  await refreshContacts();
  ctx.every(3000, poll);
  ctx.every(15000, refreshContacts);
  markRead();
  document.title = `${otherId ? other?.name || 'Shaxsiy xabar' : 'Umumiy chat'} · UzTiers Panel`;
  setTimeout(() => { render(true); input.focus(); }, 0);

  const threadHead = otherId
    ? h('div', { class: 'thread-head' },
        avatar(other?.avatar, other?.name, 42),
        h('div', { class: 'grow' }, h('a', { class: 'thread-name', href: `#/staff/${otherId}` }, other?.name || 'Xodim'), h('div', { class: 'note' }, icon('lock'), " Faqat siz ikkingiz ko'rasiz")),
        rolePill(other?.role, other?.roleColor, true))
    : h('div', { class: 'thread-head' },
        h('span', { class: 'thread-ico' }, icon('hash')),
        h('div', { class: 'grow' }, h('div', { class: 'thread-name' }, 'Umumiy chat'), h('div', { class: 'note' }, "Panelga kira oladigan hamma xodim ko'radi")));

  return [
    h('div', { class: 'chat-layout' },
      h('aside', { class: 'card chat-side' },
        h('h1', { class: 'title-small' }, 'Chat'),
        h('a', { class: `chat-contact general${otherId ? '' : ' active'}`, href: '#/chat', 'aria-current': otherId ? null : 'page' },
          h('span', { class: 'thread-ico' }, icon('hash')),
          h('span', { class: 'contact-text' }, h('span', { class: 'contact-name' }, 'Umumiy chat'), h('span', { class: 'contact-last' }, 'Hamma xodimlar'))),
        h('div', { class: 'chat-side-title' }, 'Shaxsiy xabarlar'),
        searchBar({ id: 'chat-contact-search', placeholder: 'Xodim qidirish…', oninput: value => { contactFilter = value; renderContacts(); } }),
        contactsBox),
      h('section', { class: 'card chat-card' },
        threadHead,
        h('div', { class: 'thread-search' }, searchBar({ id: 'chat-search', placeholder: 'Xabarlardan qidirish…', oninput: value => { filter = value; render(false); } })),
        list,
        h('form', { class: 'chat-composer', onsubmit: e => { e.preventDefault(); submit(); } }, composerNote, h('div', { class: 'chat-row' }, input, sendBtn))))
  ];
}
