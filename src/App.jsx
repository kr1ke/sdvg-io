import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Drawer } from "vaul";

const KEY = "tracker-v6";
const uid = () => Math.random().toString(36).slice(2, 9);
const now = () => Date.now();

/* Тактильный отклик. iOS Safari не поддерживает Vibration API (silently no-ops),
   Android/Chromium — работает. ~10ms = acknowledgement, [10,30,10] = destructive. */
const haptic = (pattern = 10) => {
  try { navigator.vibrate?.(pattern); } catch {}
};

/* View Transitions API: плавный crossfade для state-swap'ов (фильтр, архив,
   сортировка). Поддерживается в Chrome/Edge/Firefox/Safari 18+. Fallback —
   просто вызываем fn() без анимации. Не оборачиваем модалки — Vaul сам анимирует. */
const withTransition = (fn) => {
  if (typeof document !== "undefined" && document.startViewTransition) {
    document.startViewTransition(() => fn());
  } else {
    fn();
  }
};

const LOCALE = { en: "en-US", ru: "ru-RU" };

const fmt = (ts, lang = "en") => {
  const d = new Date(ts);
  const loc = LOCALE[lang] || LOCALE.en;
  return d.toLocaleDateString(loc, { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
};

const REL = {
  en: { now: "now", m: "m", h: "h", d: "d", w: "w", mo: "mo" },
  ru: { now: "сейчас", m: "м", h: "ч", d: "д", w: "н", mo: "мес" },
};
const rel = (ts, lang = "en") => {
  const r = REL[lang] || REL.en;
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return r.now;
  if (m < 60) return m + r.m;
  const h = Math.floor(m / 60);
  if (h < 24) return h + r.h;
  const d = Math.floor(h / 24);
  if (d < 7) return d + r.d;
  const w = Math.floor(d / 7);
  if (w < 5) return w + r.w;
  const mo = Math.floor(d / 30);
  return mo + r.mo;
};

/* ── i18n dictionary ──
   Keys = English source. Lookup: T[lang][key] || T.en[key] || key. */
const T = {
  en: {
    epics: "Epics", sprints: "Sprints", archive: "Archive", tasks: "Tasks", projects: "Projects",
    all: "All", noProject: "No project", none: "none", manageProjects: "manage projects",
    addTask: "+ task", addSprint: "+ sprint", addProject: "+ add project",
    create: "create", forAllProjects: (n) => `for all ${n} projects`,
    newest: "newest", oldest: "oldest",
    open: "open", openCard: "open card", archiveAction: "archive", archiveTask: "archive task", archiveSprintAction: "archive sprint",
    settings: "settings", deleteForever: "delete forever", restore: "restore",
    moveToSprint: "move to sprint", moveToSprintLabel: "Move to sprint",
    cancel: "cancel", save: "save", done: "done", doneFooter: "done",
    newEpic: "new epic", newTask: "new task", projectName: "project name",
    untitled: "untitled", sprint: "sprint",
    sprintSettings: "Sprint settings", name: "Name", goal: "Goal", description: "Description",
    epicName: "Epic name", linkedTasks: (n) => `Linked tasks (${n})`, noTasksLinked: "no tasks linked",
    epic: "Epic", project: "Project",
    notesPlaceholder: "notes, links, details...",
    contextPlaceholder: "context, notes, scope...",
    sprintGoalPlaceholder: "what should this sprint achieve?",
    selectPlaceholder: "— select —",
    noTasksInProject: "no tasks in this project",
    noEpicsInProject: "no epics in this project",
    empty: "empty",
    noProjectsHint: "no projects yet — use projects to split work across contexts",
    deleteProjectHint: "deleting a project just unlinks its epics & tasks — nothing is lost.",
    resetTitle: "Reset everything?",
    resetWarn: "This deletes all epics, sprints, tasks, projects, and the archive. There is no undo.",
    resetTypeHint: (kw) => ["Type ", kw, " to confirm."],
    resetPlaceholder: "type reset",
    reset: "reset",
    created: "created", ago: "ago",
    nTasks: (n) => `${n} ${n === 1 ? "task" : "tasks"}`,
    archivedSuffix: "archived",
    weekN: (n) => `Week ${n}`, projectN: (n) => `Project ${n}`,
    backlog: "Backlog",
    switchTo: (which) => `switch to ${which}`,
    light: "light", dark: "dark", english: "English", russian: "Russian",
  },
  ru: {
    epics: "Эпики", sprints: "Спринты", archive: "Архив", tasks: "Задачи", projects: "Проекты",
    all: "Все", noProject: "Без проекта", none: "нет", manageProjects: "управление проектами",
    addTask: "+ задача", addSprint: "+ спринт", addProject: "+ добавить проект",
    create: "создать", forAllProjects: (n) => `для всех ${n} проектов`,
    newest: "новые", oldest: "старые",
    open: "открыть", openCard: "открыть", archiveAction: "архив", archiveTask: "в архив", archiveSprintAction: "архив спринта",
    settings: "настройки", deleteForever: "удалить навсегда", restore: "восстановить",
    moveToSprint: "перенести", moveToSprintLabel: "Перенести в спринт",
    cancel: "отмена", save: "сохранить", done: "готово", doneFooter: "готово",
    newEpic: "новый эпик", newTask: "новая задача", projectName: "имя проекта",
    untitled: "без названия", sprint: "спринт",
    sprintSettings: "Настройки спринта", name: "Название", goal: "Цель", description: "Описание",
    epicName: "Название эпика", linkedTasks: (n) => `Связанные задачи (${n})`, noTasksLinked: "нет связанных задач",
    epic: "Эпик", project: "Проект",
    notesPlaceholder: "заметки, ссылки, детали...",
    contextPlaceholder: "контекст, заметки, объём...",
    sprintGoalPlaceholder: "чего должен достичь спринт?",
    selectPlaceholder: "— выбрать —",
    noTasksInProject: "нет задач в этом проекте",
    noEpicsInProject: "нет эпиков в этом проекте",
    empty: "пусто",
    noProjectsHint: "проектов пока нет — используйте проекты чтобы разделить работу по контекстам",
    deleteProjectHint: "удаление проекта просто отвязывает его эпики и задачи — ничего не теряется.",
    resetTitle: "Сбросить всё?",
    resetWarn: "Это удалит все эпики, спринты, задачи, проекты и архив. Отмены не будет.",
    resetTypeHint: (kw) => ["Напечатайте ", kw, " чтобы подтвердить."],
    resetPlaceholder: "напечатайте reset",
    reset: "сброс",
    created: "создано", ago: "назад",
    nTasks: (n) => `${n} ${n === 1 ? "задача" : (n >= 2 && n <= 4 ? "задачи" : "задач")}`,
    archivedSuffix: "архивирован",
    weekN: (n) => `Неделя ${n}`, projectN: (n) => `Проект ${n}`,
    backlog: "Бэклог",
    switchTo: (which) => `переключить на ${which}`,
    light: "светлую", dark: "тёмную", english: "English", russian: "Русский",
  },
};
const tFn = (lang) => (key, ...args) => {
  const v = (T[lang] && T[lang][key]) ?? T.en[key] ?? key;
  return typeof v === "function" ? v(...args) : v;
};

const mkTask = (text = "", projectId = null) => ({
  id: uid(), text, desc: "", epicId: null, projectId, done: false, createdAt: now(),
});
const mkEpic = (projectId = null) => ({ id: uid(), text: "", projectId, createdAt: now() });
const mkSprint = (name = "", goal = "") => ({ id: uid(), name, goal, desc: "", tasks: [], createdAt: now() });
const mkProject = (name) => ({ id: uid(), name });

const empty = {
  epics: [],
  sprints: [],
  projects: [],
  archiveTasks: [],
  archiveSprints: [],
  archiveEpics: [],
  activeProject: null,
  // Глобальная сортировка для всех списков (эпики + спринты).
  // "desc" = newest first (default, данные хранятся в этом порядке).
  sort: "desc",
  ui: { archiveOpen: false, archiveSprintExp: {}, theme: "light", lang: "ru" },
  sc: 1,
  pc: 1,
  // Маркер: пользователь явно нажал reset (или это пост-reset state).
  // Без маркера и пустых массивов — считаем "коррапт" и пере-seed'им.
  wasReset: false,
};

const isEssentiallyEmpty = (d) =>
  d &&
  (d.epics?.length || 0) === 0 &&
  (d.sprints?.length || 0) === 0 &&
  (d.projects?.length || 0) === 0 &&
  (d.archiveTasks?.length || 0) === 0 &&
  (d.archiveSprints?.length || 0) === 0 &&
  (d.archiveEpics?.length || 0) === 0;

/* Seed-данные первого запуска: уже наработанная картина, не "пустой Hello World".
   Названия и сроки на русском, реалистичные домены — выглядит как живой трекер. */
const seedDemo = () => {
  const N = Date.now();
  const D = (days, hours = 0) => N - days * 86400000 - hours * 3600000;
  const pPersonal = "p_personal", pWork = "p_work", pStudy = "p_study";
  const eRefactor = "e_refactor", eRelease = "e_release", eCourse = "e_course";
  return {
    // Natural storage order = newest first. sortArr с desc отображает как есть,
    // с asc реверсит. Никаких compensating-трюков не нужно.
    epics: [
      { id: eCourse, text: "Курс по системному дизайну", projectId: pStudy, createdAt: D(3) },
      { id: eRelease, text: "Подготовка релиза v2", projectId: pWork, createdAt: D(6) },
      { id: eRefactor, text: "Рефакторинг auth-флоу", projectId: pWork, createdAt: D(12) },
    ],
    sprints: [
      { id: "s_this", name: "Эта неделя", goal: "Закрыть критичные для релиза задачи", desc: "", createdAt: D(2), tasks: [
        { id: "t6", text: "Обновить резюме под новую вакансию", desc: "", epicId: null, projectId: pPersonal, done: false, createdAt: D(0, 3) },
        { id: "t5", text: "Заказать продукты на неделю", desc: "", epicId: null, projectId: pPersonal, done: false, createdAt: D(0, 8) },
        { id: "t4", text: "Дописать раздел про consensus-протоколы", desc: "Raft + Paxos\nдомашка к лекции 4", epicId: eCourse, projectId: pStudy, done: false, createdAt: D(1, 2) },
        { id: "t3", text: "Code review PR #428 (новый rate-limiter)", desc: "", epicId: null, projectId: pWork, done: false, createdAt: D(1, 6) },
        { id: "t2", text: "Накатить миграцию users.email_verified", desc: "", epicId: eRelease, projectId: pWork, done: true,  createdAt: D(2, 2) },
        { id: "t1", text: "Починить race condition в обновлении токена", desc: "", epicId: eRefactor, projectId: pWork, done: true,  createdAt: D(2, 4) },
      ]},
      { id: "s_next", name: "Следующая неделя", goal: "", desc: "", createdAt: D(1), tasks: [
        { id: "t9", text: "Записаться к стоматологу", desc: "", epicId: null, projectId: pPersonal, done: false, createdAt: D(1) },
        { id: "t8", text: "Разобрать backlog багов из Sentry", desc: "приоритизировать P0/P1", epicId: null, projectId: pWork, done: false, createdAt: D(1) },
        { id: "t7", text: "Презентация архитектуры на ревью команды", desc: "", epicId: eRelease, projectId: pWork, done: false, createdAt: D(1) },
      ]},
      { id: "s_back", name: "Бэклог", goal: "Идеи и задачи без срока", desc: "", createdAt: D(20), tasks: [
        { id: "t11", text: "Перевести pet-проект на TypeScript", desc: "", epicId: null, projectId: pPersonal, done: false, createdAt: D(15) },
        { id: "t10", text: "Прочитать «Designing Data-Intensive Applications»", desc: "", epicId: eCourse, projectId: pStudy, done: false, createdAt: D(20) },
      ]},
    ],
    projects: [
      { id: pWork, name: "Работа" },
      { id: pPersonal, name: "Личное" },
      { id: pStudy, name: "Учёба" },
    ],
    archiveTasks: [
      { id: "ta1", text: "Хотфикс: фикс отображения статуса в админке", desc: "", epicId: null, projectId: pWork, done: true, createdAt: D(8), archivedAt: D(7) },
      { id: "ta2", text: "Купить билеты в отпуск", desc: "", epicId: null, projectId: pPersonal, done: true, createdAt: D(15), archivedAt: D(10) },
    ],
    archiveSprints: [
      { id: "sa1", name: "Прошлая неделя", goal: "Завершить онбординг", desc: "", createdAt: D(14), archivedAt: D(7), tasks: [
        { id: "ta_s2", text: "Прочитать internal docs", desc: "", epicId: null, projectId: pWork, done: true, createdAt: D(13) },
        { id: "ta_s1", text: "Настроить локальное окружение", desc: "", epicId: null, projectId: pWork, done: true, createdAt: D(14) },
      ]},
    ],
    archiveEpics: [],
    activeProject: null,
    sort: "desc",
    ui: { archiveOpen: false, archiveSprintExp: {}, theme: "light", lang: "ru" },
    sc: 4, pc: 4,
  };
};

const migrate = (raw) => {
  if (!raw) return empty;
  // Старый формат sort был объектом {epics, sprints} — схлопываем в одну строку.
  // Цвет проектов больше не используется в UI (референсный дизайн),
  // но существующее поле color в данных не трогаем (backward-compat).
  const sortNormalized = typeof raw.sort === "string" ? raw.sort : (raw.sort?.epics || raw.sort?.sprints || empty.sort);
  return {
    ...empty,
    ...raw,
    sort: sortNormalized,
    ui: { ...empty.ui, ...(raw.ui || {}) },
    projects: raw.projects || [],
    epics: (raw.epics || []).map(e => ({ projectId: null, createdAt: 0, ...e })),
    sprints: (raw.sprints || []).map(s => ({ createdAt: 0, ...s, tasks: (s.tasks || []).map(t => ({ projectId: null, ...t })) })),
    archiveEpics: (raw.archiveEpics || []).map(e => ({ projectId: null, ...e })),
    archiveTasks: (raw.archiveTasks || []).map(t => ({ projectId: null, ...t })),
  };
};

function useStore() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Undo stack: до 30 предыдущих состояний, в памяти (не персистентно).
  // Reload обнуляет. Каждый save() кладёт prev в стек (если не skipUndo).
  const undoStack = useRef([]);
  const MAX_UNDO = 30;
  const [canUndo, setCanUndo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(KEY);
        const stored = r ? migrate(JSON.parse(r.value)) : null;
        // Seed условие: либо ключа нет, либо данные пусты И не было reset'а.
        // Reset кладёт wasReset:true → блокирует автовозврат демо.
        if (!stored || (isEssentiallyEmpty(stored) && !stored.wasReset)) {
          const seed = seedDemo();
          setData(seed);
          await window.storage.set(KEY, JSON.stringify(seed));
        } else {
          setData(stored);
        }
      } catch {
        setData(empty);
      }
      setLoading(false);
    })();
  }, []);

  const save = useCallback(async (next, opts = {}) => {
    setData(prev => {
      if (prev && !opts.skipUndo) {
        const stack = undoStack.current;
        stack.push(prev);
        if (stack.length > MAX_UNDO) stack.shift();
        setCanUndo(stack.length > 0);
      }
      return next;
    });
    try { await window.storage.set(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const undo = useCallback(async () => {
    const stack = undoStack.current;
    if (stack.length === 0) return null;
    const prev = stack.pop();
    setCanUndo(stack.length > 0);
    setData(prev);
    try { await window.storage.set(KEY, JSON.stringify(prev)); } catch {}
    return prev;
  }, []);

  return { data, loading, save, undo, canUndo };
}

function useNarrow(threshold = 600) {
  const [narrow, setNarrow] = useState(typeof window !== "undefined" && window.innerWidth < threshold);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < threshold);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [threshold]);
  return narrow;
}

/* ── Virtual-keyboard inset via Visual Viewport API.
   Когда on-screen keyboard открывается, visualViewport.height < innerHeight.
   Разница (+ offsetTop на iOS где scroll вместо resize) = высота keyboard'а.
   Используем в Drawer/Toast чтобы action-кнопки не улетали под клавиатуру.
   Safari 13+, Chrome 61+. Fallback 0 (ни одна кнопка не уедет, просто менее precise). */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setInset(Math.max(0, Math.round(kb)));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/* ── Online/offline detection. navigator.onLine ненадёжен при старте,
   но 'online'/'offline' events срабатывают реально при смене сети.
   Используем для user feedback: приложение работает оффлайн (localStorage),
   но пользователь должен видеть это состояние явно. */
function useOnline() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/* ── Inline editable text ── */
function Inline({ value, onSave, placeholder, style: s = {} }) {
  const [ed, setEd] = useState(false);
  const [t, setT] = useState(value);
  const r = useRef(null);
  useEffect(() => setT(value), [value]);
  useEffect(() => { if (ed && r.current) r.current.focus(); }, [ed]);
  if (!ed) return (
    <span onClick={() => setEd(true)} style={{ cursor: "text", ...s }}>
      {value || <span style={{ color: "var(--fg-3)", fontStyle: "italic" }}>{placeholder}</span>}
    </span>
  );
  const commit = () => { setEd(false); if (t.trim() !== value) onSave(t.trim()); };
  return (
    <input
      ref={r} value={t}
      onChange={e => setT(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setT(value); setEd(false); } }}
      placeholder={placeholder}
      autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" spellCheck
      style={{ all: "unset", width: "100%", font: "inherit", color: "inherit", borderBottom: "1.5px solid var(--fg-3)", ...s }}
    />
  );
}

/* ── Custom Select ── */
function Select({ value, onChange, options, placeholder = "—", disabled = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const current = options.find(o => o.value === value);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          all: "unset", display: "flex", alignItems: "center", gap: 8,
          width: "100%", boxSizing: "border-box",
          padding: "8px 10px", fontSize: 13, color: "var(--fg)", cursor: disabled ? "default" : "pointer",
          background: disabled ? "var(--surface)" : "var(--panel)",
          border: "1px solid var(--line)", borderRadius: 4, fontFamily: "inherit",
          opacity: disabled ? 0.7 : 1,
          transition: "border-color var(--fast) ease-out, background var(--fast) ease-out",
        }}
      >
        {/* Flex + min-width:0 + trunc — старый float:right arrow давал overflow
            при длинных label'ах (в узком модалке на мобиле 1fr-колонки ≈ 168px,
            а "Designing Data-Intensive Applications" рендерится ~280px). */}
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {current ? current.label : <span style={{ color: "var(--fg-3)" }}>{placeholder}</span>}
        </span>
        <span style={{ color: "var(--fg-3)", fontSize: 11, flexShrink: 0 }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="anim-menu" style={{
          position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, zIndex: 20,
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 4,
          maxHeight: 200, overflowY: "auto", boxShadow: "var(--menu-shadow)",
        }}>
          {options.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                all: "unset", display: "block", width: "100%", boxSizing: "border-box",
                padding: "8px 10px", fontSize: 13, fontFamily: "inherit",
                color: o.value === value ? "var(--fg)" : "var(--fg-2)", cursor: "pointer",
                background: o.value === value ? "var(--surface-2)" : "transparent",
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = "var(--surface)"; }}
              onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Circle checkbox: круг 20px, 2px border, зелёная заливка + SVG-галочка.
   Hover масштабируется x1.15 и обводка подсвечивается зелёным (CSS .circle). */
function Checkbox({ checked, onChange, size = 20 }) {
  const prev = useRef(checked);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!prev.current && checked) { setPulse(true); const t = setTimeout(() => setPulse(false), 300); return () => clearTimeout(t); }
    prev.current = checked;
  }, [checked]);
  return (
    <button
      onClick={onChange}
      role="checkbox"
      aria-checked={checked}
      className={"circle" + (pulse ? " cb-pulse" : "")}
      style={{
        all: "unset", boxSizing: "border-box",
        width: size, height: size, flexShrink: 0,
        border: `2px solid ${checked ? "var(--accent)" : "var(--line-2)"}`,
        borderRadius: "50%",
        background: checked ? "var(--accent)" : "transparent",
        cursor: "pointer", display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        transition: "background var(--fast) ease-out, border-color var(--fast) ease-out, transform var(--fast) ease-out",
      }}
    >
      {checked && (
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6 L5 8.5 L9.5 3.5" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

/* ── Progress bar: полоска 40×3px + текст "{done}/{total}".
   Indigo (brand) при <100%, зелёная (accent) при 100%. */
function Progress({ done, total }) {
  if (total === 0) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  const complete = pct === 100;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 40, height: 3, borderRadius: 2, background: "var(--line)", overflow: "hidden", display: "inline-block" }}>
        <span style={{
          display: "block", height: "100%",
          width: `${pct}%`,
          background: complete ? "var(--accent)" : "var(--pill-fg)",
          borderRadius: 2,
          transition: "width var(--med) var(--ease-out-quart), background var(--fast) ease-out",
        }} />
      </span>
      <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{done}/{total}</span>
    </span>
  );
}

/* ── Inline sprint creation form.
   Открывается по "+" в Sprints. Поля: name (autofocus), goal.
   Кнопки: create, "for all N projects" (если >1), cancel.
   Enter → create (с пустым goal если не заполнен), Escape → cancel. */
function NewSprintForm({ projects, defaultName, t, onCreate, onCreateForAll, onCancel }) {
  const [name, setName] = useState(defaultName || "");
  const [goal, setGoal] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select?.();
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const submit = () => { if (!name.trim()) return; onCreate(name.trim(), goal.trim()); };
  const submitAll = () => { if (!name.trim()) return; onCreateForAll(name.trim(), goal.trim()); };
  const onKey = e => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); };
  return (
    <div style={{
      marginBottom: 14, padding: 14,
      background: "var(--surface)",
      border: "1.5px dashed var(--line-2)",
      borderRadius: 8,
    }}>
      <input
        ref={ref} value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey}
        placeholder={t("name")}
        autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" spellCheck
        style={{
          all: "unset", font: "inherit", fontSize: 14,
          width: "100%", borderBottom: "1.5px solid var(--fg-4)",
          color: "var(--fg)", paddingBottom: 4, marginBottom: 10, boxSizing: "border-box",
        }} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: "var(--fg-4)", flexShrink: 0 }}>{t("goal").toLowerCase()}</span>
        <input
          value={goal} onChange={e => setGoal(e.target.value)} onKeyDown={onKey}
          placeholder={t("sprintGoalPlaceholder")}
          autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" spellCheck
          style={{
            all: "unset", font: "inherit", fontSize: 13,
            flex: 1, borderBottom: "1.5px solid var(--fg-5)",
            color: "var(--fg)", paddingBottom: 2, boxSizing: "border-box",
          }} />
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={submit} style={{
          all: "unset", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600,
          color: "var(--active-fg)", background: "var(--active-bg)",
          padding: "8px 16px", borderRadius: 5,
        }}>{t("create") || "create"}</button>
        {projects.length > 1 && (
          <button onClick={submitAll} style={{
            all: "unset", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            color: "var(--fg-3)", padding: "8px 10px",
          }}>{t("forAllProjects", projects.length)}</button>
        )}
        <button onClick={onCancel} style={{
          all: "unset", cursor: "pointer", fontFamily: "inherit", fontSize: 13,
          color: "var(--fg-3)", padding: "8px 10px",
        }}>{t("cancel")}</button>
      </div>
    </div>
  );
}

/* ── ProjectTag — униформ-тинт (--pill-*).
   В v1 был per-project цвет, но референс PRD v2 требует единого визуала
   для минимализации цветового шума. Используем brand pill-токены. */
function ProjectTag({ project, maxWidth }) {
  if (!project) return null;
  return (
    <span style={{
      display: "inline-block",
      fontSize: 10, fontFamily: "inherit",
      color: "var(--pill-fg)",
      background: "var(--pill-bg)",
      padding: "1px 6px",
      borderRadius: 3,
      whiteSpace: "nowrap",
      lineHeight: 1.4,
      fontWeight: 500,
      /* Flex-child guard: без flexShrink:0 в узком контейнере nowrap-текст
         выпадает за пределы tag'а и ломает meta-row (длинное имя проекта
         толкает дату за край экрана). Опциональный maxWidth + ellipsis —
         для случаев, когда project name реально слишком длинный. */
      flexShrink: 0,
      ...(maxWidth ? { maxWidth, overflow: "hidden", textOverflow: "ellipsis" } : null),
    }}>{project.name}</span>
  );
}

/* ── Overflow menu ── */
function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* data-overflow-trigger используется long-press handler'ом в TaskRow —
          на контексте row'а находим этот button и триггерим click. Переиспользуем
          существующую open/close логику вместо дублирования menu state. */}
      <button data-overflow-trigger="" onClick={() => setOpen(o => !o)} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 16, lineHeight: 1 }}>…</button>
      {open && (
        <div className="anim-menu" style={O.dd}>
          {items.map((it, i) => (
            <button key={i} onClick={() => { it.onClick(); setOpen(false); }}
              style={{ ...B, display: "block", padding: "8px 12px", fontSize: 12, color: it.danger ? "var(--danger)" : "var(--fg)", width: "100%", textAlign: "left" }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Hooks to resolve tasks/epics across the dataset ── */
function useAllTasks(data, t) {
  return useMemo(() => {
    if (!data) return [];
    const tasks = [];
    data.sprints.forEach(s => s.tasks.forEach(tk => tasks.push({ ...tk, _loc: s.name })));
    data.archiveTasks.forEach(tk => tasks.push({ ...tk, _loc: t ? t("archive") : "Archive" }));
    data.archiveSprints.forEach(s => s.tasks.forEach(tk => tasks.push({ ...tk, _loc: `${s.name} (${t ? t("archivedSuffix") : "archived"})` })));
    return tasks;
  }, [data, t]);
}
function useAllEpics(data) {
  return useMemo(() => data ? [...data.epics, ...data.archiveEpics] : [], [data]);
}
const matchesProject = (item, active) => {
  if (active == null) return true;
  if (active === "none") return !item.projectId;
  return item.projectId === active;
};
// Данные хранятся в newest-first порядке (prepend при создании).
// desc = показывать как есть, asc = реверсить (oldest first).
const sortArr = (arr, dir) => dir === "asc" ? [...arr].reverse() : arr;

/* ── Sheet wrapper.
   Desktop: centered modal (unchanged — anim-box slide-up).
   Mobile: Vaul bottom sheet — drag-to-dismiss, focus trap, scroll lock,
   Radix Dialog a11y. Drag handle теперь реально draggable. */
const SR_ONLY = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};
function Sheet({ children, onClose }) {
  const narrow = useNarrow();
  // Keyboard inset: когда user фокусит input внутри drawer'а, visualViewport
  // shrinks. Добавляем inset к paddingBottom drawer'а и к bottom Toast'а
  // чтобы action-кнопки / toast не улетали под клавиатуру.
  const kbInset = useKeyboardInset();
  // Haptic pulse при открытии drawer'а — лёгкий acknowledgement как в iOS.
  useEffect(() => { haptic(5); }, []);
  if (narrow) {
    return (
      <Drawer.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
        <Drawer.Portal>
          <Drawer.Overlay style={{
            position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 100,
          }} />
          <Drawer.Content
            onOpenAutoFocus={(e) => {
              // Radix auto-focuses the first tabbable на mount, что перехватывает
              // наши useEffect'ы (TaskModal/ResetModal фокусят title-input, чтобы
              // юзер сразу печатал). preventDefault отдаёт focus дочерним компонентам.
              e.preventDefault();
            }}
            style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
            background: "var(--panel)", color: "var(--fg)",
            borderRadius: "16px 16px 0 0",
            padding: "var(--modal-pad)",
            paddingTop: 8,
            /* Bottom padding: 28px breathing room + home-indicator inset + keyboard inset.
               kbInset добавляется когда открыта soft keyboard (Visual Viewport API) —
               кнопки save/cancel остаются видимыми над клавиатурой. */
            paddingBottom: `calc(28px + env(safe-area-inset-bottom) + ${kbInset}px)`,
            maxHeight: "92dvh",
            boxShadow: "0 -10px 32px rgba(0, 0, 0, 0.18)",
            fontFamily: "'SF Mono','Menlo','Consolas',ui-monospace,monospace",
            borderTop: "1px solid var(--line)",
            outline: "none",
            display: "flex", flexDirection: "column",
            /* Smooth height transition когда keyboard появляется/исчезает —
               spring-soft chosen так чтобы drawer не "прыгал" резко. */
            transition: "padding-bottom 200ms var(--ease-spring-soft)",
          }}>
            {/* A11y: Vaul требует Title+Description, прячем через sr-only —
                визуально повторять "Sheet" бессмысленно, смысл даёт контент. */}
            <Drawer.Title style={SR_ONLY}>Sheet</Drawer.Title>
            <Drawer.Description style={SR_ONLY}>Dialog</Drawer.Description>
            <Drawer.Handle style={{
              width: 40, height: 5, borderRadius: 3,
              background: "var(--line-2)",
              margin: "6px auto 14px",
              flexShrink: 0,
              cursor: "grab",
            }} />
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
              {children}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }
  // Desktop: centered modal — unchanged behaviour.
  return (
    <div className="anim-overlay" style={O.bg} onClick={onClose}>
      <div className="anim-box" style={O.box} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* ── Task Modal ── */
function TaskModal({ task, allEpics, projects, sprints, onUpdate, onDelete, onClose, onMove, readOnly = false, t, lang }) {
  const [text, setText] = useState(task.text || "");
  const [desc, setDesc] = useState(task.desc || "");
  const [epicId, setEpicId] = useState(task.epicId || "");
  const [projectId, setProjectId] = useState(task.projectId || "");
  const titleRef = useRef(null);
  // Модалка была открыта на свежесозданной задаче если title изначально пустой.
  // Тогда cancel удаляет task (не оставлять мусор), save с пустым — тоже удаляет.
  const wasEmpty = !task.text;
  useEffect(() => {
    if (!wasEmpty) return;
    // RAF отдаёт Vaul/Radix FocusScope сперва отработать mount-focus,
    // потом мы ставим фокус на title — пользователь может сразу печатать.
    const id = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select?.();
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const save = () => {
    const finalText = text.trim();
    if (!readOnly) {
      if (!finalText && onDelete) { onDelete(); onClose(); return; }
      onUpdate({ ...task, text: finalText, desc, epicId: epicId || null, projectId: projectId || null });
    }
    onClose();
  };
  const cancel = () => {
    if (wasEmpty && !text.trim() && onDelete) onDelete();
    onClose();
  };
  const epicOpts = [{ value: "", label: t("none") }, ...allEpics.map(e => ({ value: e.id, label: e.text || t("untitled") }))];
  const projOpts = [{ value: "", label: t("noProject") }, ...projects.map(p => ({ value: p.id, label: p.name }))];
  const sprintOpts = sprints.map(s => ({ value: s.id, label: s.name }));
  return (
    <Sheet onClose={cancel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 6, gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {readOnly ? (
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)", lineHeight: 1.35, wordBreak: "break-word" }}>
                {task.text || t("untitled")}
                {task.done && <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 8, fontWeight: 500 }}>{t("done")}</span>}
              </div>
            ) : (
              <input
                ref={titleRef}
                value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                placeholder={t("newTask")}
                autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" spellCheck
                style={{
                  all: "unset", font: "inherit", fontSize: 16, fontWeight: 600,
                  width: "100%", color: "var(--fg)",
                  borderBottom: "1.5px solid var(--fg-4)",
                  paddingBottom: 4,
                }} />
            )}
            {!readOnly && task.done && <span style={{ fontSize: 11, color: "var(--accent)", marginLeft: 0, marginTop: 6, fontWeight: 500, display: "inline-block" }}>{t("done")}</span>}
          </div>
          <button onClick={cancel} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 18, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginBottom: 20, marginTop: 8, fontStyle: "italic" }}>
          {t("created")} {fmt(task.createdAt, lang)} · {rel(task.createdAt, lang)} {t("ago")}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div>
            <label style={O.label}>{t("epic")}</label>
            <Select value={epicId} onChange={setEpicId} options={epicOpts} disabled={readOnly} />
          </div>
          <div>
            <label style={O.label}>{t("project")}</label>
            <Select value={projectId} onChange={setProjectId} options={projOpts} disabled={readOnly} />
          </div>
        </div>

        {!readOnly && onMove && sprintOpts.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={O.label}>{t("moveToSprintLabel")}</label>
            <Select value="" onChange={(id) => { if (id) { onMove(id); onClose(); } }} options={[{value:"", label: t("selectPlaceholder")}, ...sprintOpts]} />
          </div>
        )}

        <label style={O.label}>{t("description")}</label>
        <textarea readOnly={readOnly} value={desc} onChange={e => setDesc(e.target.value)}
          placeholder={t("notesPlaceholder")} rows={7}
          autoComplete="off" autoCapitalize="sentences" spellCheck
          style={O.textarea} />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 18 }}>
          <button onClick={cancel} style={{ ...B, color: "var(--fg-3)", fontSize: 13, padding: "8px 4px" }}>{t("cancel")}</button>
          {!readOnly && <button onClick={save} style={{ ...B, color: "var(--fg)", fontSize: 13, fontWeight: 700, padding: "8px 4px" }}>{t("save")}</button>}
        </div>
    </Sheet>
  );
}

/* ── Sprint Modal ── */
function SprintModal({ sprint, onUpdate, onClose, t }) {
  const [name, setName] = useState(sprint.name || "");
  const [goal, setGoal] = useState(sprint.goal || "");
  const [desc, setDesc] = useState(sprint.desc || "");
  const save = () => { onUpdate({ ...sprint, name, goal, desc }); onClose(); };
  return (
    <Sheet onClose={onClose}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>{t("sprintSettings")}</div>
          <button onClick={onClose} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 18 }}>×</button>
        </div>
        <label style={O.label}>{t("name")}</label>
        <input value={name} onChange={e => setName(e.target.value)}
          autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" spellCheck
          style={{ all: "unset", font: "inherit", fontSize: 14, width: "100%", borderBottom: "1.5px solid var(--fg-3)", color: "var(--fg)", marginBottom: 14, paddingBottom: 2, boxSizing: "border-box" }} />
        <label style={O.label}>{t("goal")}</label>
        <input value={goal} onChange={e => setGoal(e.target.value)} placeholder={t("sprintGoalPlaceholder")}
          autoComplete="off" autoCapitalize="sentences" enterKeyHint="next" spellCheck
          style={{ all: "unset", font: "inherit", fontSize: 13, width: "100%", borderBottom: "1.5px solid var(--fg-4)", color: "var(--fg)", marginBottom: 14, paddingBottom: 2, boxSizing: "border-box", fontStyle: goal ? "normal" : "italic" }} />
        <label style={O.label}>{t("description")}</label>
        <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder={t("contextPlaceholder")} rows={5}
          autoComplete="off" autoCapitalize="sentences" spellCheck
          style={O.textarea} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...B, color: "var(--fg-3)", fontSize: 13, padding: "8px 4px" }}>{t("cancel")}</button>
          <button onClick={save} style={{ ...B, color: "var(--fg)", fontSize: 13, fontWeight: 700, padding: "8px 4px" }}>{t("save")}</button>
        </div>
    </Sheet>
  );
}

/* ── Epic Modal ── */
function EpicModal({ epic, allTasks, projects, onUpdate, onDelete, onClose, onOpenTask, readOnly = false, t }) {
  const [text, setText] = useState(epic.text || "");
  const [projectId, setProjectId] = useState(epic.projectId || "");
  const linked = allTasks.filter(x => x.epicId === epic.id);
  const wasEmpty = !epic.text;
  const save = () => {
    const finalText = text.trim();
    if (!readOnly) {
      if (!finalText && onDelete) { onDelete(); onClose(); return; }
      onUpdate({ ...epic, text: finalText, projectId: projectId || null });
    }
    onClose();
  };
  const cancel = () => {
    if (wasEmpty && !text.trim() && onDelete) onDelete();
    onClose();
  };
  const projOpts = [{ value: "", label: t("noProject") }, ...projects.map(p => ({ value: p.id, label: p.name }))];
  return (
    <Sheet onClose={cancel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16, gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label style={O.label}>{t("epicName")}</label>
            {readOnly
              ? <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)", wordBreak: "break-word" }}>{epic.text}</div>
              : <input autoFocus={!epic.text} value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
                  autoComplete="off" autoCapitalize="sentences" enterKeyHint="done" spellCheck
                  style={{ all: "unset", font: "inherit", fontSize: 16, fontWeight: 700, width: "100%", borderBottom: "1.5px solid var(--fg-3)", color: "var(--fg)" }} />
            }
          </div>
          <button onClick={cancel} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 18, flexShrink: 0 }}>×</button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={O.label}>{t("project")}</label>
          <Select value={projectId} onChange={setProjectId} options={projOpts} disabled={readOnly} />
        </div>

        <label style={O.label}>{t("linkedTasks", linked.length)}</label>
        {linked.length === 0 && <div style={{ color: "var(--fg-4)", fontSize: 13, marginTop: 4 }}>{t("noTasksLinked")}</div>}
        {linked.map(x => (
          <div key={x.id} onClick={() => onOpenTask(x)}
            style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", cursor: "pointer", fontSize: 13, color: x.done ? "var(--fg-3)" : "var(--fg)" }}>

            <span style={x.done ? { textDecoration: "line-through", flex: 1 } : { flex: 1 }}>{x.text || t("untitled")}</span>
            <span style={{ fontSize: 10, color: "var(--fg-3)", fontStyle: "italic" }}>{x._loc}</span>
            {x.done && <span style={{ fontSize: 10, color: "var(--accent)" }}>{t("done")}</span>}
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 22 }}>
          <button onClick={cancel} style={{ ...B, color: "var(--fg-3)", fontSize: 13, padding: "8px 4px" }}>{t("cancel")}</button>
          {!readOnly && <button onClick={save} style={{ ...B, color: "var(--fg)", fontSize: 13, fontWeight: 700, padding: "8px 4px" }}>{t("save")}</button>}
        </div>
    </Sheet>
  );
}

/* ── Projects Modal ── */
function ProjectsModal({ projects, onAdd, onRename, onDelete, onClose, t }) {
  return (
    <Sheet onClose={onClose}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)" }}>{t("projects")}</div>
          <button onClick={onClose} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 18 }}>×</button>
        </div>
        {projects.length === 0 && (
          <div style={{ color: "var(--fg-3)", fontSize: 13, marginBottom: 14, fontStyle: "italic" }}>
            {t("noProjectsHint")}
          </div>
        )}
        {projects.map(p => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 34 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Inline value={p.name} onSave={name => onRename(p.id, name)} placeholder={t("projectName")} />
            </div>
            <button onClick={() => onDelete(p.id)} title="delete project" className="icon-btn" style={{ ...B, color: "var(--fg-4)", fontSize: 13 }}>×</button>
          </div>
        ))}
        <button onClick={onAdd} style={{ ...ADD, marginTop: 10 }}>{t("addProject")}</button>
        <div style={{ fontSize: 11, color: "var(--fg-3)", marginTop: 18, lineHeight: 1.5 }}>
          {t("deleteProjectHint")}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 14 }}>
          <button onClick={onClose} style={{ ...B, color: "var(--fg)", fontSize: 13, fontWeight: 700, padding: "8px 4px" }}>{t("doneFooter")}</button>
        </div>
    </Sheet>
  );
}

/* ── Reset confirm modal ── */
function ResetModal({ onConfirm, onClose, t }) {
  const [val, setVal] = useState("");
  const r = useRef(null);
  useEffect(() => {
    const id = requestAnimationFrame(() => r.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);
  // Keyword stays English: it's a security pattern, not a translatable label.
  const KW = "reset";
  const ok = val.trim().toLowerCase() === KW;
  const hint = t("resetTypeHint", KW);
  return (
    <Sheet onClose={onClose}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--fg)", marginBottom: 8 }}>{t("resetTitle")}</div>
        <div style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 18, lineHeight: 1.5 }}>
          {t("resetWarn")}{" "}
          {hint[0]}<span style={{ color: "var(--danger)", fontWeight: 700 }}>{hint[1]}</span>{hint[2]}
        </div>
        <input ref={r} value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && ok) onConfirm(); if (e.key === "Escape") onClose(); }}
          placeholder={t("resetPlaceholder")}
          autoComplete="off" autoCapitalize="off" autoCorrect="off" enterKeyHint="send" spellCheck={false}
          style={{ all: "unset", font: "inherit", fontSize: 14, width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 4, boxSizing: "border-box", color: "var(--fg)", background: "var(--bg)" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 14, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...B, color: "var(--fg-3)", fontSize: 13, padding: "8px 4px" }}>{t("cancel")}</button>
          <button onClick={ok ? onConfirm : undefined} disabled={!ok}
            style={{ ...B, color: ok ? "var(--danger)" : "var(--fg-4)", fontSize: 13, fontWeight: 700, cursor: ok ? "pointer" : "default", padding: "8px 4px" }}>
            {KW}
          </button>
        </div>
    </Sheet>
  );
}

/* ── Project filter bar ── */
function FilterBar({ projects, active, onSelect, onOpenProjects, t }) {
  const items = [
    { key: null, label: t("all") },
    ...projects.map(p => ({ key: p.id, label: p.name })),
    ...(projects.length > 0 ? [{ key: "none", label: t("noProject") }] : []),
  ];
  return (
    <div className="pill-row">
      {items.map(it => {
        const on = active === it.key;
        // Нейтральная схема (без per-project цветов): active = inverted,
        // inactive = outline. Соответствует референс-дизайну PRD v2.
        return (
          <button key={String(it.key)} onClick={() => onSelect(it.key)} style={{
            all: "unset", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            padding: "7px 13px", borderRadius: 14, whiteSpace: "nowrap",
            border: on ? "1px solid var(--active-bg)" : "1px solid var(--line)",
            background: on ? "var(--active-bg)" : "var(--panel)",
            color: on ? "var(--active-fg)" : "var(--fg-2)",
            transition: "background var(--fast) ease-out, color var(--fast) ease-out, border-color var(--fast) ease-out",
          }}>{it.label}</button>
        );
      })}
      <button onClick={onOpenProjects} title={t("manageProjects")} className="icon-btn"
        style={{ ...B, color: "var(--fg-3)", fontSize: 14, marginLeft: 2 }}>⚙</button>
    </div>
  );
}

/* Sort toggle убран — теперь глобальная сортировка находится в UtilityCluster
   (сразу за Undo). Влияет на порядок эпиков и спринтов одновременно. */

/* ── Swipeable row wrapper: iOS Mail-style swipe-left-to-archive.
   Только touch (pointerType === "touch"). Desktop/mouse — просто children.
   Вертикальный dy > dx → отпускаем pointer, native scroll работает.
   При пересечении threshold'а haptic pulse (preview — "это сработает").
   При release выше threshold'а — haptic [10,30,10] + анимация исчезновения + onArchive.
   touchAction:pan-y нужен чтобы браузер не отдал нам вертикальный swipe. */
function SwipeableRow({ children, onArchive, disabled }) {
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const state = useRef({ startX: 0, startY: 0, pointerId: null, hapticFired: false, isSwipe: false });
  const THRESHOLD_RATIO = 0.35;

  if (disabled) return children;

  const onPointerDown = (e) => {
    if (e.pointerType !== "touch") return;
    state.current.startX = e.clientX;
    state.current.startY = e.clientY;
    state.current.pointerId = e.pointerId;
    state.current.hapticFired = false;
    state.current.isSwipe = false;
    setAnimating(false);
  };

  const onPointerMove = (e) => {
    if (state.current.pointerId !== e.pointerId) return;
    const dxRaw = e.clientX - state.current.startX;
    const dy = e.clientY - state.current.startY;

    // Определяем направление один раз. Если вертикальное доминирует —
    // отпускаем pointer, браузер берёт native scroll.
    if (!state.current.isSwipe) {
      if (Math.abs(dy) > Math.abs(dxRaw) && Math.abs(dy) > 6) {
        state.current.pointerId = null;
        return;
      }
      if (dxRaw < -6) {
        state.current.isSwipe = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      } else {
        return;
      }
    }

    const d = Math.min(0, dxRaw);
    setDx(d);

    const rowWidth = e.currentTarget.offsetWidth || 300;
    const threshold = -rowWidth * THRESHOLD_RATIO;
    if (d < threshold && !state.current.hapticFired) {
      haptic(15);
      state.current.hapticFired = true;
    } else if (d > threshold && state.current.hapticFired) {
      haptic(5);
      state.current.hapticFired = false;
    }
  };

  const onPointerUp = (e) => {
    if (state.current.pointerId !== e.pointerId) return;
    state.current.pointerId = null;
    const wasSwipe = state.current.isSwipe;
    state.current.isSwipe = false;
    if (!wasSwipe) return;

    const rowWidth = e.currentTarget.offsetWidth || 300;
    const threshold = -rowWidth * THRESHOLD_RATIO;
    setAnimating(true);
    if (dx < threshold) {
      haptic([10, 30, 10]);
      setDx(-rowWidth);
      // onArchive через таймер чтобы CSS transition успела визуально сыграть.
      setTimeout(() => onArchive(), 180);
    } else {
      setDx(0);
    }
  };

  // Интенсивность red background: плавно появляется при swipe, полностью видно
  // после ~20% пути. До этого — никакого flicker'а на micro-move'ах.
  const bgOpacity = Math.min(1, Math.abs(dx) / 30);

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 4, marginBottom: 4 }}>
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background: "var(--danger)",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          paddingRight: 18,
          color: "var(--accent-ink)",
          fontSize: 18, fontWeight: 700,
          opacity: bgOpacity,
          pointerEvents: "none",
        }}
      >
        ×
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "relative",
          transform: `translate3d(${dx}px, 0, 0)`,
          transition: animating ? "transform 240ms var(--ease-spring-soft)" : "none",
          background: "var(--surface)",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ── Task Row ── */
function TaskRow({ task, allEpics, projects, onUpdate, onSoftDelete, onToggleDone, moveTargets = [], onMove, onOpen, narrow, t, lang }) {
  const [showMove, setShowMove] = useState(false);
  const moveRef = useRef(null);
  useEffect(() => {
    if (!showMove) return;
    const onDoc = (e) => { if (moveRef.current && !moveRef.current.contains(e.target)) setShowMove(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showMove]);
  const ep = allEpics.find(e => e.id === task.epicId);
  const pr = projects.find(p => p.id === task.projectId);

  const actions = narrow ? (
    <OverflowMenu items={[
      ...(moveTargets.length > 0 ? moveTargets.map(m => ({ label: `→ ${m.label}`, onClick: () => onMove(task.id, m.key) })) : []),
      { label: t("open"), onClick: () => onOpen(task) },
      { label: t("archiveAction"), onClick: () => onSoftDelete(task.id), danger: true },
    ]} />
  ) : (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {moveTargets.length > 0 && (
        <div ref={moveRef} style={{ position: "relative" }}>
          <button onClick={() => setShowMove(!showMove)} title={t("moveToSprint")} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 12 }}>→</button>
          {showMove && (
            <div className="anim-menu" style={O.dd}>
              {moveTargets.map(mt => (
                <button key={mt.key} onClick={() => { onMove(task.id, mt.key); setShowMove(false); }}
                  style={{ ...B, display: "block", padding: "8px 12px", fontSize: 12, color: "var(--fg)", width: "100%", textAlign: "left" }}>
                  {mt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button onClick={() => onOpen(task)} title={t("openCard")} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 12 }}>≡</button>
      <button onClick={() => onSoftDelete(task.id)} title={t("archiveTask")} className="icon-btn" style={{ ...B, color: "var(--fg-3)" }}>×</button>
    </div>
  );

  // Mobile: title row + meta row (pill / epic / age) below.
  // Desktop: single dense row preserving the YouTrack-style rhythm.
  if (narrow) {
    const hasMeta = ep || pr;
    // opacity ставим только на checkbox+content, НЕ на actions —
    // иначе выпадашка OverflowMenu внутри actions наследует прозрачность.
    const dim = task.done ? { opacity: 0.55 } : null;
    // Long-press → контекстное меню. Native contextmenu event fires через
    // 500ms holdом на iOS/Android touch. preventDefault убирает native
    // "copy/share" бабл, haptic pulse подтверждает trigger, затем симулируем
    // click по OverflowMenu trigger'у чтобы открыть наше меню.
    const onLongPress = (e) => {
      e.preventDefault();
      haptic(10);
      const btn = e.currentTarget.querySelector('[data-overflow-trigger]');
      if (btn) btn.click();
    };
    return (
      <SwipeableRow onArchive={() => onSoftDelete(task.id)}>
        <div
          onContextMenu={onLongPress}
          style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "4px 0",
            WebkitUserSelect: "none", userSelect: "none",
          }}
          data-task-id={task.id}
        >
          <div style={{ paddingTop: 3, ...dim }}>
            <Checkbox checked={task.done} onChange={() => onToggleDone(task.id)} />
          </div>
          <div onClick={() => onOpen(task)} style={{ flex: 1, minWidth: 0, cursor: "pointer", ...dim }}>
          <div style={{
            ...(task.done ? { textDecoration: "line-through", color: "var(--fg-3)" } : {}),
            overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {task.text || <span style={{ color: "var(--fg-4)", fontStyle: "italic" }}>{t("newTask")}</span>}
          </div>
          {hasMeta && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 11, color: "var(--fg-3)", minWidth: 0 }}>
              {pr && <ProjectTag project={pr} maxWidth={110} />}
              {/* Epic берёт всё оставшееся пространство между pill'ом и датой,
                  усечение по ellipsis. Старый maxWidth:60% ломался при длинном
                  project name — flex-распределение корректнее. */}
              {ep && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>#{ep.text}</span>}
              {!ep && <span style={{ flex: 1 }} />}
              <span style={{ fontStyle: "italic", color: "var(--fg-4)", flexShrink: 0 }}>{rel(task.createdAt, lang)}</span>
            </div>
          )}
          {!hasMeta && (
            <div style={{ marginTop: 1, fontSize: 11, color: "var(--fg-4)", fontStyle: "italic" }}>{rel(task.createdAt, lang)}</div>
          )}
          </div>
          <div style={{ paddingTop: 1 }}>{actions}</div>
        </div>
      </SwipeableRow>
    );
  }

  // Desktop: title первой строкой, pill+#epic ВСЕГДА отдельной ниже.
  // Без inline-wrap'а — это давало "скачущие" высоты строк между задачами.
  const hasMeta = ep || pr;
  const dim = task.done ? { opacity: 0.55 } : null;
  return (
    <div className="row" style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      paddingTop: 3, marginBottom: 2,
    }} data-task-id={task.id}>
      <div style={{ paddingTop: 4, flexShrink: 0, ...dim }}>
        <Checkbox checked={task.done} onChange={() => onToggleDone(task.id)} />
      </div>
      <div onClick={() => onOpen(task)} style={{ flex: 1, minWidth: 0, cursor: "pointer", ...dim }}>
        <div style={task.done ? { textDecoration: "line-through", color: "var(--fg-3)" } : {}}>
          {task.text || <span style={{ color: "var(--fg-4)", fontStyle: "italic" }}>{t("newTask")}</span>}
        </div>
        {hasMeta && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 11, color: "var(--fg-3)" }}>
            {pr && <ProjectTag project={pr} />}
            {ep && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>#{ep.text}</span>}
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: "var(--fg-4)", fontStyle: "italic", marginRight: 2, paddingTop: 5, flexShrink: 0 }}>{rel(task.createdAt, lang)}</span>
      <div className="row-actions" style={{ paddingTop: 1, flexShrink: 0 }}>{actions}</div>
    </div>
  );
}

/* ── Archive View ── */
function ArchiveView({ data, u, allEpics, projects, openTask, openEpic, restoreTask, restoreSprint, restoreEpic, t, lang }) {
  const narrow = useNarrow();
  const toggle = id => u({ ui: { ...data.ui, archiveSprintExp: { ...data.ui.archiveSprintExp, [id]: !data.ui.archiveSprintExp[id] } } });
  const exp = data.ui.archiveSprintExp || {};
  const Sep = () => <span style={{ color: "var(--fg-4)", margin: "0 4px" }}>·</span>;
  const truncTitle = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

  return (
    <div style={{ marginTop: 14 }}>
      {data.archiveEpics.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={AH}>{t("epics")} <span style={AHCount}>{data.archiveEpics.length}</span></div>
          {data.archiveEpics.map((e, idx) => (
            <div key={e.id} style={AR}>
              <button onClick={() => restoreEpic(idx)} title={t("restore")} className="icon-btn" style={{ ...B, color: "var(--fg-2)" }}>↩</button>
  
              <span style={{ textDecoration: "line-through", cursor: "pointer", flex: 1, minWidth: 0, ...truncTitle }} onClick={() => openEpic(e)}>
                {e.text || t("untitled")}
              </span>
              {!narrow && <span style={{ fontSize: 10, color: "var(--fg-4)", fontStyle: "italic" }}>{fmt(e.archivedAt, lang)}</span>}
            </div>
          ))}
        </div>
      )}

      {data.archiveSprints.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={AH}>{t("sprints")} <span style={AHCount}>{data.archiveSprints.length}</span></div>
          {data.archiveSprints.map((sp, idx) => (
            <div key={sp.id} style={{ marginBottom: 6 }}>
              <div style={AR}>
                <button onClick={() => restoreSprint(idx)} title={t("restore")} className="icon-btn" style={{ ...B, color: "var(--fg-2)" }}>↩</button>
                <button onClick={() => toggle(sp.id)} className="icon-btn" style={{ ...B, color: "var(--fg-2)", fontSize: 12 }}>{exp[sp.id] ? "▾" : "▸"}</button>
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--fg-2)", minWidth: 0, ...truncTitle, flex: narrow ? 1 : "0 1 auto" }}>{sp.name}</span>
                {!narrow && sp.goal && <><Sep /><span style={{ fontSize: 11, color: "var(--fg-3)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sp.goal}</span></>}
                {!narrow && <span style={{ flex: 1 }} />}
                <span style={{ fontSize: 10, color: "var(--fg-3)", flexShrink: 0 }}>{sp.tasks.length}</span>
                {!narrow && <><Sep /><span style={{ fontSize: 10, color: "var(--fg-4)", fontStyle: "italic" }}>{fmt(sp.archivedAt, lang)}</span></>}
              </div>
              {exp[sp.id] && sp.tasks.map(tk => {
                const ep = allEpics.find(e => e.id === tk.epicId);
                const pr = projects.find(p => p.id === tk.projectId);
                return (
                  <div key={tk.id} onClick={() => openTask(tk, { arcSprint: idx })}
                    style={{ marginLeft: 40, display: "flex", alignItems: "baseline", gap: 8, color: "var(--fg-3)", fontSize: 13, lineHeight: "24px", cursor: "pointer" }}>
                    <span style={{ color: tk.done ? "var(--accent)" : "var(--fg-4)" }}>{tk.done ? "✓" : "○"}</span>
                    <span style={tk.done ? { textDecoration: "line-through" } : {}}>{tk.text || t("untitled")}</span>
                    {ep && <span style={{ fontSize: 10, color: "var(--fg-3)" }}>#{ep.text}</span>}
                    {pr && <ProjectTag project={pr} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {data.archiveTasks.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={AH}>{t("tasks")} <span style={AHCount}>{data.archiveTasks.length}</span></div>
          {data.archiveTasks.map((tk, idx) => {
            const ep = allEpics.find(e => e.id === tk.epicId);
            const pr = projects.find(p => p.id === tk.projectId);
            if (narrow) {
              return (
                <div key={tk.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                  <button onClick={() => restoreTask(idx)} title={t("restore")} className="icon-btn" style={{ ...B, color: "var(--fg-2)" }}>↩</button>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                    <div style={{ textDecoration: "line-through", color: "var(--fg-3)", fontSize: 13, ...truncTitle, cursor: "pointer" }}
                         onClick={() => openTask(tk, "archiveTask")}>{tk.text || t("untitled")}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, fontSize: 10, color: "var(--fg-4)", minWidth: 0 }}>
                      {pr && <ProjectTag project={pr} maxWidth={90} />}
                      {ep && <span style={{ ...truncTitle, flex: 1, minWidth: 0 }}>#{ep.text}</span>}
                      {!ep && <span style={{ flex: 1 }} />}
                      <span style={{ fontStyle: "italic", flexShrink: 0 }}>{fmt(tk.archivedAt, lang)}</span>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={tk.id} style={AR}>
                <button onClick={() => restoreTask(idx)} title={t("restore")} className="icon-btn" style={{ ...B, color: "var(--fg-2)" }}>↩</button>
    
                <span style={{ textDecoration: "line-through", cursor: "pointer", flex: 1 }} onClick={() => openTask(tk, "archiveTask")}>
                  {tk.text || t("untitled")}
                </span>
                {ep && <span style={{ fontSize: 10, color: "var(--fg-3)" }}>#{ep.text}</span>}
                {pr && <ProjectTag project={pr} />}
                <Sep />
                <span style={{ fontSize: 10, color: "var(--fg-4)", fontStyle: "italic" }}>{fmt(tk.archivedAt, lang)}</span>
              </div>
            );
          })}
        </div>
      )}

      {data.archiveEpics.length + data.archiveSprints.length + data.archiveTasks.length === 0 && (
        <div style={{ color: "var(--fg-4)", fontSize: 13, marginLeft: 8, fontStyle: "italic" }}>{t("empty")}</div>
      )}
    </div>
  );
}

/* ── Main ── */
export default function App() {
  const { data, loading, save, undo, canUndo } = useStore();
  const [modal, setModalRaw] = useState(null);
  const [toast, setToast] = useState(null);
  const [showNewSprint, setShowNewSprint] = useState(false);
  const narrow = useNarrow();

  /* History-API wrapper: открытие модалки кладёт state в history stack,
     чтобы system back button (Android) и back-swipe (iOS Safari 17+)
     закрывали sheet вместо выхода из приложения.

     Side effects (push/back) держим ВНЕ updater'а — React.StrictMode
     двойной вызов updater'а выстрелил бы history.back() дважды и
     выбросил юзера со страницы. Ref синхронно трекает prev-состояние. */
  const modalRef = useRef(null);
  const setModal = useCallback((m) => {
    const prev = modalRef.current;
    modalRef.current = m;
    if (m && !prev) {
      try { history.pushState({ sdvgModal: true }, ""); } catch {}
    } else if (!m && prev && history.state?.sdvgModal) {
      try { history.back(); } catch {}
    }
    setModalRaw(m);
  }, []);
  useEffect(() => {
    const onPop = () => {
      modalRef.current = null;
      setModalRaw(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const lang = data?.ui?.lang || "en";
  const t = useMemo(() => tFn(lang), [lang]);
  const allTasks = useAllTasks(data, t);
  const allEpics = useAllEpics(data);

  const epicsRaw = data?.epics;
  const sortDir = data?.sort;
  const activeP = data?.activeProject;
  const visibleEpics = useMemo(
    () => sortArr((epicsRaw || []).filter(x => matchesProject(x, activeP)), sortDir || "desc"),
    [epicsRaw, activeP, sortDir]
  );

  const theme = data?.ui?.theme;
  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  /* Dynamic theme-color — iOS status bar и Android system UI тянут цвет из
     <meta name="theme-color">. Статические 2 meta (light/dark prefers-color)
     не реагируют на наш JS-toggle темы. Обновляем активный meta при смене
     темы → status bar мгновенно матчится. Точные hex'ы из index.html:
     #fbfaf6 light, #141418 dark. */
  useEffect(() => {
    if (!theme) return;
    const color = theme === "dark" ? "#141418" : "#fbfaf6";
    // Убираем media-scoped meta'ы (они перебивают JS-updated), ставим один plain.
    document.querySelectorAll('meta[name="theme-color"][media]').forEach(m => m.remove());
    let meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", color);
  }, [theme]);

  // Toast auto-dismiss после 2 секунд
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(id);
  }, [toast]);

  // Undo handler — выставляет toast с labelом действия
  const doUndo = useCallback(async () => {
    const prev = await undo();
    if (prev) {
      haptic(20);
      setToast({ type: "undo", text: lang === "ru" ? "Отменено" : "Undone" });
    }
  }, [undo, lang]);

  // Cmd/Ctrl+Z глобально, НО не перехватываем когда фокус в input/textarea —
  // там должен работать native-undo браузера для текста в поле.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const el = document.activeElement;
        const tag = el?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
        e.preventDefault();
        doUndo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo]);

  // Scroll-to-new: после добавления сущности фокусируемся на ней.
  // Ждём rAF чтобы DOM успел отрендериться, потом scrollIntoView.
  const [scrollTarget, setScrollTarget] = useState(null);
  useEffect(() => {
    if (!scrollTarget) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-${scrollTarget.kind}-id="${scrollTarget.id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(id);
  }, [scrollTarget]);

  // Offline indicator: toast при потере сети. Приложение работает оффлайн
  // (localStorage), но feedback нужен — native-app не молчит. Не показываем
  // при старте если already offline (только на transition), чтобы не спамить.
  const online = useOnline();
  const wasOnline = useRef(online);
  useEffect(() => {
    if (wasOnline.current !== online) {
      setToast({
        type: online ? "online" : "offline",
        text: online
          ? (lang === "ru" ? "Снова онлайн" : "Back online")
          : (lang === "ru" ? "Офлайн — данные сохраняются локально" : "Offline — saved locally"),
      });
      wasOnline.current = online;
    }
  }, [online, lang]);

  // URL shortcuts: обрабатываем ?shortcut=new-task / ?shortcut=archive от
  // manifest shortcuts (long-press иконки PWA). После handling'а чистим URL
  // через replaceState чтобы не сохранялось в history. Действие отложено до
  // момента когда data уже загружена (первый sprint существует).
  const shortcutHandledRef = useRef(false);
  useEffect(() => {
    if (shortcutHandledRef.current || !data) return;
    const params = new URLSearchParams(window.location.search);
    const shortcut = params.get("shortcut");
    if (!shortcut) return;
    shortcutHandledRef.current = true;
    try {
      window.history.replaceState({}, "", window.location.pathname);
    } catch {}
    if (shortcut === "new-task" && data.sprints?.length > 0) {
      const inherited = data.activeProject && data.activeProject !== "none" ? data.activeProject : null;
      const nt = mkTask("", inherited);
      const s = [...data.sprints]; s[0] = { ...s[0], tasks: [nt, ...s[0].tasks] };
      save({ ...data, sprints: s }, { skipUndo: true });
      setModal({ type: "task", task: nt, source: { sprint: 0 } });
    } else if (shortcut === "archive") {
      save({ ...data, ui: { ...data.ui, archiveOpen: true } }, { skipUndo: true });
    }
  }, [data, save, setModal]);

  if (loading) return <div style={{ padding: 40, fontFamily: "monospace", color: "var(--fg-2)" }}>...</div>;
  if (!data) return null;
  const u = (p) => save({ ...data, ...p });
  // Preference-changes (theme, lang, sort, archive expand) не засоряют undo-стек.
  const uPref = (p) => save({ ...data, ...p }, { skipUndo: true });
  const active = data.activeProject;

  const visibleSprints = sortArr(data.sprints, data.sort);

  const updateTaskInPlace = (updated, source) => {
    if (source === "archiveTask") {
      u({ archiveTasks: data.archiveTasks.map(x => x.id === updated.id ? updated : x) }); return;
    }
    if (typeof source === "object" && source.arcSprint !== undefined) {
      const a = [...data.archiveSprints];
      a[source.arcSprint] = { ...a[source.arcSprint], tasks: a[source.arcSprint].tasks.map(x => x.id === updated.id ? updated : x) };
      u({ archiveSprints: a }); return;
    }
    if (typeof source === "object" && source.sprint !== undefined) {
      const s = [...data.sprints];
      s[source.sprint] = { ...s[source.sprint], tasks: s[source.sprint].tasks.map(x => x.id === updated.id ? updated : x) };
      u({ sprints: s });
    }
  };

  const openTask = (task, source) => setModal({ type: "task", task, source });
  const openEpic = (epic, readOnly = false) => setModal({ type: "epic", epic, readOnly });
  const openSprint = (si) => setModal({ type: "sprint", sprintIndex: si });

  const toggleDone = (si, id) => {
    const s = [...data.sprints];
    s[si] = { ...s[si], tasks: s[si].tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) };
    haptic(10);
    u({ sprints: s });
  };

  const softArchiveTask = (si, id) => {
    const t = data.sprints[si].tasks.find(x => x.id === id); if (!t) return;
    const s = [...data.sprints];
    s[si] = { ...s[si], tasks: s[si].tasks.filter(x => x.id !== id) };
    haptic([10, 30, 10]);
    u({ sprints: s, archiveTasks: [{ ...t, archivedAt: now() }, ...data.archiveTasks] });
  };
  const softArchiveSprint = (si) => {
    const sp = data.sprints[si];
    haptic([10, 30, 10]);
    u({ sprints: data.sprints.filter((_, i) => i !== si), archiveSprints: [{ ...sp, archivedAt: now() }, ...data.archiveSprints] });
  };
  const softArchiveEpic = (id) => {
    const e = data.epics.find(x => x.id === id); if (!e) return;
    haptic([10, 30, 10]);
    u({ epics: data.epics.filter(x => x.id !== id), archiveEpics: [{ ...e, archivedAt: now() }, ...data.archiveEpics] });
  };

  const restoreTask = idx => {
    const { archivedAt, ...task } = data.archiveTasks[idx];
    if (data.sprints.length === 0) {
      const sp = { ...mkSprint(t("backlog")), tasks: [task] };
      u({ archiveTasks: data.archiveTasks.filter((_, i) => i !== idx), sprints: [sp] });
    } else {
      // Prepend в первый спринт (верхний в списке)
      const s = [...data.sprints]; s[0] = { ...s[0], tasks: [task, ...s[0].tasks] };
      u({ archiveTasks: data.archiveTasks.filter((_, i) => i !== idx), sprints: s });
    }
  };
  const restoreSprint = idx => {
    const { archivedAt, ...sprint } = data.archiveSprints[idx];
    u({ archiveSprints: data.archiveSprints.filter((_, i) => i !== idx), sprints: [sprint, ...data.sprints] });
  };
  const restoreEpic = idx => {
    const { archivedAt, ...epic } = data.archiveEpics[idx];
    u({ archiveEpics: data.archiveEpics.filter((_, i) => i !== idx), epics: [epic, ...data.epics] });
  };

  const moveTask = (taskId, fromIdx, toSprintId) => {
    const s = [...data.sprints];
    const task = s[fromIdx].tasks.find(x => x.id === taskId); if (!task) return;
    s[fromIdx] = { ...s[fromIdx], tasks: s[fromIdx].tasks.filter(x => x.id !== taskId) };
    const ti = s.findIndex(x => x.id === toSprintId); if (ti < 0) return;
    // Prepend — задача появляется вверху целевого спринта
    s[ti] = { ...s[ti], tasks: [task, ...s[ti].tasks] };
    u({ sprints: s });
  };

  const findTaskSource = (t) => {
    for (let i = 0; i < data.sprints.length; i++) if (data.sprints[i].tasks.find(x => x.id === t.id)) return { sprint: i };
    if (data.archiveTasks.find(x => x.id === t.id)) return "archiveTask";
    for (let i = 0; i < data.archiveSprints.length; i++) if (data.archiveSprints[i].tasks.find(x => x.id === t.id)) return { arcSprint: i };
    return null;
  };

  const totalArc = data.archiveEpics.length + data.archiveSprints.length + data.archiveTasks.length;

  // Project CRUD. Prepend при создании, цвет больше не используется (PRD v2 neutralize).
  const addProject = () => {
    const name = t("projectN", data.pc);
    u({ projects: [mkProject(name), ...data.projects], pc: data.pc + 1 });
  };
  const renameProject = (id, name) => u({ projects: data.projects.map(p => p.id === id ? { ...p, name } : p) });
  const deleteProject = (id) => u({
    projects: data.projects.filter(p => p.id !== id),
    epics: data.epics.map(e => e.projectId === id ? { ...e, projectId: null } : e),
    archiveEpics: data.archiveEpics.map(e => e.projectId === id ? { ...e, projectId: null } : e),
    sprints: data.sprints.map(s => ({ ...s, tasks: s.tasks.map(t => t.projectId === id ? { ...t, projectId: null } : t) })),
    archiveSprints: data.archiveSprints.map(s => ({ ...s, tasks: s.tasks.map(t => t.projectId === id ? { ...t, projectId: null } : t) })),
    archiveTasks: data.archiveTasks.map(t => t.projectId === id ? { ...t, projectId: null } : t),
    activeProject: data.activeProject === id ? null : data.activeProject,
  });

  const inheritedProject = active && active !== "none" ? active : null;
  const createSprint = (name, goal) => {
    const ns = { ...mkSprint(name, goal) };
    u({ sprints: [ns, ...data.sprints], sc: (data.sc || 1) + 1 });
    setShowNewSprint(false);
    setScrollTarget({ kind: "sprint", id: ns.id });
  };
  const createSprintForAll = (name, goal) => {
    const batch = data.projects.map(p => ({ ...mkSprint(`${name} — ${p.name}`, goal) }));
    u({ sprints: [...batch, ...data.sprints], sc: (data.sc || 1) + 1 });
    setShowNewSprint(false);
    setScrollTarget({ kind: "sprint", id: batch[0].id });
  };

  return (
    <div style={R}>
      {/* Modals */}
      {modal?.type === "task" && (() => {
        const readOnly = modal.source === "archiveTask" || typeof modal.source?.arcSprint === "number";
        const currentSprintIdx = typeof modal.source?.sprint === "number" ? modal.source.sprint : null;
        const sprintOpts = currentSprintIdx != null
          ? data.sprints.filter((_, i) => i !== currentSprintIdx)
          : [];
        // onDelete нужен только когда задача живёт в активном спринте —
        // покрывает сценарий "+ task → cancel" без оставления пустого призрака.
        const onDelete = currentSprintIdx != null
          ? () => softArchiveTask(currentSprintIdx, modal.task.id)
          : null;
        return (
          <TaskModal
            task={modal.task} allEpics={allEpics} projects={data.projects} sprints={sprintOpts}
            readOnly={readOnly} t={t} lang={lang}
            onUpdate={tk => updateTaskInPlace(tk, modal.source)}
            onDelete={onDelete}
            onMove={currentSprintIdx != null ? (targetSprintId) => moveTask(modal.task.id, currentSprintIdx, targetSprintId) : null}
            onClose={() => setModal(null)}
          />
        );
      })()}
      {modal?.type === "epic" && (
        <EpicModal
          epic={modal.epic} allTasks={allTasks} projects={data.projects} readOnly={modal.readOnly} t={t}
          onUpdate={ep => u({ epics: data.epics.map(x => x.id === ep.id ? ep : x) })}
          onDelete={modal.readOnly ? null : () => u({ epics: data.epics.filter(x => x.id !== modal.epic.id) })}
          onClose={() => setModal(null)}
          onOpenTask={tk => { const src = findTaskSource(tk); if (src) setModal({ type: "task", task: tk, source: src }); }}
        />
      )}
      {modal?.type === "sprint" && (
        <SprintModal
          sprint={data.sprints[modal.sprintIndex]} t={t}
          onUpdate={sp => { const s = [...data.sprints]; s[modal.sprintIndex] = sp; u({ sprints: s }); }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "projects" && (
        <ProjectsModal
          projects={data.projects} t={t}
          onAdd={addProject} onRename={renameProject} onDelete={deleteProject}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "reset" && (
        <ResetModal t={t} onConfirm={() => { save({ ...empty, wasReset: true }); setModal(null); }} onClose={() => setModal(null)} />
      )}

      {/* Wordmark "sdvg.io" — eyebrow в дальнем верхнем-левом, только desktop. */}
      {!narrow && <Wordmark />}

      {/* Floating utility cluster — fixed top-right.
         Undo (влево), потом lang + theme (preferences).
         Лёгкий haptic(5) на каждом toggle — subtle acknowledgement, native feel. */}
      <UtilityCluster lang={lang} theme={theme} t={t} canUndo={canUndo} onUndo={doUndo}
        sort={data.sort}
        onToggleSort={() => { haptic(5); withTransition(() => uPref({ sort: data.sort === "desc" ? "asc" : "desc" })); }}
        onToggleLang={() => { haptic(5); uPref({ ui: { ...data.ui, lang: lang === "ru" ? "en" : "ru" } }); }}
        onToggleTheme={() => {
          haptic(5);
          const eff = theme || "light";
          uPref({ ui: { ...data.ui, theme: eff === "dark" ? "light" : "dark" } });
        }}
      />

      <Toast toast={toast} />

      {/* Filter bar (only if projects exist) */}
      {data.projects.length > 0 && (
        <FilterBar projects={data.projects} active={active} t={t}
          onSelect={id => withTransition(() => u({ activeProject: id }))}
          onOpenProjects={() => setModal({ type: "projects" })} />
      )}

      {/* Epics */}
      <div style={SEC}>
        <div className="section-header">
          <span style={H}>{t("epics")}</span>
          <button onClick={() => {
            const ne = mkEpic(inheritedProject);
            u({ epics: [ne, ...data.epics] });
            openEpic(ne);
          }} className="icon-btn" style={{ ...B, color: "var(--fg-2)", fontSize: 14, marginLeft: 6 }}>+</button>
        </div>
        {visibleEpics.map(e => {
          const cnt = allTasks.filter(tk => tk.epicId === e.id).length;
          const pr = data.projects.find(p => p.id === e.projectId);
          return (
            <div key={e.id} className="row" data-epic-id={e.id} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 30 }}>
  
              <div onClick={() => openEpic(e)} style={{ flex: 1, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0, cursor: "pointer" }}>
                <span style={{ color: "var(--fg)" }}>
                  {e.text || <span style={{ color: "var(--fg-4)", fontStyle: "italic" }}>{t("newEpic")}</span>}
                </span>
                {cnt > 0 && <span style={{ fontSize: 11, color: "var(--fg-3)" }}>{cnt}</span>}
                {pr && <ProjectTag project={pr} />}
              </div>
              {narrow ? (
                <OverflowMenu items={[
                  { label: t("open"), onClick: () => openEpic(e) },
                  { label: t("archiveAction"), onClick: () => softArchiveEpic(e.id), danger: true },
                ]} />
              ) : (
                <div className="row-actions" style={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <button onClick={() => openEpic(e)} title={t("open")} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 12 }}>≡</button>
                  <button onClick={() => softArchiveEpic(e.id)} title={t("archiveAction")} className="icon-btn" style={{ ...B, color: "var(--fg-3)" }}>×</button>
                </div>
              )}
            </div>
          );
        })}
        {visibleEpics.length === 0 && data.epics.length > 0 && (
          <div style={{ color: "var(--fg-4)", fontSize: 12, fontStyle: "italic", marginLeft: 16 }}>{t("noEpicsInProject")}</div>
        )}
      </div>

      {/* Sprints section — wrapped in SEC чтобы sticky header имел bounds:
          когда user скроллит past Спринты, sticky уходит естественно. Без
          wrapper'а sticky dragged бы до конца контейнера. */}
      <div style={SEC}>
        <div className="section-header">
          <span style={H}>{t("sprints")}</span>
          <button onClick={() => setShowNewSprint(v => !v)} className="icon-btn" style={{ ...B, color: "var(--fg-2)", fontSize: 14, marginLeft: 6 }}>+</button>
        </div>

      {/* Inline sprint creation form */}
      {showNewSprint && (
        <NewSprintForm
          projects={data.projects} t={t}
          defaultName=""
          onCreate={createSprint}
          onCreateForAll={createSprintForAll}
          onCancel={() => setShowNewSprint(false)}
        />
      )}

      {/* Sprint cards */}
      {visibleSprints.map(sp => {
        const si = data.sprints.indexOf(sp);
        const tasks = sp.tasks.filter(tk => matchesProject(tk, active));
        const doneCount = tasks.filter(tk => tk.done).length;
        const total = tasks.length;
        return (
          <div key={sp.id} className="row" data-sprint-id={sp.id} style={SPRINT_CARD}>
            {/* Header: name truncates при необходимости, progress + actions всегда
                на одной строке справа. Раньше flexWrap:wrap вёл к тому, что
                длинное имя ("Следующая неделя") съедало место, OverflowMenu
                перепрыгивал на line 2 — header становился 84px вместо 40.
                Решение: имя берёт flex:1 min-width:0 с overflow:hidden ellipsis.
                На узком экране длинное имя усекается, а не двигает buttons. */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8, overflow: "hidden" }}>
                <Inline value={sp.name} onSave={txt => { const s = [...data.sprints]; s[si] = { ...s[si], name: txt }; u({ sprints: s }); }}
                  placeholder={t("sprint")} style={{ fontSize: 15, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: "0 1 auto" }} />
                <Progress done={doneCount} total={total} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: narrow ? 4 : 2, flexShrink: 0 }}>
                <button onClick={() => {
                  // Prepend + auto-open modal (P2.3 flow):
                  // создаём draft-задачу вверху спринта и сразу открываем карточку
                  // с фокусом на title — пользователь пишет имя, опц. заполняет desc/epic.
                  const nt = mkTask("", inheritedProject);
                  const s = [...data.sprints]; s[si] = { ...s[si], tasks: [nt, ...s[si].tasks] };
                  u({ sprints: s });
                  openTask(nt, { sprint: si });
                }}
                  title={t("addTask")} className="act-btn" style={{ ...B, color: "var(--fg-2)", fontSize: 12 }}>{t("addTask")}</button>
                {narrow ? (
                  <OverflowMenu items={[
                    { label: t("settings"), onClick: () => openSprint(si) },
                    { label: t("archiveSprintAction"), onClick: () => softArchiveSprint(si), danger: true },
                  ]} />
                ) : (
                  <div className="row-actions" style={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <button onClick={() => openSprint(si)} title={t("settings")} className="icon-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 12 }}>≡</button>
                    <button onClick={() => softArchiveSprint(si)} title={t("archiveSprintAction")} className="icon-btn" style={{ ...B, color: "var(--fg-3)" }}>×</button>
                  </div>
                )}
              </div>
            </div>
            {sp.goal && <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 4, fontStyle: "italic" }}>{sp.goal}</div>}
            <div style={{ marginTop: 8 }}>
              {tasks.map(tk => (
                <TaskRow key={tk.id} task={tk} allEpics={allEpics} projects={data.projects} narrow={narrow} t={t} lang={lang}
                  onUpdate={task => { const s = [...data.sprints]; s[si] = { ...s[si], tasks: s[si].tasks.map(x => x.id === task.id ? task : x) }; u({ sprints: s }); }}
                  onSoftDelete={id => softArchiveTask(si, id)}
                  onToggleDone={id => toggleDone(si, id)}
                  moveTargets={data.sprints.filter((_, i) => i !== si).map(s => ({ key: s.id, label: s.name }))}
                  onMove={(id, toSprintId) => moveTask(id, si, toSprintId)}
                  onOpen={task => openTask(task, { sprint: si })}
                />
              ))}
              {tasks.length === 0 && sp.tasks.length > 0 && (
                <div style={{ color: "var(--fg-4)", fontSize: 12, fontStyle: "italic", marginLeft: 22 }}>{t("noTasksInProject")}</div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Legacy "+ add sprint" footer link — убрано, создание через + в header'е. */}
      <div style={{ marginBottom: 32 }} />

      {/* Archive */}
      <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <button onClick={() => withTransition(() => uPref({ ui: { ...data.ui, archiveOpen: !data.ui.archiveOpen } }))}
          style={{ ...B, fontWeight: 700, fontSize: 15, color: "var(--fg)" }}>
          {t("archive")} {data.ui.archiveOpen ? "▾" : "▸"}
          <span style={{ fontWeight: 400, fontSize: 12, color: "var(--fg-3)", marginLeft: 8 }}>{totalArc}</span>
        </button>
        {data.ui.archiveOpen && (
          <ArchiveView
            data={data} u={u} allEpics={allEpics} projects={data.projects} t={t} lang={lang}
            openTask={openTask} openEpic={e => openEpic(e, true)}
            restoreTask={restoreTask} restoreSprint={restoreSprint} restoreEpic={restoreEpic}
          />
        )}
      </div>

      {/* Footer: only reset (destructive — buried).
         projects-button shown only when no projects exist (FilterBar's ⚙ handles it otherwise).
         Theme + lang moved to floating cluster top-right. */}
      <div style={{ marginTop: 56, display: "flex", gap: 18, alignItems: "center" }}>
        {data.projects.length === 0 && (
          <button onClick={() => setModal({ type: "projects" })} style={{ ...B, color: "var(--fg-3)", fontSize: 12, padding: "6px 0" }}>{t("projects").toLowerCase()}</button>
        )}
        <button onClick={() => setModal({ type: "reset" })} className="del-btn" style={{ ...B, color: "var(--fg-3)", fontSize: 12, padding: "6px 0" }}>{t("reset")}</button>
      </div>
    </div>
  );
}

/* ── Wordmark — едва различимый "sdvg.io" в верхнем-левом углу.
   Только desktop. Никогда не кликабельный, чтобы не отвлекал. */
function Wordmark() {
  return (
    <div style={{
      position: "fixed",
      top: "calc(14px + env(safe-area-inset-top))",
      left: "calc(16px + env(safe-area-inset-left))",
      fontFamily: "'SF Mono','Menlo','Consolas',ui-monospace,monospace",
      fontSize: 11, fontWeight: 500,
      color: "var(--fg-4)", opacity: 0.55,
      letterSpacing: 0.4,
      pointerEvents: "none", userSelect: "none",
      zIndex: 50,
    }}>sdvg.io</div>
  );
}

/* ── Floating utility cluster (top-right, position: fixed).
   Shows CURRENT state for both lang + theme. Click toggles to the other.
   Tiny visual footprint, scroll-independent, honors safe-area-inset. */
function UtilityCluster({ lang, theme, t, canUndo, onUndo, sort, onToggleSort, onToggleLang, onToggleTheme }) {
  const eff = theme || "light";
  const langLabel = lang === "ru" ? "RU" : "EN";
  const themeGlyph = eff === "dark" ? "☾" : "☀";
  const nextTheme = eff === "dark" ? t("light") : t("dark");
  const nextLang = lang === "ru" ? t("english") : t("russian");
  const sortLabel = sort === "desc" ? `↓ ${t("newest")}` : `↑ ${t("oldest")}`;
  return (
    <div className="util-cluster" style={{
      position: "fixed",
      top: "calc(8px + env(safe-area-inset-top))",
      right: "calc(8px + env(safe-area-inset-right))",
      display: "flex", alignItems: "center", gap: 0,
      zIndex: 50,
    }}>
      <button onClick={onUndo} disabled={!canUndo}
        title={(lang === "ru" ? "Отменить" : "Undo") + " (⌘Z)"}
        className="util-btn"
        style={{
          fontSize: 14, lineHeight: 1,
          // Enabled 0.8 — заметнее остальных utility-кнопок (0.65),
          // чтобы сигнализировать "это actionable прямо сейчас". Disabled 0.2.
          opacity: canUndo ? 0.8 : 0.2,
          cursor: canUndo ? "pointer" : "default",
        }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H12"/>
        </svg>
      </button>
      <button onClick={onToggleSort}
        title={(lang === "ru" ? "Сортировка" : "Sort") + ": " + sortLabel}
        className="util-btn"
        style={{ fontSize: 11, lineHeight: 1, whiteSpace: "nowrap", padding: "6px 10px" }}>
        {sortLabel}
      </button>
      <div style={{ width: 6 }} />
      <button onClick={onToggleLang} title={t("switchTo", nextLang)}
        className="util-btn" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>{langLabel}</button>
      <button onClick={onToggleTheme} title={t("switchTo", nextTheme)}
        className="util-btn" style={{ fontSize: 16, lineHeight: 1 }}>{themeGlyph}</button>
    </div>
  );
}

/* ── Toast: короткое сообщение внизу экрана, исчезает через 2с.
   Используется для feedback'а undo и других тихих действий.
   kbInset поднимает toast над soft keyboard — на мобиле undo triggered во
   время редактирования не прячется под клавиатурой. */
function Toast({ toast }) {
  const kbInset = useKeyboardInset();
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: `calc(16px + env(safe-area-inset-bottom) + ${kbInset}px)`,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--fg)",
        color: "var(--bg)",
        fontSize: 12,
        fontFamily: "'SF Mono','Menlo','Consolas',ui-monospace,monospace",
        padding: "10px 18px",
        borderRadius: 8,
        boxShadow: "var(--modal-shadow)",
        zIndex: 200,
        opacity: 0.92,
        letterSpacing: 0.2,
        animation: "slide-up 240ms var(--ease-spring-soft)",
        pointerEvents: "none",
        transition: "bottom 200ms var(--ease-spring-soft)",
      }}
      role="status"
      aria-live="polite"
    >
      {toast.text}
    </div>
  );
}

/* ── Styles ── */
const R = {
  maxWidth: 560, margin: "0 auto",
  padding: "var(--pad)",
  fontFamily: "'SF Mono','Menlo','Consolas',ui-monospace,monospace",
  fontSize: 14, color: "var(--fg)", lineHeight: 1.6,
};
const SEC = { marginBottom: 28 };
const H = { fontSize: 15, fontWeight: 700, color: "var(--fg)" };
const HRow = { display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 };
const B = { all: "unset", cursor: "pointer", fontFamily: "inherit", fontSize: 14 };
const ADD = { all: "unset", cursor: "pointer", fontFamily: "inherit", color: "var(--fg-3)", fontSize: 13, display: "block" };
const SPRINT_CARD = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 6,
  padding: "var(--sprint-pad)",
  marginBottom: 14,
};
const AR = { display: "flex", alignItems: "center", gap: 8, minHeight: 28, color: "var(--fg-2)", fontSize: 13 };
const AH = { fontSize: 13, fontWeight: 600, color: "var(--fg-2)", marginBottom: 6, display: "flex", alignItems: "baseline", gap: 6 };
const AHCount = { fontSize: 11, color: "var(--fg-4)", fontWeight: 400 };
const O = {
  bg: { position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 10 },
  box: { background: "var(--panel)", color: "var(--fg)", borderRadius: 8, padding: "var(--modal-pad)", width: "var(--modal-w)", maxWidth: 480, maxHeight: "90vh", overflow: "auto", boxShadow: "var(--modal-shadow)", fontFamily: "'SF Mono','Menlo','Consolas',ui-monospace,monospace", border: "1px solid var(--line)" },
  dd: { position: "absolute", right: 0, top: "calc(100% + 4px)", background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 5, padding: 3, zIndex: 30, minWidth: 140, boxShadow: "var(--menu-shadow)" },
  label: { display: "block", fontSize: 11, color: "var(--fg-2)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.4 },
  textarea: { all: "unset", display: "block", width: "100%", font: "inherit", fontSize: 13, color: "var(--fg)", border: "1px solid var(--line)", borderRadius: 4, padding: 10, whiteSpace: "pre-wrap", minHeight: 100, lineHeight: 1.55, boxSizing: "border-box", background: "var(--bg)" },
};
