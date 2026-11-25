
const $ = id => document.getElementById(id);
const PROVIDERS = {
  giga: { name: 'GigaChat', models: ['GigaChat-2-Max', 'GigaChat-2-Pro', 'GigaChat-2'], keyName: 'pdz_giga_key',
    hint: 'Бесплатный пакет токенов для физлиц. Ключ: developers.sber.ru → проект GigaChat API → «Ключ авторизации». Нужен сертификат Минцифры (в APK он встроен, на компьютере установите его в систему).' },
  gemini: { name: 'Gemini', models: ['gemini-3.5-flash-lite'], keyName: 'pdz_gemini_key',
    hint: 'Gemini API: доступен бесплатный тариф с ограничениями. Для наиболее стабильного доступа в некоторых регионах может понадобиться VPN. Создайте ключ в Google AI Studio (подробная инструкция ниже). Фото поддерживаются.' },
  deepseek: { name: 'DeepSeek', models: ['deepseek-flash'], keyName: 'pdz_deepseek_key',
    hint: 'Платный API (оплата по использованию, бесплатного безлимита нет), одна проверка страницы обычно стоит меньше цента. Ключ: platform.deepseek.com. Поддерживаются фото JPEG, PNG, GIF, WebP.' }
};
let MODELS = PROVIDERS.giga.models.slice(), media = null, last = null, slides = [], si = 0, deckTitle = '', deckTarget = 'extra', taskExtra = '';

function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }

/* ---------- Переключение темы ---------- */
(function initTheme(){
  const root = document.documentElement, btn = $('themeToggle'), meta = document.querySelector('meta[name="theme-color"]');
  const sys = () => (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  const apply = t => {
    root.setAttribute('data-theme', t);
    if (meta) meta.setAttribute('content', t === 'dark' ? '#141824' : '#f7f9fc');
    const dark = t === 'dark', label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    btn.innerHTML = dark ? '<svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2m10-10h-2M4 12H2m17.07-7.07-1.42 1.42M6.35 17.65l-1.42 1.42m14.14 0-1.42-1.42M6.35 6.35 4.93 4.93"/></svg>' : '<svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.4A9.5 9.5 0 0 1 8.6 3.6a9.6 9.6 0 1 0 11.8 11.8Z"/></svg>'; btn.setAttribute('aria-pressed', String(dark)); btn.setAttribute('aria-label', label); btn.title = label;
  };
  apply(store('proverdz-theme') || sys());
  btn.addEventListener('click', () => { const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; store('proverdz-theme', next); apply(next); });
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)'), h = () => { if (!store('proverdz-theme')) apply(sys()); };
    if (mq.addEventListener) mq.addEventListener('change', h); else if (mq.addListener) mq.addListener(h);
  }
  window.proverdzResetTheme = () => { try { localStorage.removeItem('proverdz-theme'); } catch (e) {} apply(sys()); };
})();

/* ---------- Промпты ---------- */
function recognitionPrompt() {
  const subject = $('subject').value;
  return [
    'Ты — точный транскрибатор школьной работы по предмету «' + subject + '». Дословно перепиши рукописный текст, формулы, вычисления, обозначения, нумерацию и ответы с изображения.',
    'Не исправляй ошибки ученика, не решай задания и не дополняй пропуски. Сохраняй исходное написание, знаки, единицы измерения, дроби, степени, индексы, формулы и структуру строк насколько возможно.',
    'Читай буквы, а не смысл: не подставляй «правильное» слово, если написано другое, и не исправляй молча. Для английского и других иностранных языков сохраняй оригинальный язык и орфографию, не переводи. Математические и физические выражения записывай в читаемом текстовом виде, например x^2, 1/3, H2O, F=ma.',
    'Печатный текст условия можно пропустить, если он не является частью ответа ученика. Пометки учителя и исправления поверх текста не переписывай.',
    'Нечитаемое слово отмечай как [?слово?], полностью нечитаемое место — [неразборчиво]. Верни только расшифровку без пояснений.',
    'Если на фото нет ученической работы, ответь одним словом: НЕТ_ТЕКСТА.'
  ].join('\n');
}

function refinePrompt(draft) {
  return [
'Ниже — черновая расшифровка рукописного текста с этого фото. Сверь её с фото строка за строкой и верни исправленную расшифровку.',
'Исправляй только расхождения с тем, что действительно написано на фото: неверно прочитанные буквы, пропущенные или лишние слова, потерянные знаки препинания и абзацы.',
'Не исправляй ошибки ученика и не улучшай текст: если написано «жывёт», так и оставь.',
'Слово, в котором всё ещё не уверен, помечай как [?слово?]. Пометки учителя не переписывай.',
'Верни только итоговый текст, без пояснений.',
'',
'Черновик:',
draft].join('\n');
}

function checkPrompt(text, task) {
  const subject = $('subject').value;
  const guidance = {
    'Русский язык': 'Работай по шагам (не выводи их): разбей текст на предложения; найди грамматические основы, однородные члены, обособленные обороты, вводные слова, обращения, прямую речь, части сложного предложения; проверь знаки препинания; проверь орфограммы (безударные гласные, парные и непроизносимые согласные, -тся/-ться, не/ни, н/нн, слитное, раздельное и дефисное написание, приставки, ь и ъ, заглавные буквы); проверь грамматику и речь. Не считай ошибкой «е» вместо «ё» и допустимую вариативность пунктуации.',
    'Математика': 'Проверь каждое вычисление и преобразование по шагам, знаки, порядок действий, дроби, проценты, уравнения, единицы и итоговый ответ. Не считай альтернативный корректный способ ошибкой. Если исходных данных недостаточно, укажи это.',
    'Алгебра': 'Проверь преобразования выражений, формулы, уравнения и неравенства, ОДЗ, корни, графики, вычисления и проверку ответа.',
    'Геометрия': 'Проверь чертёжные обозначения, данные, теоремы, логическую последовательность доказательства, вычисления, единицы и ответ. Не требуй единственного способа доказательства.',
    'Литература': 'Проверь понимание произведения, фактическую точность, аргументацию, анализ героев и цитат, композицию и соответствие вопросу. Разделяй фактические ошибки и допустимую интерпретацию.',
    'Английский язык': 'Проверь грамматику, времена, порядок слов, лексику, орфографию, артикли, предлоги и соответствие заданию. Не переводи текст и учитывай допустимые варианты английского.',
    'Другой иностранный язык': 'Определи язык по работе и проверь грамматику, лексику, орфографию, формы слов и соответствие заданию. Не переводи и не подменяй исходный язык.',
    'История': 'Проверь даты, последовательность событий, исторические термины, участников, причины и последствия. Не выдумывай спорные факты; отмечай неоднозначность.',
    'Обществознание': 'Проверь определения, термины, классификации, правовые и социальные понятия, аргументацию и соответствие школьной программе.',
    'Биология': 'Проверь биологические термины, строение и функции, классификацию, процессы, причинно-следственные связи и подписи к схемам.',
    'География': 'Проверь географические понятия, объекты, расположение, климатические и природные процессы, карты, числовые данные и единицы.',
    'Физика': 'Проверь физические законы, формулы, обозначения, подстановку величин, единицы СИ, преобразования, расчёты и размерность ответа.',
    'Химия': 'Проверь формулы веществ, валентность и степени окисления, уравнения реакций, коэффициенты, расчёты, единицы и химические термины.',
    'Информатика': 'Проверь алгоритмы, код, синтаксис, логику, таблицы, системы счисления, вычисления и ожидаемый результат. Учитывай язык программирования и версию, если указаны.',
    'Окружающий мир': 'Проверь базовые естественно-научные и обществоведческие знания начальной школы, термины, факты и соответствие вопросу.',
    'Другое': 'Определи предмет и тип задания по контексту. Проверь фактическую точность, ход решения и соответствие условию; если предмет определить нельзя, попроси уточнить его в summary.'
  };
  return [
    'Ты — внимательный школьный учитель-проверяющий по предмету «' + subject + '». Проверяй на уровне школьной программы. Критерии: ' + (guidance[subject] || guidance['Другое']),
    task ? 'Задание и контекст от учителя: ' + task : 'Если условие задания не приложено, оценивай только то, что можно достоверно проверить по работе.',
    'Не выдумывай ошибки. При сомнении укажи confidence «средняя» и объясни причину. Не считай допустимые альтернативные решения ошибками.',
    'Не оценивай фрагменты [?...?] и [неразборчиво]. fragment должен быть точной цитатой из работы. Для ошибки в вычислении или рассуждении цитируй минимальный фрагмент, который однозначно указывает на проблему. correction содержит исправленный вариант или правильный шаг. rule объясняет конкретную причину.',
    'Каждую ошибку перечисляй отдельно. Если ошибок нет, верни пустой массив errors. В summary кратко укажи качество работы и темы, которые стоит повторить.',
    'mark — тот же fragment, но с отмеченным местом ошибки: ошибочные символы заключи в квадратные скобки, например «ж[ы]вёт», «2+2=[5]». Если знак препинания пропущен, поставь [^] на его место: «пришёл[^] и вышло солнце». Если знак лишний, заключи его в скобки: «а[,] потом». Без скобок и [^] mark должен совпадать с fragment.',
    'Верни только JSON без markdown в формате:',
    '{"errors":[{"fragment":"...","mark":"...","type":"факт|вычисление|формула|термин|орфография|пунктуация|грамматика|логика|другое","rule":"...","correction":"...","confidence":"высокая|средняя"}],"summary":"2-3 предложения для ученика или учителя"}',
    'Работа ученика:', '"""', text, '"""'
  ].join('\n');
}

function el(tag, cls, txt) { const n = document.createElement(tag); if (cls) n.className = cls; if (txt) n.textContent = txt; return n; }


/* ---------- Учебники по предметам (подсказки при вводе, можно вписать свой) ---------- */
const BOOKS = {
  'Русский язык': ['Ладыженская Т.А., Баранов М.Т., Тростенцова Л.А. и др.','Львова С.И., Львов В.В.','Разумовская М.М., Львова С.И., Капинос В.И. и др.','Бунеев Р.Н., Бунеева Е.В., Комиссарова Л.Ю. и др.','Гольцова Н.Г., Шамшин И.В., Мищерина М.А. (10–11 кл.)','Власенков А.И., Рыбченкова Л.М. (10–11 кл.)','Рыбченкова Л.М., Александрова О.М. и др.','Бабайцева В.В., Чеснокова Л.Д.','Канакина В.П., Горецкий В.Г. (1–4 кл.)','Рамзаева Т.Г. (1–4 кл.)'],
  'Математика': ['Виленкин Н.Я., Жохов В.И., Чесноков А.С. и др.','Никольский С.М., Потапов М.К., Решетников Н.Н. и др.','Мерзляк А.Г., Полонский В.Б., Якир М.С.','Дорофеев Г.В., Петерсон Л.Г.','Зубарева И.И., Мордкович А.Г.','Моро М.И., Бантова М.А., Бельтюкова Г.В. (1–4 кл.)','Петерсон Л.Г. (1–4 кл.)'],
  'Алгебра': ['Макарычев Ю.Н., Миндюк Н.Г., Нешков К.И. и др.','Мордкович А.Г., Семёнов П.В.','Никольский С.М., Потапов М.К. и др.','Мерзляк А.Г., Полонский В.Б., Якир М.С.','Алимов Ш.А., Колягин Ю.М. и др.','Колягин Ю.М., Ткачёва М.В. и др.'],
  'Геометрия': ['Атанасян Л.С., Бутузов В.Ф., Кадомцев С.Б. и др.','Погорелов А.В.','Мерзляк А.Г., Полонский В.Б., Якир М.С.','Бутузов В.Ф., Кадомцев С.Б., Прасолов В.В.'],
  'Литература': ['Коровина В.Я., Журавлёв В.П., Коровин В.И.','Меркин Г.С.','Курдюмова Т.Ф.','Беленький Г.И.','Чертов В.Ф., Трубина Л.А. и др.','Сухих И.Н.'],
  'Английский язык': ['Афанасьева О.В., Михеева И.В. (Rainbow English)','Биболетова М.З., Денисенко О.А., Трубанева Н.Н. (Enjoy English)','Ваулина Ю.Е., Дули Д., Подоляко О.Е. и др. (Spotlight)','Вербицкая М.В., Эббс Б., Уорелл Э. и др. (Forward)','Комарова Ю.А., Ларионова И.В., Перретт Ж. (Brilliant)','Кузовлев В.П., Лапа Н.М., Перегудова Э.Ш. и др.'],
  'Другой иностранный язык': ['Немецкий: Бим И.Л., Рыжова Л.И.','Немецкий: Радченко О.А., Хебелер Г.','Французский: Кулигина А.С., Кирьянова М.Г.','Испанский: Анурова И.В., Соловцова Э.И.'],
  'История': ['Вигасин А.А., Годер Г.И., Свенцицкая И.С. (5 кл.)','Агибалова Е.В., Донской Г.М. (6 кл.)','Юдовская А.Я., Баранов П.А., Ванюшкина Л.М.','Арсентьев Н.М., Данилов А.А. и др. (под ред. Торкунова)','Данилов А.А., Косулина Л.Г.','Загладин Н.В., Минаков С.Т. и др.','Сороко-Цюпа О.С., Сороко-Цюпа А.О.'],
  'Обществознание': ['Боголюбов Л.Н., Виноградова Н.Ф. и др.','Кравченко А.И., Певцова Е.А.','Никитин А.Ф., Никитина Т.И.','Соболева О.Б., Корсун Р.П. и др.','Котова О.А., Лискова Т.Е.'],
  'Биология': ['Пасечник В.В., Суматохин С.В. и др.','Пономарёва И.Н., Корнилова О.А. и др.','Сонин Н.И., Сапин М.Р.','Сивоглазов В.И., Агафонова И.Б., Захарова Е.Т.','Беляев Д.К., Дымшиц Г.М. и др.','Плешаков А.А., Сонин Н.И. (5–6 кл.)'],
  'География': ['Климанова О.А., Климанов В.В. и др.','Дронов В.П., Савельева Л.Е.','Алексеев А.И., Николина В.В. и др.','Домогацких Е.М., Алексеевский Н.И.','Летягин А.А., Дронов В.П.','Максаковский В.П. (10–11 кл.)'],
  'Физика': ['Пёрышкин А.В.','Пёрышкин А.В., Гутник Е.М.','Пинский А.А., Разумовский В.Г.','Громов С.В., Родина Н.А.','Мякишев Г.Я., Буховцев Б.Б., Сотский Н.Н.','Касьянов В.А.','Генденштейн Л.Э., Дик Ю.И.'],
  'Химия': ['Габриелян О.С., Остроумов И.Г., Сладков С.А.','Рудзитис Г.Е., Фельдман Ф.Г.','Кузнецова Н.Е., Титова И.М. и др.','Журин А.А.'],
  'Информатика': ['Босова Л.Л., Босова А.Ю.','Семакин И.Г., Залогова Л.А. и др.','Угринович Н.Д.','Поляков К.Ю., Ерёмин Е.А.'],
  'Окружающий мир': ['Плешаков А.А. (1–4 кл.)','Виноградова Н.Ф. (1–4 кл.)','Плешаков А.А., Новицкая М.Ю. (Перспектива)','Дмитриева Н.Я., Казаков А.Н.'],
  'Другое': []
};
function fillBooks() {
  const dl = $('bookList'), list = BOOKS[$('subject').value] || [];
  dl.textContent = '';
  list.forEach(b => { const o = document.createElement('option'); o.value = b; dl.appendChild(o); });
  $('tbBook').placeholder = list.length ? 'Начните вводить: появятся варианты' : 'Впишите название учебника';
}

function fillModels(list, pick) {
  MODELS = list.slice(); $('model').textContent = '';
  list.forEach(n => { const o = document.createElement('option'); o.value = o.textContent = n; $('model').appendChild(o); });
  if (pick && list.includes(pick)) $('model').value = pick;
}
/* ---------- Нейросеть, ключ, модель ---------- */
const curProvider = () => $('provider').value;
function keyRefresh() {
  const v = $('key').value.trim(), info = $('keyInfo');
  if (!v) { info.textContent = 'Ключ не сохранён.'; info.style.color = 'var(--mute)'; return; }
  const masked = v.length <= 8 ? '•'.repeat(v.length) : v.slice(0, 4) + '•'.repeat(Math.min(12, v.length - 8)) + v.slice(-4);
  info.textContent = 'Сохранён ключ: ' + masked + ' (хранится только в этом браузере).'; info.style.color = 'var(--green)';
}
function loadProvider() {
  const id = curProvider(), pr = PROVIDERS[id];
  fillModels(pr.models, store('pdz_model_' + id));
  $('key').value = store(pr.keyName) || '';
  $('provHint').textContent = pr.hint;
  const guide = $('geminiGuide'); if (guide) guide.hidden = id !== 'gemini';
  keyRefresh();
}
$('provider').value = store('pdz_provider') || 'giga';
$('provider').addEventListener('change', () => { store('pdz_provider', $('provider').value); loadProvider(); if (window.proverdzRefresh) window.proverdzRefresh(); });
$('key').addEventListener('input', keyRefresh);
$('key').addEventListener('change', () => { store(PROVIDERS[curProvider()].keyName, $('key').value.trim()); keyRefresh(); if (window.proverdzRefresh) window.proverdzRefresh(); });
$('keyToggle').addEventListener('click', () => {
  const show = $('key').type === 'password';
  $('key').type = show ? 'text' : 'password'; $('keyToggle').innerHTML = show ? '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a14 14 0 0 1-3.2 3.8M6.2 6.2C3.6 8.1 2 12 2 12s3.5 7 10 7a10.5 10.5 0 0 0 4-.8"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>'; 
  $('keyToggle').setAttribute('aria-label', show ? 'Скрыть ключ' : 'Показать ключ');
});
$('model').addEventListener('change', () => store('pdz_model_' + curProvider(), $('model').value));
$('subject').value = store('pdz_subject') || 'Русский язык';
$('subject').addEventListener('change', () => { store('pdz_subject', $('subject').value); fillBooks(); });
loadProvider(); fillBooks();

async function errText(r) { try { const j = await r.json(); return (j.error && j.error.message) || ''; } catch (e) { return ''; } }

/* ---------- Загрузка файла ---------- */
function toB64(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(new Error('Не удалось прочитать файл.'));
    fr.readAsDataURL(file);
  });
}
function decode(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    img.src = url;
  });
}
async function handleFile(f) {
  if (!f) return;
  $('msg1').textContent = ''; media = null; $('preview').style.display = 'none';
  const name = f.name || 'фото';
  if (f.size > 18 * 1024 * 1024) { $('msg1').textContent = 'Файл слишком большой (больше 18 МБ). Сделайте фото поменьше.'; return; }
  try {
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(name);
    if (isPdf) {
      throw new Error('PDF пока не поддерживается. Сохраните страницы как фото JPG или PNG и загрузите их.');
    } else {
      try {
        const img = await decode(f), k = Math.min(1, 1800 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const data = c.toDataURL('image/jpeg', 0.88);
        media = { mime: 'image/jpeg', b64: data.split(',')[1] };
        $('preview').src = data; $('preview').style.display = 'block';
      } catch (e) {
        // Браузер не открыл формат (например HEIC с iPhone): отправляем файл как есть
        const mime = f.type || 'image/jpeg';
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) throw new Error('Формат фото не поддерживается (например, HEIC с iPhone). Сделайте снимок через кнопку «Снять камерой» или сохраните фото как JPG или PNG.');
        media = { mime, b64: await toB64(f) };
      }
    }
    $('fname').textContent = 'Файл загружен: ' + name;
  } catch (e) { $('fname').textContent = ''; $('msg1').textContent = e.message; }
}
let stream = null, facing = 'environment';
function closeCam() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; $('vid').srcObject = null; $('camBox').hidden = true;
}
async function openCam() {
  $('msg1').textContent = '';
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('fCam').click(); return; }
  closeCam();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    $('vid').srcObject = stream; $('camBox').hidden = false;
  } catch (e) {
    $('msg1').textContent = 'Камера не открылась. Разрешите доступ к камере в настройках браузера (она работает только на сайте с https). Пока можно выбрать готовое фото кнопкой «Выбрать файл».';
  }
}
$('bCam').addEventListener('click', openCam);
$('bClose').addEventListener('click', closeCam);
$('bFlip').addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; openCam(); });
$('bShot').addEventListener('click', () => {
  const v = $('vid');
  if (!v.videoWidth) { $('msg1').textContent = 'Камера ещё не готова, подождите секунду.'; return; }
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  c.toBlob(b => {
    if (!b) { $('msg1').textContent = 'Не удалось сделать снимок. Попробуйте ещё раз.'; return; }
    handleFile(new File([b], 'снимок.jpg', { type: 'image/jpeg' }));
    closeCam();
  }, 'image/jpeg', 0.92);
});
$('bGal').addEventListener('click', () => $('fGal').click());
$('fCam').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
$('fGal').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
['dragenter', 'dragover'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave', 'drop'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
document.addEventListener('paste', e => {
  const it = [...(e.clipboardData ? e.clipboardData.items : [])].find(i => i.kind === 'file');
  if (it) handleFile(it.getAsFile());
});

/* ---------- Прямое обращение к DeepSeek API ---------- */
const DEEPSEEK_BASE = 'https://api.deepseek.com';
const IS_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function deepseekDirect(key, model, text, mediaPart) {
  const bad = (m, st) => ({ error: m, status: st });
  const content = [{ type: 'text', text: text || 'Проанализируй приложенный материал.' }];
  if (mediaPart) {
    if (mediaPart.mime === 'application/pdf') {
      content.push({ type: 'file', file_data: 'data:application/pdf;base64,' + mediaPart.b64, filename: 'homework.pdf' });
    } else {
      const mime = ['image/jpeg','image/png','image/gif','image/webp'].includes(mediaPart.mime) ? mediaPart.mime : 'image/jpeg';
      content.push({ type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + mediaPart.b64, detail: 'high' } });
    }
  }
  let r;
  try {
    r = await fetch(DEEPSEEK_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [{ role: 'user', content }], temperature: 0.1, max_tokens: 8192 })
    });
  } catch (e) {
    return bad('Не удалось подключиться к DeepSeek API. Проверьте интернет и доступность api.deepseek.com из вашей сети.', 0);
  }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 401 || r.status === 403) return bad('DeepSeek отклонил API-ключ. Проверьте ключ в DeepSeek Platform.', r.status);
  if (r.status === 402) return bad('Недостаточно средств на балансе DeepSeek API. Бесплатный чат DeepSeek и API-баланс — разные вещи.', r.status);
  if (r.status === 429) return bad('Превышен лимит запросов DeepSeek API. Проверьте квоту и баланс.', r.status);
  const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!t) return bad('Ошибка DeepSeek API (код ' + r.status + '). ' + ((j.error && j.error.message) || j.message || ''), r.status);
  return { text: t };
}

/* ---------- Запросы к DeepSeek ---------- */
async function deepseekCall(parts, json) {
  const key = $('key').value.trim();
  if (!key) throw new Error('Вставьте API-ключ DeepSeek в настройках приложения.');
  const text = parts.filter(p => p.text).map(p => p.text).join('\n');
  const img = parts.find(p => p.inline_data);
  const mediaPart = img ? { mime: img.inline_data.mime_type, b64: img.inline_data.data } : null;
  const model = $('model').value || 'deepseek-flash';
  let d;
  try {
    if (IS_APP) {
      d = await deepseekDirect(key, model, text, mediaPart);
    } else {
      const r = await fetch('/api/deepseek', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, model, text, media: mediaPart })
      });
      d = await r.json();
    }
  } catch (e) {
    throw new Error(IS_APP ? 'Нет связи с DeepSeek API. Проверьте интернет и доступность сервиса из вашей сети.' : 'Нет связи с сервером /api/deepseek. Для веб-версии настройте Backend-прокси DeepSeek.');
  }
  if (d.text) return d.text;
  throw new Error(d.error || 'Неизвестная ошибка DeepSeek API.');
}

/* ---------- GigaChat ---------- */
const GIGA_OAUTH = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const GIGA_BASE = 'https://gigachat.devices.sberbank.ru/api/v1';
const uuid4 = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
let gTok = null;
async function gigaDirect(key, model, text, img) {
  const bad = (m, st) => ({ error: m, status: st });
  if (!gTok || gTok.key !== key || gTok.exp < Date.now() + 60000) {
    const r = await fetch(GIGA_OAUTH, { method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json', 'RqUID': uuid4(), 'Authorization': 'Basic ' + key },
      body: 'scope=GIGACHAT_API_PERS' });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!j.access_token) return bad('Ключ авторизации не подошёл (код ' + r.status + '). Проверьте, что скопировали его целиком.', 401);
    gTok = { key, token: j.access_token, exp: j.expires_at || 0 };
  }
  const auth = { 'Authorization': 'Bearer ' + gTok.token };
  let fileId = null;
  if (img) {
    const bin = atob(img.b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const fd = new FormData();
    fd.append('purpose', 'general');
    fd.append('file', new Blob([arr], { type: img.mime }), 'work.jpg');
    const r = await fetch(GIGA_BASE + '/files', { method: 'POST', headers: auth, body: fd });
    let j = {}; try { j = await r.json(); } catch (e) {}
    if (!j.id) return bad('Не удалось загрузить фото в GigaChat (код ' + r.status + ').', r.status);
    fileId = j.id;
  }
  const msg = { role: 'user', content: text };
  const payload = { model, messages: [msg], temperature: 0.1 };
  if (fileId) { msg.attachments = [fileId]; payload.function_call = 'auto'; }
  const r = await fetch(GIGA_BASE + '/chat/completions', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', 'Accept': 'application/json' }, auth), body: JSON.stringify(payload) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 429) return bad('Лимит запросов GigaChat исчерпан. Подождите немного.', 429);
  const t = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!t) return bad('Ошибка GigaChat (код ' + r.status + '). ' + (j.message || ''), r.status);
  return { text: t };
}
async function gigaOnce(key, model, text, img) {
  try { return await gigaDirect(key, model, text, img); }
  catch (e) {
    if (IS_APP) return { error: 'Нет связи с GigaChat. Проверьте интернет и установку сертификата Минцифры в приложении.', status: 0 };
    try {
      const r = await fetch('/api/giga', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, model, text, image: img }) });
      if (r.ok) return await r.json();
    } catch (e2) {}
    return { error: 'Браузер не смог обратиться к GigaChat напрямую (CORS или сертификат Минцифры). Запустите python server.py и откройте http://localhost:8000 либо установите APK.', status: 0 };
  }
}
async function gigaCall(parts) {
  const key = $('key').value.trim();
  if (!key) throw new Error('Вставьте ключ авторизации GigaChat в настройках приложения.');
  const text = parts.filter(p => p.text).map(p => p.text).join('\n');
  const im = parts.find(p => p.inline_data);
  const img = im ? { mime: im.inline_data.mime_type, b64: im.inline_data.data } : null;
  const sel = $('model').value || MODELS[0], order = [sel].concat(MODELS.filter(n => n !== sel));
  let lastMsg = '';
  for (const model of order) {
    const d = await gigaOnce(key, model, text, img);
    if (d.text) return d.text;
    const msg = d.error || 'Неизвестная ошибка GigaChat.';
    if ([404, 429, 500, 503].includes(d.status)) { lastMsg = 'Модель ' + model + ': ' + msg; continue; }
    throw new Error(msg);
  }
  throw new Error(lastMsg + '\nПодождите немного и попробуйте снова.');
}
async function geminiCall(parts) {
  const key = $('key').value.trim();
  if (!key) throw new Error('Вставьте API-ключ Gemini в настройках приложения.');
  const contentsParts = [];
  parts.filter(p => p.text).forEach(p => contentsParts.push({ text: p.text }));
  const img = parts.find(p => p.inline_data);
  if (img) contentsParts.push({ inlineData: { mimeType: img.inline_data.mime_type || 'image/jpeg', data: img.inline_data.data } });
  const model = $('model').value || 'gemini-3.5-flash-lite';
  let r;
  try {
    r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: contentsParts }], generationConfig: { temperature: 0.1 } })
    });
  } catch (e) { throw new Error('Не удалось связаться с Gemini API. Проверьте интернет или VPN.'); }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error((j.error && j.error.message) || 'Gemini отклонил ключ или запрос. Проверьте API-ключ и доступность Gemini API.');
  if (r.status === 429) throw new Error('Бесплатный лимит Gemini исчерпан или слишком много запросов. Попробуйте позже.');
  const t = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map(x => x.text || '').join('');
  if (!t) throw new Error((j.error && j.error.message) || 'Gemini API не вернул текст (код ' + r.status + ').');
  return t;
}
async function deepseekChat(parts, json) { const id = curProvider(); return id === 'giga' ? gigaCall(parts) : id === 'gemini' ? geminiCall(parts) : deepseekCall(parts, json); }
function parseJson(raw) {
  raw = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(raw); } catch (e) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Ответ пришёл в неверном формате. Нажмите кнопку ещё раз.');
    return JSON.parse(m[0]);
  }
}
async function busy(btn, label, fn, msgId) {
  $(msgId).textContent = ''; const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + label;
  try { await fn(); } catch (e) { $(msgId).textContent = e.message; }
  btn.disabled = false; btn.innerHTML = old;
}

$('read').addEventListener('click', () => busy($('read'), 'Читаю…', async () => {
  if (!media) throw new Error('Сначала загрузите фото работы.');
  const p = recognitionPrompt();
  const got = (await deepseekChat([{ text: p }, { inline_data: { mime_type: media.mime, data: media.b64 } }], false)).trim();
  if (/^НЕТ_ТЕКСТА/.test(got)) throw new Error('На фото не найден рукописный текст. Сфотографируйте страницу ровнее и при хорошем свете.');
  $('text').value = got;
  $('text').scrollIntoView({ behavior: 'smooth', block: 'center' });
}, 'msg1'));

$('check').addEventListener('click', () => busy($('check'), 'Проверяю…', async () => {
  const text = $('text').value.trim();
  if (!text) throw new Error('Нет текста для проверки.');
  const task = [$('q').value.trim(), taskExtra].filter(Boolean).join('\n');
  const p = checkPrompt(text, task);
  const d = parseJson(await deepseekChat([{ text: p }], true));
  last = { text, d }; render(d);
}, 'msg2'));

function render(d) {
  const box = $('res'); box.textContent = ''; $('ans').textContent = ''; $('extra').textContent = '';
  const errs = Array.isArray(d.errors) ? d.errors : [];
  box.appendChild(el('p', errs.length ? '' : 'ok', errs.length ? 'Найдено ошибок: ' + errs.length : 'Ошибок не найдено.'));
  if (errs.length && last && last.text) box.appendChild(annotated(last.text, errs));
  errs.forEach(x => {
    const w = el('div', 'err');
    w.appendChild(markEl(x));
    w.appendChild(document.createTextNode(' → '));
    w.appendChild(el('span', 'good', x.correction || ''));
    w.appendChild(el('div', 'meta', (x.confidence === 'средняя' ? 'Не уверен. ' : '') + (x.type || 'ошибка') + '. ' + (x.rule || '')));
    box.appendChild(w);
  });
  if (d.summary) box.appendChild(el('p', 'sum', d.summary));
  box.appendChild(el('p', 'hint', 'Нейросеть может ошибаться. Итоговое решение и оценка за учителем.'));
  $('resCard').hidden = false;
  if (window.proverdzSaveCheck) window.proverdzSaveCheck({date:new Date().toLocaleString('ru-RU'),subject:$('subject').value,count:errs.length,summary:d.summary||'',types:errs.map(x=>x.type||'Ошибка'),errors:errs.map(x=>({fragment:x.fragment||'',mark:x.mark||'',correction:x.correction||'',type:x.type||'Ошибка',rule:x.rule||'',confidence:x.confidence||''})),studentText:last&&last.text||''});
  if (window.proverdzShowPage) window.proverdzShowPage('page-result'); else $('resCard').scrollIntoView({ behavior: 'smooth' });
}

$('copy').addEventListener('click', async () => {
  if (!last) return;
  const lines = (last.d.errors || []).map((x, i) => (i + 1) + '. ' + x.fragment + ' → ' + x.correction + ' (' + x.type + ': ' + x.rule + ')');
  const out = 'Ошибок: ' + lines.length + '\n' + lines.join('\n') + (last.d.summary ? '\n\n' + last.d.summary : '');
  try { await navigator.clipboard.writeText(out); $('copy').textContent = 'Скопировано'; } catch (e) { $('copy').textContent = 'Не удалось скопировать'; }
  setTimeout(() => { $('copy').textContent = 'Скопировать результат'; }, 2000);
});

/* ---------- Памятка ---------- */
function errSummary() {
  return (last && last.d.errors || []).map(x => x.fragment + ' → ' + x.correction + ' (' + x.rule + ')').join('; ');
}
$('bMemo').addEventListener('click', () => busy($('bMemo'), 'Готовлю…', async () => {
  if (!last || !(last.d.errors || []).length) throw new Error('Памятка строится по найденным ошибкам. Сначала проверьте работу, где есть ошибки.');
  const p = 'Составь индивидуальную памятку по предмету «' + $('subject').value + '» для ученика по его ошибкам, простым языком. Ошибки: ' + errSummary() +
    '\nВерни JSON: {"title":"...","rules":[{"rule":"название правила","explain":"объяснение в 1-2 предложениях","example":"пример"}],"exercises":["задание для тренировки (5 штук)"],"answers":["ответ к каждому упражнению"]}';
  const d = parseJson(await deepseekChat([{ text: p }], true));
  const box = $('extra'); box.textContent = ''; box.className = 'memo';
  box.appendChild(el('h3', '', d.title || 'Памятка'));
  (d.rules || []).forEach(r => {
    const w = el('div', 'err'); w.appendChild(el('b', '', r.rule || ''));
    w.appendChild(el('div', '', r.explain || '')); w.appendChild(el('div', 'meta', 'Пример: ' + (r.example || '')));
    box.appendChild(w);
  });
  box.appendChild(el('h3', '', 'Потренируйся'));
  const ol = el('ol'); (d.exercises || []).forEach(x => ol.appendChild(el('li', '', x))); box.appendChild(ol);
  const det = el('details'); det.appendChild(el('summary', '', 'Ответы'));
  const ol2 = el('ol'); (d.answers || []).forEach(x => ol2.appendChild(el('li', '', x))); det.appendChild(ol2); box.appendChild(det);
}, 'msg4'));

/* ---------- Презентация ---------- */
function showSlide() {
  const box = $(deckTarget); box.textContent = ''; box.className = '';
  const s = slides[si]; if (!s) return;
  const w = el('div', 'slide'); w.appendChild(el('h3', '', s.title || ''));
  const ul = el('ul'); (s.bullets || []).forEach(b => ul.appendChild(el('li', '', b))); w.appendChild(ul);
  if (s.example) w.appendChild(el('div', 'ex', s.example));
  if (s.task) w.appendChild(el('div', 'ex', 'Задание: ' + s.task));
  if (s.notes) w.appendChild(el('div', 'hint', 'Заметка для учителя: ' + s.notes));
  box.appendChild(w);
  const row = el('div', 'row');
  const prev = el('button', 'alt', '‹ Назад'), next = el('button', 'alt', 'Далее ›');
  prev.disabled = si === 0; next.disabled = si === slides.length - 1;
  prev.onclick = () => { si--; showSlide(); }; next.onclick = () => { si++; showSlide(); };
  row.appendChild(prev); row.appendChild(el('span', 'hint', (si + 1) + ' / ' + slides.length)); row.appendChild(next);
  box.appendChild(row);
  const row2 = el('div', 'row');
  const pp = el('button', '', 'Скачать PowerPoint'), dl = el('button', 'alt', 'Скачать HTML');
  pp.onclick = async () => { try { await downloadPptx(); } catch (e) { alert(e.message); } };
  dl.onclick = downloadDeck;
  row2.appendChild(pp); row2.appendChild(dl); box.appendChild(row2);
}
$('bSlides').addEventListener('click', () => busy($('bSlides'), 'Создаю…', async () => {
  const topic = $('topic').value.trim();
  if (!topic && !(last && (last.d.errors || []).length)) throw new Error('Введите тему презентации или сначала проверьте работу с ошибками.');
  const p = 'Сделай короткую учебную презентацию по предмету «' + $('subject').value + '» (5-6 слайдов) ' + (topic ? 'на тему: ' + topic : 'по правилам, в которых ученик допустил ошибки: ' + errSummary()) +
    '. Первый слайд титульный, последний со сводкой правил. Краткие тезисы, по 3-4 пункта.' +
    '\nВерни JSON: {"title":"...","slides":[{"title":"...","bullets":["..."],"example":"пример (необязательно)"}]}';
  const d = parseJson(await deepseekChat([{ text: p }], true));
  slides = Array.isArray(d.slides) ? d.slides : []; deckTitle = d.title || 'Презентация';
  if (!slides.length) throw new Error('Не удалось собрать слайды. Попробуйте ещё раз.');
  si = 0; deckTarget = 'extra'; showSlide();
}, 'msg4'));

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function downloadDeck() {
  const body = slides.map(s => '<section class="s"><h1>' + esc(s.title) + '</h1><ul>' + (s.bullets || []).map(b => '<li>' + esc(b) + '</li>').join('') + '</ul>' + (s.example ? '<div class="ex">' + esc(s.example) + '</div>' : '') + (s.task ? '<div class="ex">Задание: ' + esc(s.task) + '</div>' : '') + '</section>').join('');
  const html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(deckTitle) + '</title><style>body{margin:0;font:clamp(16px,2.4vw,22px)/1.5 system-ui,sans-serif;background:#f7f9fc;color:#1b1f2a}.s{display:none;min-height:100vh;padding:clamp(16px,5vw,8vw);box-sizing:border-box}.s.on{display:block}h1{color:#1f3a93;font-size:2em}li{margin:.4em 0}.ex{margin-top:1em;color:#2e7d32;font-weight:600}.n{position:fixed;bottom:12px;right:16px}button{font-size:18px;padding:8px 14px}</style></head><body>' + body +
    '<div class="n"><button onclick="g(-1)">‹</button> <button onclick="g(1)">›</button></div><script>var i=0,s=document.querySelectorAll(".s");function g(d){s[i].classList.remove("on");i=(i+s.length+d)%s.length;s[i].classList.add("on")}document.onkeydown=function(e){if(e.key=="ArrowRight")g(1);if(e.key=="ArrowLeft")g(-1)};s[0].classList.add("on");<\/script></body></html>';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = 'prezentaciya.html'; document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- Чат ---------- */
$('askBtn').addEventListener('click', () => busy($('askBtn'), 'Думаю…', async () => {
  const q = $('ask').value.trim();
  if (!q) throw new Error('Введите вопрос.');
  const ctx = last ? '\nТекст ученика:\n' + last.text + '\nРезультат проверки (JSON):\n' + JSON.stringify(last.d) : '';
  const p = 'Ты наставник учителя по предмету «' + $('subject').value + '». Отвечай кратко и по делу, на русском, ссылаясь на правила и определения.' + ctx + '\nВопрос учителя: ' + q;
  $('ans').textContent = (await deepseekChat([{ text: p }], false)).trim();
}, 'msg3'));

/* ---------- Словарь ---------- */
$('word').addEventListener('keydown', e => { if (e.key === 'Enter') $('bWord').click(); });
$('bWord').addEventListener('click', () => busy($('bWord'), 'Ищу…', async () => {
  const w = $('word').value.trim();
  if (!w) throw new Error('Введите слово.');
  const p = 'Ты справочник по русскому языку. Дай справку по слову или выражению: "' + w + '".' +
    '\nВерни JSON: {"word":"слово в правильном написании","stress":"слово с ударением, ударную гласную напиши заглавной","pos":"часть речи","meaning":"значение простыми словами","spelling":"правописание и частые ошибки","forms":"основные формы: склонение или спряжение","synonyms":["..."],"example":"пример предложения","note":"если слова не существует или оно написано с ошибкой, объясни, как правильно; иначе пустая строка"}' +
    '\nЕсли в чём-то не уверен, так и напиши, ничего не выдумывай.';
  const d = parseJson(await deepseekChat([{ text: p }], true));
  const box = $('wordOut'); box.textContent = '';
  const card = el('div', 'err');
  { const h = el('div', 'good'); h.appendChild(document.createTextNode(d.word || w));
    if (d.stress) { h.appendChild(document.createTextNode('  [')); h.appendChild(stressNodes(d.stress)); h.appendChild(document.createTextNode(']')); }
    card.appendChild(h); }
  [['Часть речи', d.pos], ['Значение', d.meaning], ['Правописание', d.spelling], ['Формы', d.forms],
   ['Синонимы', Array.isArray(d.synonyms) ? d.synonyms.join(', ') : d.synonyms], ['Пример', d.example], ['Важно', d.note]]
    .forEach(([k, v]) => { if (v) { const r = el('div'); r.appendChild(el('b', '', k + ': ')); r.appendChild(document.createTextNode(v)); card.appendChild(r); } });
  box.appendChild(card);
  const a = el('a', 'hint', 'Найти статью в словаре Ожегова');
  a.href = 'https://www.google.com/search?q=' + encodeURIComponent(w + ' словарь Ожегова');
  a.target = '_blank'; a.rel = 'noopener'; box.appendChild(a);
}, 'msg5'));
/* ---------- Уточнение распознавания ---------- */
$('refine').addEventListener('click', () => busy($('refine'), 'Уточняю…', async () => {
  const draft = $('text').value.trim();
  if (!media) throw new Error('Для уточнения нужно загруженное фото.');
  if (!draft) throw new Error('Сначала нажмите «Распознать текст».');
  const got = (await deepseekChat([{ text: refinePrompt(draft) }, { inline_data: { mime_type: media.mime, data: media.b64 } }], false)).trim();
  if (got) $('text').value = got;
}, 'msg2'));

/* ---------- Справочник ---------- */
const RULES = [
["Орфография","Безударные гласные в корне","Подберите проверочное слово, где гласная стоит под ударением (однокоренное или другая форма слова). Если проверить нельзя, это словарное слово: его нужно запомнить.","вода — воды; гора — горы. Словарные: корова, собака, пшеница"],
["Орфография","Чередующиеся корни бер-/бир-, лаг-/лож-","бер-/бир-: если дальше есть суффикс -а-, пишем и, если нет — пишем е. лаг-/лож-: перед г пишем а, перед ж пишем о. Исключения: полог, предлог.","собирать — соберу; предлагать — предложить"],
["Орфография","Чередующиеся корни раст-/ращ-/рос-","Перед ст и щ пишем а, перед с пишем о. Исключения: росток, Ростов, отрасль, ростовщик.","растение, выращу, рос, заросли"],
["Орфография","Парные и непроизносимые согласные","Парную согласную в корне проверяйте словом, где после неё гласная или р, л, м, н, в. Непроизносимую согласную проверяйте формой слова, где она слышна.","дуб — дубы; сказка — сказки; звёздный — звёзды; радостный — радость; местный — места"],
["Орфография","Гласные после шипящих","После ж, ш, ч, щ пишем и, а, у, а не ы, я, ю. Исключения: брошюра, парашют, жюри.","жизнь, шило, чаща, щука, чудо"],
["Орфография","Мягкий знак после шипящих","Пишется: у существительных 3-го склонения (ночь, мышь), в глаголах 2-го лица единственного числа (пишешь, читаешь), в неопределённой форме глагола (беречь), в наречиях вскачь, настежь, наотмашь. Не пишется: у существительных мужского рода (врач, плащ) и в наречиях уж, замуж, невтерпёж.","ночь, мышь; пишешь; врач, плащ"],
["Орфография","Ы и И после Ц","После ц пишем ы в окончаниях и суффиксах. И пишем в корнях (цирк, цифра, цитата) и в окончании -ция. Исключения: цыган, цыплёнок, цыпочки, цыц.","огурцы, сестрицын; цирк, станция"],
["Орфография","-ТСЯ и -ТЬСЯ в глаголах","Задайте вопрос к глаголу: «что делает? что сделает?» — пишем -тся; «что делать? что сделать?» — пишем -ться.","Он учится (что делает?). Он любит учиться (что делать?)"],
["Орфография","Н и НН в прилагательных","Одна н в суффиксах -ан-, -ян-: кожаный, песчаный, глиняный. Исключения: стеклянный, оловянный, деревянный. Две н в суффиксах -онн-, -енн-: станционный, соломенный. Исключение: ветреный.","кожаный, песчаный; станционный, соломенный"],
["Орфография","НЕ с глаголами и деепричастиями","Не с глаголами и деепричастиями пишется раздельно. Слитно — если глагол без не не употребляется.","не читал, не читая; ненавидеть, негодовать, недоумевать"],
["Орфография","НЕ с существительными, прилагательными, наречиями","Слитно, если слово можно заменить синонимом или оно без не не употребляется. Раздельно, если есть противопоставление с а или слова вовсе, совсем, отнюдь, далеко.","неправда (= ложь); не правда, а ложь; далеко не интересный"],
["Орфография","НЕ с причастиями","Раздельно, если есть зависимые слова или противопоставление с а. Слитно, если зависимых слов нет.","непрочитанная книга; не прочитанная вчера книга"],
["Орфография","НЕ и НИ в отрицательных местоимениях","Без предлога пишутся слитно, с предлогом — раздельно. Различайте по ударению: с не- ударение падает на не (нéкого, нéчего), с ни- ударение на не на нём (никтó).","никто; ни у кого; некого спросить; нечего делать"],
["Орфография","Приставки на з/с","Перед звонкими согласными и гласными пишем з, перед глухими — с. Это приставки без-, воз-, из-, раз-, роз-, низ-, через-, чрез-.","безвкусный, беспечный; разбудить, распилить"],
["Орфография","Приставки пре- и при-","Пре- значит «очень» или «пере»: преинтересный, преградить. При- значит приближение, присоединение, неполноту действия.","прекрасный, превратить; приехать, прикрыть"],
["Орфография","Разделительные Ъ и Ь","Ъ пишется после приставки на согласный перед е, ё, ю, я. Ь пишется внутри слова перед е, ё, ю, я, и как разделительный.","подъезд, объявление, съёмка; вьюга, семья, ручьи"],
["Орфография","Производные предлоги","Слитно: вследствие, ввиду, насчёт, навстречу, вместо, вроде. В течение, в продолжение, в заключение пишутся раздельно, существительное после них на -е/-ие.","в течение дня; ввиду болезни; вследствие дождя"],
["Пунктуация","Запятая в сложносочинённом предложении","Запятая ставится перед союзами и, а, но, да (= но), или, зато, однако, если в каждой части своя грамматическая основа. Запятой нет, если у частей общий второстепенный член или общее придаточное.","Прошёл дождь, и вышло солнце. Вечером похолодало и пошёл дождь"],
["Пунктуация","Однородные члены предложения","Запятая между однородными членами без союза и перед а, но, зато. При повторяющихся союзах и… и, ни… ни, или… или запятая ставится. Перед одиночным и запятой нет.","яблоки, груши, сливы; и ветер, и дождь; хлеб и молоко"],
["Пунктуация","Однородные и неоднородные определения","Между однородными определениями (описывают предмет с одной стороны) запятая ставится. Между неоднородными (разные признаки: цвет, материал, размер) не ставится.","высокий, стройный юноша; красная кирпичная стена"],
["Пунктуация","Обобщающее слово при однородных членах","Перед перечислением после обобщающего слова ставится двоеточие. После перечисления перед обобщающим словом — тире.","Всё было готово: стол накрыт, свечи горят. Берёзы, клёны, дубы — все деревья стояли в золоте"],
["Пунктуация","Обращение","Обращение выделяется запятыми, в начале предложения после него может стоять восклицательный знак.","Мама, посмотри! Ребята, тише!"],
["Пунктуация","Вводные слова","Вводные слова выделяются запятыми: конечно, кажется, к сожалению, по-моему, например, наконец. Не являются вводными и запятыми не выделяются: вдруг, как будто, даже, вроде, почти, именно.","К сожалению, он опоздал. Он вдруг замолчал"],
["Пунктуация","Причастный оборот","Причастный оборот после определяемого слова выделяется запятыми. Перед определяемым словом запятая не ставится.","Ветка, покрытая снегом, сломалась. Покрытая снегом ветка сломалась"],
["Пунктуация","Деепричастный оборот","Деепричастный оборот выделяется запятыми с двух сторон. Фразеологизмы запятыми не выделяются.","Закончив работу, он ушёл. Работать спустя рукава"],
["Пунктуация","Сложноподчинённое предложение","Придаточная часть отделяется запятой от главной. Запятая ставится перед союзом или союзным словом: что, чтобы, когда, потому что, так как, если, который.","Я знаю, что ты придёшь. Книга, которую я читал, интересная"],
["Пунктуация","Сравнительный оборот","Обороты с как, словно, будто, точно выделяются запятыми. Запятой нет, если оборот является сказуемым или входит во фразеологизм.","Он, словно птица, летел. Лицо как маска. Стоял как вкопанный"],
["Пунктуация","Прямая речь","Схемы: «П», — а. А: «П». «П!» — а. «П, — а, — продолжение». После слов автора перед прямой речью ставится двоеточие.","«Пора идти», — сказал Антон. Антон сказал: «Пора идти». «Пора! — сказал Антон. — Идём»"],
["Пунктуация","Диалог","Каждая реплика пишется с новой строки и начинается с тире.","— Ты придёшь? — Конечно, приду"],
["Пунктуация","Тире между подлежащим и сказуемым","Тире ставится, если оба главных члена выражены существительными в именительном падеже (или числительными). Перед сказуемым есть не — тире не ставится.","Москва — столица России. Москва не столица Турции"],
["Пунктуация","Двоеточие и точка с запятой","Двоеточие — после обобщающего слова, в бессоюзном предложении, если вторая часть поясняет первую, перед прямой речью. Точка с запятой — между распространёнными частями сложного предложения и в сложных перечислениях.","Я знаю: ты придёшь"],
["Пунктуация","Бессоюзное сложное предложение","Запятая при перечислении событий. Двоеточие, если вторая часть поясняет или причина. Тире при быстрой смене событий, условии, времени или следствии.","Светило солнце, пели птицы. Подует ветер — тучи уйдут"],
["Грамматика","Падежи","И. кто? что? Р. кого? чего? Д. кому? чему? В. кого? что? Т. кем? чем? П. о ком? о чём?","мама — мамы — маме — маму — мамой — о маме"],
["Грамматика","Склонения существительных","1-е склонение: женский и мужской род на -а, -я. 2-е склонение: мужской род с нулевым окончанием и средний род на -о, -е. 3-е склонение: женский род на мягкий знак. Разносклоняемые: путь, время, имена на -мя.","мама, папа; стол, окно; ночь, мышь"],
["Грамматика","Спряжение глаголов","II спряжение: глаголы на -ить, кроме брить и стелить, и 11 исключений: гнать, держать, дышать, слышать, видеть, ненавидеть, обидеть, зависеть, смотреть, терпеть, вертеть. Остальные — I спряжение. Окончания: I — -ешь, -ет, -ем, -ете, -ут/-ют; II — -ишь, -ит, -им, -ите, -ат/-ят.","строить — строишь; читать — читаешь"],
["Грамматика","Члены предложения: подчёркивания","Подлежащее — одна черта, сказуемое — две черты, дополнение — пунктир, определение — волнистая линия, обстоятельство — точка-тире.","Мальчик читает книгу."],
["Речь","Ложить, ихний, ехай","Слова «ложить», «ихний», «ехай» литературная норма не допускает. Говорите: класть, положить; их; поезжай.","Положи книгу. Это их дом. Поезжай домой"],
["Речь","Падежное управление","Благодаря, согласно, вопреки, подобно, наперекор требуют дательного падежа. Говорят «по приезде», «по прибытии». Оплатить (что?) проезд, но заплатить за проезд. Надеть (что?) пальто, одеть (кого?) ребёнка.","благодаря помощи; согласно приказу; по приезде домой"],
["Речь","Ударение в частых словах","звонИт, красИвее, тОрты, бАнты, шАрфы, квартАл, договОр, каталОг, алфавИт, включИт.","Он звонИт по телефону"]
];
function renderRules() {
  const q = $('refQ').value.trim().toLowerCase(), box = $('refList'); box.textContent = '';
  let cat = '', shown = 0;
  RULES.forEach(r => {
    if (q && !(r.join(' ').toLowerCase().includes(q))) return;
    if (r[0] !== cat) { cat = r[0]; box.appendChild(el('div', 'cat', cat)); }
    const d = el('details', 'rule'); d.appendChild(el('summary', '', r[1]));
    const b = el('div', 'rb'); b.appendChild(el('div', '', r[2])); b.appendChild(el('div', 'rx', 'Примеры: ' + r[3]));
    d.appendChild(b); box.appendChild(d); shown++;
  });
  if (!shown) box.appendChild(el('p', 'hint', 'Ничего не найдено. Спросите нейросеть ниже.'));
}
let rulesTimer = null;
$('refQ').addEventListener('input', () => { clearTimeout(rulesTimer); rulesTimer = setTimeout(renderRules, 180); }); renderRules();
$('bRef').addEventListener('click', () => busy($('bRef'), 'Ищу…', async () => {
  const q = $('refAsk').value.trim() || $('refQ').value.trim();
  if (!q) throw new Error('Введите вопрос.');
  const p = 'Ты справочник по русскому языку для школы. Объясни кратко и точно по школьной программе: ' + q + '\nДай правило, 2-3 примера и важные исключения. Если не уверен, скажи об этом, ничего не выдумывай. Если вопрос не по русскому языку, так и скажи.';
  $('refAns').textContent = (await deepseekChat([{ text: p }], false)).trim();
}, 'msg6'));

/* ---------- Создание презентации ---------- */
$('bDeck').addEventListener('click', () => busy($('bDeck'), 'Создаю…', async () => {
  const topic = $('pTopic').value.trim(), grade = $('pGrade').value.trim() || '5 класс', n = parseInt($('pN').value, 10) || 7;
  if (!topic) throw new Error('Введите тему презентации.');
  const p = [
'Ты опытный методист по предмету «' + $('subject').value + '». Сделай презентацию к уроку.',
'Тема: ' + topic + '. Класс: ' + grade + '. Слайдов: ' + n + ' (первый титульный, последний с итогом и домашним заданием).',
'Требования: короткий заголовок на каждом слайде; 3-4 лаконичных тезиса (не длиннее 12 слов каждый); правила и примеры точные, по школьной программе, ничего не выдумывай; в середине 1-2 слайда с практическими заданиями для учеников (поле task); поле example — один яркий пример; поле notes — 1-2 предложения подсказки учителю.',
'Верни только JSON без markdown: {"title":"...","slides":[{"title":"...","bullets":["..."],"example":"","task":"","notes":""}]}'
  ].join('\n');
  const d = parseJson(await deepseekChat([{ text: p }], true));
  slides = Array.isArray(d.slides) ? d.slides : []; deckTitle = d.title || topic;
  if (!slides.length) throw new Error('Не удалось собрать слайды. Попробуйте ещё раз.');
  si = 0; deckTarget = 'deckOut'; showSlide();
}, 'msg7'));

function loadPptx() {
  return new Promise((res, rej) => {
    if (window.PptxGenJS) return res();
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/PptxGenJS/3.12.0/pptxgen.bundle.js';
    sc.onload = res;
    sc.onerror = () => rej(new Error('Не удалось загрузить библиотеку PowerPoint. Проверьте интернет или скачайте HTML-версию.'));
    document.head.appendChild(sc);
  });
}
async function downloadPptx() {
  await loadPptx();
  const pptx = new PptxGenJS(); pptx.layout = 'LAYOUT_16x9';
  slides.forEach((s, i) => {
    const sl = pptx.addSlide(); sl.background = { color: 'F7F9FC' };
    if (i === 0) {
      sl.addText(s.title || deckTitle, { x: 0.6, y: 1.6, w: 8.8, h: 1.4, fontSize: 38, bold: true, color: '1F3A93', align: 'center' });
      const sub = (s.bullets || []).join(' · ');
      if (sub) sl.addText(sub, { x: 0.6, y: 3.2, w: 8.8, h: 1, fontSize: 20, color: '5D6678', align: 'center' });
    } else {
      sl.addText(s.title || '', { x: 0.5, y: 0.3, w: 9, h: 0.9, fontSize: 30, bold: true, color: '1F3A93' });
      const items = (s.bullets || []).map(b => ({ text: b, options: { bullet: true, breakLine: true } }));
      sl.addText(items, { x: 0.6, y: 1.3, w: 8.8, h: 2.6, fontSize: 20, color: '1B1F2A', valign: 'top' });
      let y = 4.0;
      if (s.example) { sl.addText(s.example, { x: 0.6, y, w: 8.8, h: 0.6, fontSize: 18, bold: true, color: '2E7D32' }); y += 0.7; }
      if (s.task) sl.addText('Задание: ' + s.task, { x: 0.6, y, w: 8.8, h: 0.8, fontSize: 16, color: 'D32F2F' });
    }
    if (s.notes) sl.addNotes(s.notes);
  });
  await pptx.writeFile({ fileName: 'prezentaciya.pptx' });
}

/* ---------- Отметки ошибок: слово красным, ошибка синим ---------- */
function parseMark(x) {
  const frag = String(x.fragment || ''), mk = String(x.mark || '');
  const stripped = mk.replace(/\[\^\]/g, '').replace(/[\[\]]/g, '');
  return (mk && stripped.replace(/\s+/g, ' ') === frag.replace(/\s+/g, ' ')) ? mk : frag;
}
function markNodes(mk) {
  const out = document.createDocumentFragment();
  mk.split(/(\[[^\]]*\])/).forEach(p => {
    if (!p) return;
    if (p[0] === '[' && p[p.length - 1] === ']') {
      const inner = p.slice(1, -1), caret = inner === '^';
      const sp = el('span', 'blue' + (caret ? ' caret' : ''));
      sp.textContent = caret ? '∧' : inner; out.appendChild(sp);
    } else out.appendChild(document.createTextNode(p));
  });
  return out;
}
function markEl(x) { const sp = el('span', 'bad'); sp.appendChild(markNodes(parseMark(x))); return sp; }
function annotated(text, errs) {
  const ranges = [], notFound = [];
  errs.forEach(x => {
    const frag = String(x.fragment || ''); if (!frag) return;
    let from = 0, idx, found = false;
    while ((idx = text.indexOf(frag, from)) !== -1) {
      if (!ranges.some(r => idx < r.e && idx + frag.length > r.s)) { ranges.push({ s: idx, e: idx + frag.length, x }); found = true; break; }
      from = idx + 1;
    }
    if (!found) notFound.push(x);
  });
  ranges.sort((a, b) => a.s - b.s);
  const box = el('div'), wrap = el('div', 'annot'); let pos = 0;
  ranges.forEach(r => {
    if (r.s > pos) wrap.appendChild(document.createTextNode(text.slice(pos, r.s)));
    const sp = markEl(r.x); sp.title = r.x.rule || ''; wrap.appendChild(sp); pos = r.e;
  });
  if (pos < text.length) wrap.appendChild(document.createTextNode(text.slice(pos)));
  box.appendChild(wrap);
  box.appendChild(el('p', 'hint', 'Красным отмечено слово с ошибкой, синим — сама ошибка (∧ — пропущенный знак препинания).'));
  if (notFound.length) {
    const nf = el('div', 'notfound');
    nf.appendChild(el('strong', '', 'Не удалось найти в тексте автоматически (проверьте вручную):'));
    const ul = el('ul');
    notFound.forEach(x => { const li = el('li'); li.appendChild(markEl(x)); li.appendChild(document.createTextNode(' → ' + (x.correction || ''))); ul.appendChild(li); });
    nf.appendChild(ul); box.appendChild(nf);
  }
  return box;
}
function stressNodes(sw) {
  const f = document.createDocumentFragment();
  for (const ch of String(sw || '')) {
    if ('АЕЁИОУЫЭЮЯ'.includes(ch)) {
      const lo = ch.toLowerCase(), sp = el('span', 'blue stress');
      sp.textContent = lo + (lo === 'ё' ? '' : '\u0301'); f.appendChild(sp);
    } else f.appendChild(document.createTextNode(ch));
  }
  return f;
}

/* ---------- Разборы ---------- */
function morphNode(d) {
  const parts = Array.isArray(d.parts) ? d.parts : [], wrap = el('div', 'morph'), stem = el('span', 'm-stem');
  const cls = { 'приставка': 'm-pre', 'корень': 'm-root', 'суффикс': 'm-suf', 'соединительная гласная': 'm-link' };
  let end = null; const post = [];
  parts.forEach(p => {
    const k = String(p.k || '').toLowerCase();
    if (k === 'окончание') { end = p; return; }
    if (k === 'постфикс') { post.push(p); return; }
    stem.appendChild(el('span', cls[k] || '', p.t || ''));
  });
  wrap.appendChild(stem);
  if (end || d.zero_ending) wrap.appendChild(el('span', 'm-end', end ? (end.t || '') : ''));
  post.forEach(p => wrap.appendChild(el('span', 'm-pf', p.t || '')));
  return wrap;
}
function synNode(d) {
  const wrap = el('div', 'syn'), ws = Array.isArray(d.words) ? d.words : [];
  const cls = { 'подлежащее': 'r-sub', 'сказуемое': 'r-pred', 'дополнение': 'r-obj', 'определение': 'r-attr', 'обстоятельство': 'r-adv' };
  let i = 0;
  while (i < ws.length) {
    const role = String(ws[i].role || '').toLowerCase(), c = cls[role];
    let txt = String(ws[i].t || ''), j = i + 1;
    if (c) while (j < ws.length && String(ws[j].role || '').toLowerCase() === role) { txt += ' ' + ws[j].t; j++; }
    wrap.appendChild(el('span', c || '', txt));
    if (j < ws.length) wrap.appendChild(document.createTextNode(' '));
    i = j;
  }
  return wrap;
}
$('bAn').addEventListener('click', () => busy($('bAn'), 'Разбираю…', async () => {
  const w = $('aWord').value.trim(), mode = $('aMode').value, out = $('anOut');
  if (!w) throw new Error('Введите слово или предложение.');
  let p;
  if (mode === 'sostav') p = 'Сделай морфемный разбор слова «' + w + '» по школьной программе.\nВерни только JSON: {"word":"...","parts":[{"t":"часть слова точно как в слове","k":"приставка|корень|суффикс|окончание|соединительная гласная|постфикс"}],"zero_ending":true,"note":"краткое пояснение: чередование, другие варианты разбора"}\nЧасти идут в порядке слова, их текст подряд даёт слово целиком. Если окончание нулевое, добавь часть с пустым t и k «окончание» и поставь zero_ending true. У неизменяемых слов окончания нет. Если не уверен, скажи об этом в note.';
  else if (mode === 'fon') p = 'Сделай фонетический разбор слова «' + w + '» по школьной программе.\nВерни только JSON: {"word":"...","stress_word":"слово, ударная гласная заглавная","syllables":["сло","ва"],"sounds":[{"letter":"в","sound":"[в]","info":"согласный, звонкий, твёрдый"}],"summary":"букв: N, звуков: M"}\nДля каждой буквы одна запись. Буквы ь и ъ: sound «—», info «звука не обозначает». Буква, дающая два звука, например я в начале слова: sound «[й\'а]». Если не уверен, скажи об этом в summary.';
  else p = 'Сделай синтаксический разбор предложения: «' + w + '»\nВерни только JSON: {"sentence":"...","words":[{"t":"слово с прилипшим знаком препинания","role":"подлежащее|сказуемое|дополнение|определение|обстоятельство|нет"}],"note":"тип предложения и количество грамматических основ"}\nПредлог относится к тому члену предложения, к которому относится слово после него. Союзы и частицы — «нет». Не пропускай слова.';
  const d = parseJson(await deepseekChat([{ text: p }], true));
  out.textContent = '';
  if (mode === 'sostav') {
    out.appendChild(morphNode(d));
    const ul = el('ul'); (d.parts || []).forEach(x => ul.appendChild(el('li', '', (x.k || '') + ': ' + (x.t || '(нулевое)')))); out.appendChild(ul);
    out.appendChild(el('p', 'hint', 'Обозначения: ⌐ приставка, ⌒ корень, ∧ суффикс, □ окончание, ⎵ основа.'));
    if (d.note) out.appendChild(el('p', 'hint', d.note));
  } else if (mode === 'fon') {
    const h = el('div', 'good'); h.style.cssText = 'font:700 26px/1.3 Caveat,cursive;color:var(--green)';
    h.appendChild(document.createTextNode((d.word || w) + '   ')); h.appendChild(stressNodes(d.stress_word)); out.appendChild(h);
    if ((d.syllables || []).length) out.appendChild(el('p', '', 'Слоги: ' + d.syllables.join('-') + ' (' + d.syllables.length + ')'));
    const t = el('table', 'ph'), hr = el('tr'); ['Буква', 'Звук', 'Характеристика'].forEach(x => hr.appendChild(el('th', '', x))); t.appendChild(hr);
    (d.sounds || []).forEach(r => { const tr = el('tr'); [r.letter, r.sound, r.info].forEach(x => tr.appendChild(el('td', '', x || ''))); t.appendChild(tr); });
    out.appendChild(t);
    if (d.summary) out.appendChild(el('p', 'hint', d.summary));
  } else {
    out.appendChild(synNode(d));
    out.appendChild(el('p', 'hint', 'Подлежащее — одна черта, сказуемое — две, дополнение — пунктир, определение — волнистая, обстоятельство — точка-тире.'));
    if (d.note) out.appendChild(el('p', 'hint', d.note));
  }
}, 'msg8'));

/* ---------- Меню задания (долгое нажатие на поле «Задание») ---------- */
let lastFocused = null, releaseTaskTrap = null;
function trapFocus(modal) {
  const handler = e => {
    if (e.key !== 'Tab') return;
    const f = Array.from(modal.querySelectorAll('button, [href], input, select, textarea')).filter(x => !x.closest('[hidden]') && !x.disabled && !x.classList.contains('hid'));
    if (!f.length) return;
    const first = f[0], end = f[f.length - 1], a = document.activeElement, inside = modal.contains(a);
    if (e.shiftKey && (a === first || !inside)) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && (a === end || !inside)) { e.preventDefault(); first.focus(); }
  };
  modal.addEventListener('keydown', handler);
  return () => modal.removeEventListener('keydown', handler);
}
function openTask() {
  const m = $('taskModal');
  if (!m.classList.contains('on')) lastFocused = document.activeElement;
  $('tmMenu').hidden = false; $('tmBookForm').hidden = true; $('tmMsg').textContent = '';
  m.classList.add('on');
  if (!releaseTaskTrap) releaseTaskTrap = trapFocus(m);
  const b = m.querySelector('#tmMenu button'); if (b) b.focus();
}
function closeTask() {
  $('taskModal').classList.remove('on');
  if (releaseTaskTrap) { releaseTaskTrap(); releaseTaskTrap = null; }
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
function setTask(label, text) {
  taskExtra = (text || '').slice(0, 6000);
  const c = $('taskChip'); c.textContent = '';
  if (!taskExtra) return;
  c.appendChild(document.createTextNode('Задание: ' + label + '  '));
  const x = el('button', 'alt', 'Убрать'); x.style.padding = '2px 10px';
  x.onclick = () => setTask('', ''); c.appendChild(x);
}
(function () {
  const q = $('q'); let t = null;
  const cancel = () => { if (t) { clearTimeout(t); t = null; } };
  q.addEventListener('touchstart', () => { cancel(); t = setTimeout(() => { t = null; openTask(); }, 600); }, { passive: true });
  ['touchend', 'touchmove', 'touchcancel'].forEach(n => q.addEventListener(n, cancel, { passive: true }));
  q.addEventListener('contextmenu', e => { e.preventDefault(); openTask(); });
})();
$('bTask').addEventListener('click', openTask);
$('tmClose').addEventListener('click', closeTask);
$('taskModal').addEventListener('click', e => { if (e.target === $('taskModal')) closeTask(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTask(); });
$('tmClear').addEventListener('click', () => { setTask('', ''); closeTask(); });
$('tmBook').addEventListener('click', () => { $('tmMenu').hidden = true; $('tmBookForm').hidden = false; $('tbMsg').textContent = ''; fillBooks(); const i = $('tbNum'); if (i) i.focus(); });
$('tbBack').addEventListener('click', openTask);

async function imgToMedia(f) {
  try {
    const img = await decode(f), k = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { mime: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.88).split(',')[1] };
  } catch (e) { const mime = f.type || 'image/jpeg'; if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) throw new Error('Формат фото не поддерживается. Используйте JPG или PNG.'); return { mime, b64: await toB64(f) }; }
}
$('tbOk').addEventListener('click', () => {
  const grade = $('tbGrade').value, book = $('tbBook').value.trim(), num = $('tbNum').value.trim(), cond = $('tbText').value.trim();
  if (!num && !cond) { $('tbMsg').textContent = 'Укажите номер упражнения или условие.'; return; }
  const label = (book ? book + ', ' : '') + grade + ' класс' + (num ? ', ' + num : '');
  setTask(label, 'Учебник: ' + (book || 'не указан') + ', ' + grade + ' класс. ' + (num ? num + '. ' : '') + (cond ? 'Условие: ' + cond + '\n' : '') +
    'Проверь работу ученика именно по этому заданию: учитывай, что требовалось выполнить (например, вставить буквы, расставить знаки, выписать слова), и отметь, выполнено ли оно.');
  closeTask();
});
$('tbPhoto').addEventListener('click', () => $('tbPhotoIn').click());
$('tbPhotoIn').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  busy($('tbPhoto'), 'Читаю…', async () => {
    const m = await imgToMedia(f);
    const p = 'Перепиши дословно условие школьного задания с этого фото: номер, формулировку и текст упражнения со всеми пропусками и скобками. Ничего не добавляй и не решай.';
    $('tbText').value = (await deepseekChat([{ text: p }, { inline_data: { mime_type: m.mime, data: m.b64 } }], false)).trim();
  }, 'tbMsg');
});

function loadJsZip() {
  return new Promise((res, rej) => {
    if (window.JSZip) return res();
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    sc.onload = res; sc.onerror = () => rej(new Error('Не удалось загрузить модуль чтения файлов. Проверьте интернет.'));
    document.head.appendChild(sc);
  });
}
async function zipText(f, isPptx) {
  await loadJsZip();
  const zip = await JSZip.loadAsync(f);
  const names = isPptx
    ? Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
    : ['word/document.xml'].filter(n => zip.file(n));
  const out = [];
  for (let i = 0; i < names.length; i++) {
    const doc = new DOMParser().parseFromString(await zip.file(names[i]).async('string'), 'application/xml');
    const paras = Array.from(doc.getElementsByTagNameNS('*', 'p')).map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent).join('')).filter(Boolean);
    out.push(isPptx ? 'Слайд ' + (i + 1) + ': ' + paras.join(' / ') : paras.join('\n'));
  }
  return out.join('\n');
}
$('tmFile').addEventListener('click', () => $('tmFileIn').click());
$('tmFileIn').addEventListener('change', e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  busy($('tmFile'), 'Читаю файл…', async () => {
    const name = f.name || 'файл', low = name.toLowerCase();
    let text = '';
    if (/\.pdf$/.test(low) || f.type === 'application/pdf') throw new Error('PDF пока не поддерживается. Сохраните страницы как фото JPG или PNG.');
    if (/\.pptx$/.test(low)) text = await zipText(f, true);
    else if (/\.docx$/.test(low)) text = await zipText(f, false);
    else if (/\.(txt|md|csv)$/.test(low)) text = await f.text();
    else if (f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/.test(low)) {
      const m = (/\.pdf$/.test(low) || f.type === 'application/pdf') ? { mime: 'application/pdf', b64: await toB64(f) } : await imgToMedia(f);
      const p = 'Перепиши дословно текст школьного задания из этого файла: номера, формулировки, тексты упражнений. Если есть таблицы или схемы, кратко опиши их словами. Ничего не добавляй и не решай.';
      text = (await deepseekChat([{ text: p }, { inline_data: { mime_type: m.mime, data: m.b64 } }], false)).trim();
    } else throw new Error('Такой формат не поддерживается. Подходят: .pptx, .docx, .txt и фото JPG или PNG. Старые .ppt и .doc сохраните в новом формате.');
    if (!text.trim()) throw new Error('В файле не нашлось текста.');
    setTask(name, 'Материал задания (файл «' + name + '»):\n' + text.trim() + '\nПроверь работу ученика с учётом этого задания.');
    closeTask();
  }, 'tmMsg');
});

