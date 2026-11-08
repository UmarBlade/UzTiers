'use strict';
// Sahifa chizilishidan oldin saqlangan ko'rinishni qo'yadi, shunda shrift va o'lcham miltillamaydi.
(function () {
  var look = {};
  try { look = JSON.parse(localStorage.getItem('uzp_look') || '{}') || {}; } catch (e) { look = {}; }
  var root = document.documentElement;
  var fresh = look.v === 2;
  root.dataset.size = look.size || 'normal';
  root.dataset.font = fresh && look.font ? look.font : 'golos';
  root.dataset.motion = look.motion || 'on';
})();
