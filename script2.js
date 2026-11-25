
(function appShell() {
  const main = document.querySelector('main');
  if (!main || document.getElementById('appNav')) return;
  const cards = Array.from(main.querySelectorAll(':scope > section.card'));
  const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const safe = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const page = (id, title) => { const e = mk('section', 'app-page'); e.id = id; e.setAttribute('aria-label', title); main.appendChild(e); return e; };
  const home = page('page-home', 'Главная'), check = page('page-check', 'Проверка'), result = page('page-result', 'Результат'),
        tools = page('page-tools', 'Справка'), history = page('page-history', 'История'), settings = page('page-settings', 'Настройки');
  const hasKey = () => { try { return !!(document.getElementById('key').value.trim() || localStorage.getItem(PROVIDERS[curProvider()].keyName)); } catch (e) { return false; } };

  /* Главная */
  home.appendChild(mk('div', 'home-hero', '<h2>Проверим домашнее задание?</h2><p>Сфотографируйте работу или загрузите документ. Нейросеть найдёт ошибки и объяснит правила.</p><button class="home-cta" id="startCheck"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4Z"/><circle cx="12" cy="13" r="3.5"/></svg> Проверить домашнее задание</button>'));
  const warn = mk('div', 'warn', '<strong>Нужен ключ нейросети</strong><p>Без ключа проверка не заработает. Его нужно вставить один раз.</p><button id="goKey" type="button">Открыть настройки</button>');
  warn.hidden = hasKey(); home.appendChild(warn);
  home.appendChild(mk('div', 'card', '<h2>Как это работает</h2><ol class="steps"><li>Сфотографируйте страницу тетради.</li><li>Проверьте, как прочитался текст, и поправьте при необходимости.</li><li>Получите ошибки с правилами, памятку и презентацию.</li></ol>'));
  home.appendChild(mk('div', 'home-shortcuts', '<button type="button" data-go="page-history"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><br>История и прогресс</button><button type="button" data-go="page-tools">✎<br>Справка и разборы</button>'));

  /* Раскладка карточек по страницам */
  cards.forEach(card => {
    const h = ((card.querySelector('h2') || {}).textContent || '').trim();
    if (h.includes('Нейросеть и ключ')) settings.appendChild(card);
    else if (h.includes('Фото работы') || h.includes('Текст ученика')) check.appendChild(card);
    else if (h.includes('Результат')) result.appendChild(card);
    else tools.appendChild(card);
  });
  const resEmpty = mk('div', 'card', '<h2>Результат</h2><p class="hint">Здесь появится результат проверки: ошибки, памятка и презентация. Сначала загрузите фото и проверьте работу.</p>');
  result.insertBefore(resEmpty, result.firstChild);
  settings.appendChild(mk('div', 'card', '<h2>Данные</h2><p class="hint">История проверок хранится только на этом устройстве, вместе с текстом работ. Если телефон общий, очищайте её.</p><div class="row"><button type="button" id="clearHist" class="alt">Очистить историю проверок</button><button type="button" id="resetTheme" class="alt">Тема как в системе</button></div>'));

  /* История и прогресс */
  history.appendChild(mk('div', 'card', '<h2>Прогресс</h2><div id="progressStats" class="stat-grid"></div><h3>Частые типы ошибок</h3><div id="weakTopics"></div>'));
  history.appendChild(mk('div', 'card', '<h2>Предыдущие проверки</h2><div id="historyList"></div>'));

  /* Нижняя навигация */
  const nav = mk('nav', 'app-nav'); nav.id = 'appNav'; nav.setAttribute('aria-label', 'Основная навигация');
  [['page-home', '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9.5 20v-6h5v6"/></svg>', 'Главная'], ['page-check', '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', 'Проверка'], ['page-result', '<svg viewBox="0 0 24 24"><path d="m5 12 4.2 4.2L19 6.5"/></svg>', 'Результат'], ['page-tools', '<svg viewBox="0 0 24 24"><path d="M4 20 15.5 8.5M7 4.5l3 3-2 2-3-3Zm9-1 4.5 4.5-2 2L14 7.5Z"/></svg>', 'Справка'], ['page-history', '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.6-6.4M3 4v4h4M12 7v5l3.2 2"/></svg>', 'История'], ['page-settings', '<svg viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 13.5 1.2 1.8-2 2-1.8-1.2a7 7 0 0 1-1.6.7l-.4 2.1h-2.8l-.4-2.1a7 7 0 0 1-1.6-.7L8.2 19.3l-2-2 1.2-1.8a7 7 0 0 1-.7-1.6l-2.1-.4v-2.8l2.1-.4a7 7 0 0 1 .7-1.6L5.4 6.9l2-2 1.8 1.2a7 7 0 0 1 1.6-.7l.4-2.1H14l.4 2.1a7 7 0 0 1 1.6.7l1.8-1.2 2 2-1.2 1.8a7 7 0 0 1 .7 1.6l2.1.4v2.8l-2.1.4a7 7 0 0 1-.7 1.6Z"/></svg>', 'Настройки']]
    .forEach(([id, icon, label]) => { const b = mk('button', '', '<span class="ic">' + icon + '</span><span>' + label + '</span>'); b.type = 'button'; b.dataset.go = id; nav.appendChild(b); });
  document.body.appendChild(nav);

  /* История */
  const readHistory = () => { try { return JSON.parse(localStorage.getItem('proverdz-history') || '[]'); } catch (e) { return []; } };
  function writeHistory(a) {
    const list = a.slice(0, 100);
    try {
      let t = JSON.stringify(list);
      while (t.length > 2 * 1024 * 1024 && list.length > 1) { list.pop(); t = JSON.stringify(list); }
      localStorage.setItem('proverdz-history', t);
    } catch (e) {
      try { localStorage.setItem('proverdz-history', JSON.stringify(list.slice(0, Math.max(1, Math.floor(list.length / 2))))); } catch (e2) {}
    }
  }
  const hm = mk('div', 'modal'); hm.id = 'histModal';
  hm.innerHTML = '<div class="sheet"><div id="hmBody"></div><div class="row"><button type="button" id="hmClose" class="alt">Закрыть</button></div></div>';
  document.body.appendChild(hm);
  let releaseHistTrap = null, histFocused = null;
  const closeHist = () => { hm.classList.remove('on'); if (releaseHistTrap) { releaseHistTrap(); releaseHistTrap = null; } if (histFocused && histFocused.focus) histFocused.focus(); };
  hm.addEventListener('click', e => { if (e.target === hm) closeHist(); });
  hm.querySelector('#hmClose').addEventListener('click', closeHist);
  function openHist(x) {
    histFocused = document.activeElement;
    const b = hm.querySelector('#hmBody'); b.textContent = '';
    b.appendChild(mk('h2', '', safe(x.subject || 'Проверка')));
    b.appendChild(mk('p', 'hint', safe(x.date || '') + ' · ошибок: ' + (x.count || 0)));
    const errs = x.errors || [];
    if (x.studentText && errs.length && typeof annotated === 'function') b.appendChild(annotated(x.studentText, errs));
    else if (x.studentText) { const t = mk('div', 'annot'); t.textContent = x.studentText; b.appendChild(t); }
    errs.forEach(e => {
      const w = mk('div', 'err');
      if (typeof markEl === 'function') w.appendChild(markEl(e)); else w.appendChild(mk('span', 'bad', safe(e.fragment)));
      w.appendChild(document.createTextNode(' → '));
      w.appendChild(mk('span', 'good', safe(e.correction)));
      w.appendChild(mk('div', 'meta', safe((e.type || 'ошибка') + '. ' + (e.rule || ''))));
      b.appendChild(w);
    });
    if (x.summary) b.appendChild(mk('p', 'sum', safe(x.summary)));
    hm.classList.add('on');
    if (!releaseHistTrap) releaseHistTrap = trapFocus(hm);
    const c = hm.querySelector('#hmClose'); if (c) c.focus();
  }
  function drawHistory() {
    const box = document.getElementById('historyList'), a = readHistory(); box.textContent = '';
    if (!a.length) { box.appendChild(mk('p', 'hint', 'Пока нет проверок. Выполните первую проверку домашнего задания.')); return; }
    a.forEach((x, i) => {
      const d = mk('div', 'history-item', '<strong>' + safe(x.subject || 'Предмет не указан') + '</strong><br><small>' + safe(x.date || '') + ' · ошибок: ' + (x.count || 0) + '</small><p>' + safe(x.summary || '') + '</p>');
      const row = mk('div', 'row');
      const open = mk('button', 'alt', 'Открыть'), del = mk('button', 'alt', 'Удалить');
      open.type = del.type = 'button';
      open.onclick = () => openHist(x);
      del.onclick = () => { const h = readHistory(); h.splice(i, 1); writeHistory(h); drawHistory(); drawProgress(); };
      row.appendChild(open); row.appendChild(del); d.appendChild(row); box.appendChild(d);
    });
  }
  function drawProgress() {
    const a = readHistory(), total = a.length, errors = a.reduce((n, x) => n + (x.count || 0), 0), subjects = new Set(a.map(x => x.subject).filter(Boolean));
    document.getElementById('progressStats').innerHTML =
      '<div class="stat"><strong>' + total + '</strong><span>Проверок</span></div><div class="stat"><strong>' + errors + '</strong><span>Найдено ошибок</span></div>' +
      '<div class="stat"><strong>' + subjects.size + '</strong><span>Предметов</span></div><div class="stat"><strong>' + (total ? Math.round(errors / total * 10) / 10 : 0) + '</strong><span>Ошибок на проверку</span></div>';
    const counts = {}; a.forEach(x => (x.types || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
    const sorted = Object.entries(counts).sort((x, y) => y[1] - x[1]).slice(0, 5), w = document.getElementById('weakTopics'); w.textContent = '';
    if (!sorted.length) w.appendChild(mk('p', 'hint', 'Пока недостаточно данных.'));
    sorted.forEach(([k, v]) => w.appendChild(mk('div', 'history-item', safe(k) + ' — ' + v)));
  }
  document.getElementById('resetTheme').addEventListener('click', () => { if (window.proverdzResetTheme) window.proverdzResetTheme(); });
  document.getElementById('clearHist').addEventListener('click', () => { if (confirm('Удалить всю историю проверок на этом устройстве?')) { writeHistory([]); drawHistory(); drawProgress(); } });

  /* Переключение страниц */
  function show(id) {
    document.querySelectorAll('.app-page').forEach(x => { x.hidden = x.id !== id; x.classList.remove('page-enter'); });
    const visiblePage = document.getElementById(id); if (visiblePage) { void visiblePage.offsetWidth; visiblePage.classList.add('page-enter'); }
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.go === id));
    document.body.classList.toggle('sub-page', id !== 'page-home');
    window.scrollTo(0, 0);
    if (id === 'page-home') warn.hidden = hasKey();
    if (id === 'page-result') resEmpty.hidden = !document.getElementById('resCard').hidden;
    if (id === 'page-history') { drawHistory(); drawProgress(); }
  }
  document.body.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-go]'); if (b) show(b.dataset.go); });
  document.getElementById('startCheck').addEventListener('click', () => show(hasKey() ? 'page-check' : 'page-settings'));
  document.getElementById('goKey').addEventListener('click', () => show('page-settings'));
  window.proverdzShowPage = show;
  window.proverdzSaveCheck = entry => {
    const a = readHistory();
    if (a[0] && a[0].studentText === entry.studentText && a[0].subject === entry.subject) a[0] = entry; else a.unshift(entry);
    writeHistory(a);
  };
  window.proverdzRefresh = () => { warn.hidden = hasKey(); };
  show('page-home');
})();
