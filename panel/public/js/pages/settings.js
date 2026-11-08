// Ko'rinish: shrift, matn o'lchami, harakat va tovush.
import { S, h } from '../core.js';
import { FONTS, getLook, setLook, sfx } from '../look.js';
import { icon, segmented, card } from '../ui.js';

function toggle(label, hint, key) {
  const input = h('input', { type: 'checkbox', checked: getLook()[key], onchange: e => { setLook({ [key]: e.target.checked }); } });
  return h('label', { class: 'switch-row' },
    h('span', { class: 'switch-text' }, h('b', null, label), h('small', null, hint)),
    h('span', { class: 'switch' }, input, h('i')));
}

export async function pageSettings() {
  document.title = "Ko'rinish · UzTiers Panel";
  const look = getLook();
  const sounds = [['ok', 'Muvaffaqiyat'], ['msg', 'Xabar'], ['dm', 'Shaxsiy xabar'], ['bell', "Qo'ng'iroq"]];
  return [
    h('div', { class: 'page-head' }, h('div', { class: 'grow' }, h('h1', null, "Ko'rinish"), h('div', { class: 'sub' }, 'Bu sozlamalar faqat shu brauzerda saqlanadi.'))),
    card('Matn', null,
      h('div', { class: 'setting-row' }, h('b', null, "Matn o'lchami"), segmented([['normal', "O'rtacha"], ['large', 'Katta'], ['huge', 'Juda katta']], look.size, value => setLook({ size: value }), { label: "Matn o'lchami" })),
      h('div', { class: 'setting-row' }, h('b', null, 'Shrift'), segmented(FONTS, look.font, value => setLook({ font: value }), { label: 'Shrift' }))),
    card('Harakat', null,
      h('div', { class: 'setting-row' }, h('span', null, h('b', null, 'Animatsiya'), h('div', { class: 'note' }, "Sahifa bo'laklari yumshoq ko'tarilib chiqadi, menyular silliq ochiladi. Sekin kompyuterda o'chirib qo'yish mumkin.")), segmented([['on', 'Yoqilgan'], ['off', "O'chiq"]], look.motion, value => setLook({ motion: value }), { label: 'Animatsiya' }))),
    card('Tovush', null,
      toggle('Tovushlar', 'Xabarlar, amallar va bildirishnomalar uchun', 'sound'),
      h('div', { class: 'setting-row' },
        h('label', { for: 'look-volume' }, h('b', null, 'Ovoz balandligi')),
        h('input', { id: 'look-volume', class: 'range', type: 'range', min: 5, max: 100, value: look.volume, onchange: e => { setLook({ volume: Number(e.target.value) }); sfx('ok'); } })),
      h('div', { class: 'setting-row' }, h('b', null, "Eshitib ko'rish"), h('div', { class: 'controls' }, sounds.map(([name, text]) => h('button', { class: 'btn small', type: 'button', onclick: () => sfx(name) }, icon('sound'), text))))),
    h('a', { class: 'card setting-link', href: `#/staff/${S.me.id}` }, icon('pencil'), h('span', { class: 'grow' }, h('b', null, 'Profilingiz'), h('small', null, 'Bio, holat va ish vaqtini profilingizda yozing.')), icon('chevron'))
  ];
}
