import React, { useState, useMemo, useEffect } from 'react';
import {
  Award,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Grid,
  History,
  BookOpen,
  Zap,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  X,
  HelpCircle,
  MessageSquare,
  Send,
  Coins,
  Key,
  Sparkles,
  Trash2,
  Play,
  Filter
} from 'lucide-react';

// ============================================================================
// КОНСТАНТЫ КОЛОДЫ, ПОЗИЦИЙ, ОЧЕРЕДНОСТИ ХОДА И ТЕГОВ ЛОГИКИ
// ============================================================================

const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

// Строгий порядок позиций на префлопе (от первого слова UTG до последнего слова BB)
const POKER_POSITIONS_8MAX = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

// Строгий порядок слова на постфлопе (от малого блайнда до баттона)
const POSTFLOP_ORDER_8MAX = ['SB', 'BB', 'UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'];

const STORAGE_KEYS = {
  HISTORY: 'gto_poker_history_v4',
  CUSTOM_SCENARIOS: 'gto_poker_custom_scenarios_v4',
  API_KEY: 'poker_trainer_gemini_key',
  ACTIVE_STATE: 'gto_poker_active_state_v4',
  RECENT_ARCHETYPES: 'gto_poker_recent_arch_v4'
};

const TRAINING_FOCUS_OPTIONS = [
  { id: 'all', label: 'Все ситуации (Разнообразие)' },
  { id: 'connectors', label: 'Коннекторы и гапперы' },
  { id: 'bluff_oop', label: 'Блеф и слабая позиция' },
  { id: 'pairs_broadway', label: 'Карманные пары и бродвей' }
];

const TABLE_MODES = [
  {
    id: 'chipev_8max',
    shortName: '8-Max: ChipEV',
    name: '8-Max: Рабочая стадия (ChipEV)',
    description: 'Полные раздачи с префлопа до ривера, стеки 25–50 ББ'
  },
  {
    id: 'bubble_icm',
    shortName: '8-Max: Баббл (ICM)',
    name: '8-Max: Баббл турнира (ICM)',
    description: 'Прямой баббл призовой зоны, учет коротких стеков и цены вылета'
  },
  {
    id: 'headsup',
    shortName: 'Хэдз-ап (1v1)',
    name: 'Хэдз-ап (Дуэль 1 на 1)',
    description: 'Широкие диапазоны BTN против BB, агрессивная борьба на 4 улицах'
  }
];

// Координаты 8 мест вокруг овального стола (индекс 0 — всегда Hero внизу по центру)
const SEAT_SLOTS_8MAX = [
  { top: '87%', left: '50%' }, // 0: Hero (Внизу по центру)
  { top: '76%', left: '15%' }, // 1: Слева внизу
  { top: '47%', left: '6%' },  // 2: Слева по центру
  { top: '19%', left: '18%' }, // 3: Слева вверху
  { top: '11%', left: '50%' }, // 4: Вверху по центру
  { top: '19%', left: '82%' }, // 5: Справа вверху
  { top: '47%', left: '94%' }, // 6: Справа по центру
  { top: '76%', left: '85%' }  // 7: Справа внизу
];

// 10 ключевых тегов для обоснования хода + словарь
const LOGIC_TAGS = [
  {
    id: 'value_bet',
    label: 'Добор (Вэлью)',
    category: 'Цель хода',
    isTrap: false,
    desc: 'Открытие на префлопе, ставка или рейз с сильной рукой, чтобы получить оплату от рук слабее (вторых пар, топ-пар со слабым кикером, дро).'
  },
  {
    id: 'pot_control',
    label: 'Пот-контроль (ШДВ)',
    category: 'Цель хода',
    isTrap: false,
    desc: 'Чек или колл с рукой средней силы (Showdown Value), которая уже бьет блефы, но не хочет раздувать огромный банк против натсов.'
  },
  {
    id: 'protect_check_range',
    label: 'Блеф-кетч / Защита спектра',
    category: 'Спектр',
    isTrap: false,
    desc: 'Защита блайнда или чек-колл со средней рукой, чтобы не давать агрессивному сопернику безнаказанно забирать банки.'
  },
  {
    id: 'semibluff_equity',
    label: 'Полублеф (Ауты + ФЭ)',
    category: 'Цель хода',
    isTrap: false,
    desc: 'Агрессия с мощным дро или перспективной рукой: мы забираем банк сразу при пасе соперника или доезжаем в сильную комбинацию.'
  },
  {
    id: 'dry_board',
    label: 'Сухая доска / WA-WB',
    category: 'Текстура',
    isTrap: false,
    desc: 'На радужной несвязанной доске мало дро, от которых нужно защищаться крупным сайзингом. Ситуация «далеко впереди или далеко позади».'
  },
  {
    id: 'blockers_factor',
    label: 'Учет блокеров',
    category: 'Математика',
    isTrap: false,
    desc: 'Карты и масти в нашей руке блокируют либо сильные комбинации соперника (плюс к коллу/блефу), либо его промазавшие дро (анти-блокер — надо пасовать).'
  },
  {
    id: 'spr_icm_control',
    label: 'Геометрия SPR / ICM',
    category: 'Математика',
    isTrap: false,
    desc: 'Выбор сайзинга или чека с учетом отношения стека к банку (SPR) и турнирного давления баббла, чтобы не привязать себя к банку.'
  },
  {
    id: 'fold_behind',
    label: 'Дисциплинированный пас',
    category: 'Цель хода',
    isTrap: false,
    desc: 'Спокойный фолд, когда по линии и сайзингу соперника наша рука бьет только редкие блефы, а сохранение рабочего стека важнее.'
  },
  {
    id: 'trap_fold_worse',
    label: 'Выбить руки слабее',
    category: 'Ловушка логики',
    isTrap: true,
    desc: 'ОШИБКА ИНТУИЦИИ: Зачем выбивать рейзом или крупной ставкой руки слабее нашей, если мы уже их бьем и хотим, чтобы они продолжали блефовать?'
  },
  {
    id: 'trap_pot_committed',
    label: 'Уже вложил фишки в банк',
    category: 'Ловушка логики',
    isTrap: true,
    desc: 'ОШИБКА ИНТУИЦИИ: Колл на прошлых улицах не обязывает платить овербет или пуш на ривере. Прошлые вложения в банк уже не принадлежат тебе.'
  }
];

function fmtBB(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function normalizePokerPosition(rawPos, mode = 'chipev_8max', fallback = 'BTN') {
  if (!rawPos || typeof rawPos !== 'string') return fallback;
  const clean = rawPos.trim().toUpperCase();
  if (mode === 'headsup') {
    return ['BB', 'BIG BLIND', 'ББ'].includes(clean) ? 'BB' : 'BTN';
  }
  const aliasMap = {
    UTG: 'UTG',
    EP: 'UTG',
    'UTG+1': 'UTG+1',
    UTG1: 'UTG+1',
    LJ: 'LJ',
    MP: 'LJ',
    LOJACK: 'LJ',
    HJ: 'HJ',
    HIJACK: 'HJ',
    CO: 'CO',
    CUTOFF: 'CO',
    BTN: 'BTN',
    BU: 'BTN',
    BUTTON: 'BTN',
    SB: 'SB',
    BB: 'BB'
  };
  return aliasMap[clean] || (POKER_POSITIONS_8MAX.includes(clean) ? clean : fallback);
}

// Жесткий нормализатор карт: переводит 'Ah', '10s', 'Ts', 'Kd', '7c' -> 'A♥', '10♠', 'K♦', '7♣'
function normalizeCardString(rawCard) {
  if (!rawCard || typeof rawCard !== 'string') return 'A♠';
  const str = rawCard.trim();
  const suitChar = str.slice(-1);
  let rankPart = str.slice(0, -1).trim().toUpperCase();

  const suitMap = {
    s: '♠',
    S: '♠',
    '♠': '♠',
    h: '♥',
    H: '♥',
    '♥': '♥',
    d: '♦',
    D: '♦',
    '♦': '♦',
    c: '♣',
    C: '♣',
    '♣': '♣'
  };

  const normalizedSuit = suitMap[suitChar] || '♠';
  if (rankPart === 'T' || rankPart === '10') rankPart = '10';
  if (!RANKS.includes(rankPart)) rankPart = 'A';

  return `${rankPart}${normalizedSuit}`;
}

function sanitizeTextCardNotations(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\b10([shdc])\b/gi, (_, s) => normalizeCardString(`10${s}`))
    .replace(/\b([AKQJT98765432])([shdc])\b/g, (_, r, s) => normalizeCardString(`${r}${s}`));
}

// Проверяет, кто ходит первым на постфлопе (true, если Hero ходит раньше Оппонента)
function isHeroFirstPostflop(heroPos, villainPos, mode) {
  if (mode === 'headsup') {
    return heroPos === 'BB';
  }
  const hIdx = POSTFLOP_ORDER_8MAX.indexOf(heroPos);
  const vIdx = POSTFLOP_ORDER_8MAX.indexOf(villainPos);
  return hIdx !== -1 && vIdx !== -1 && hIdx < vIdx;
}

// ============================================================================
// МГНОВЕННЫЙ ПРОЦЕДУРНЫЙ ГЕНЕРАТОР 4-УЛИЧНЫХ РАЗДАЧ (18 РАЗНЫХ АРХЕТИПОВ)
// ============================================================================

const PROCEDURAL_BLUEPRINTS = [
  // 1. Одномастные коннекторы на баттоне (7♠6♠ / 8♠7♠ / 6♠5♠) — кража, флоат и блеф/доезд
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const connPool = [
      { hi: '7', lo: '6', flopHi: 'K', flopMid: '8', flopLo: '5', turnCard: '4', rivCard: '2' },
      { hi: '8', lo: '7', flopHi: 'Q', flopMid: '9', flopLo: '6', turnCard: '5', rivCard: '2' },
      { hi: '6', lo: '5', flopHi: 'J', flopMid: '7', flopLo: '4', turnCard: '3', rivCard: '9' },
      { hi: '9', lo: '8', flopHi: 'K', flopMid: '10', flopLo: '7', turnCard: '6', rivCard: '2' }
    ];
    const c = connPool[variant % connPool.length];
    const heroPos = 'BTN';
    const villainPos = 'BB';
    return {
      focusCategory: 'connectors',
      mode,
      title: `Коннекторы на BTN: ${c.hi}${s1}${c.lo}${s1} против BB (4 улицы давления и дро)`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${c.hi}${s1}`, `${c.lo}${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 2.5,
          effectiveStack: stack,
          isPreflopRFI: true,
          villainLastActionBadge: 'ББ 1 ББ • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Все игроки до баттона сбросили. Первое слово за Hero на BTN (позади SB и BB).'
            }
          ],
          villainActionText: `До тебя все сбросили. У тебя одномастный коннектор ${c.hi}${s1} ${c.lo}${s1} на баттоне.`,
          toCall: 1.0,
          minBet: 2.0,
          minRaise: 2.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['bet', 'raise'],
            minOptimalSize: 2.0,
            maxOptimalSize: 2.5,
            optimalTags: ['semibluff_equity', 'value_bet'],
            trapTags: ['fold_behind'],
            explanation: `Одномастные коннекторы ${c.hi}${s1} ${c.lo}${s1} на баттоне всегда открываются рейзом 2.1–2.2 ББ. Входить лимпом (коллом 1 ББ) невыгодно: ты отказываешься от кражи 2.5 ББ на префлопе и даешь BB бесплатный флоп.`,
            sizingNote: 'Опен-рейз 2.2 ББ с баттона.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '88', 'AKs', 'AQs'],
            medium: ['77', '66', '55', '44', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J10s', '109s', '98s', '87s', '76s', '65s', '54s'],
            bluffs: ['K9o', 'Q9o', 'J9o']
          }
        },
        {
          name: 'Флоп',
          board: [`${c.flopHi}${s2}`, `${c.flopMid}${s3}`, `${c.flopLo}${s1}`],
          potBeforeAction: 5.9,
          effectiveStack: Number((stack - 2.2).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Hero (BTN) рейз 2.2 ББ → SB пас → BB колл (Банк: 5.9 ББ)'
            },
            {
              street: `Флоп [${c.flopHi}${s2} ${c.flopMid}${s3} ${c.flopLo}${s1}]`,
              text: 'BB чекает. У Hero двустороннее стрит-дро (8 аутов) + бэкдорное флеш-дро.'
            }
          ],
          villainActionText: `На флопе ${c.flopHi}${s2} ${c.flopMid}${s3} ${c.flopLo}${s1} соперник на BB чекает. У тебя двусторонка (8 аутов).`,
          toCall: 0,
          minBet: 1.8,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 1.8,
            maxOptimalSize: 3.2,
            optimalTags: ['semibluff_equity'],
            trapTags: ['pot_control'],
            explanation: `У нас неготовая рука без шоудаун-вэлью (${c.hi}-хай), но с 8 чистыми аутами на стрит. Контбет 33–50% банка сразу выбивает пустые оверкарты BB (QJ, J10, A9) и маскирует нашу руку под сильную топ-пару.`,
            sizingNote: 'Контбет в полублеф 2.0–2.8 ББ.'
          },
          rangeMatrix: {
            value: [`${c.flopMid}${c.flopMid}`, `${c.flopLo}${c.flopLo}`, `${c.flopHi}Qo`, `${c.flopHi}Js`],
            medium: ['99', '88', '77', '66', `A${c.flopMid}s`, `Q${c.flopMid}s`],
            draws: ['98s', '87s', '76s', '65s'],
            bluffs: ['QJo', 'J10o', 'A4s']
          }
        },
        {
          name: 'Терн',
          board: [`${c.flopHi}${s2}`, `${c.flopMid}${s3}`, `${c.flopLo}${s1}`, `${c.turnCard}${s1}`],
          potBeforeAction: 10.3,
          effectiveStack: Number((stack - 4.4).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: `Флоп [${c.flopHi}${s2} ${c.flopMid}${s3} ${c.flopLo}${s1}]`,
              text: 'BB чек → Hero (BTN) бет 2.2 ББ → BB колл (Банк: 10.3 ББ)'
            },
            {
              street: `Терн [${c.turnCard}${s1}]`,
              text: `Закрылся наш стрит И открылось флеш-дро ${s1}! BB чекает.`
            }
          ],
          villainActionText: `На терне ${c.turnCard}${s1} закрылся твой стрит (плюс редро на флеш ${s1}). BB чекает.`,
          toCall: 0,
          minBet: 3.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 6.0,
            maxOptimalSize: 8.5,
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'Наш скрытый коннектор собрал стрит (и попутно флеш-дро)! Ставим плотный второй баррель 65–75% банка, добирая с топ-пар, двух пар и совпадений с флеш-дро.',
            sizingNote: 'Плотный бет 6.5–8.0 ББ на вэлью.'
          },
          rangeMatrix: {
            value: [`${c.flopMid}${c.flopMid}`, `${c.flopLo}${c.flopLo}`, `${c.flopHi}Qo`, `${c.flopHi}Js`],
            medium: [`A${c.flopMid}s`, '88', '77'],
            draws: [`A${s1}9${s1}`, `Q${s1}10${s1}`, `J${s1}9${s1}`],
            bluffs: []
          }
        },
        {
          name: 'Ривер',
          board: [`${c.flopHi}${s2}`, `${c.flopMid}${s3}`, `${c.flopLo}${s1}`, `${c.turnCard}${s1}`, `${c.rivCard}${s4}`],
          potBeforeAction: 24.3,
          effectiveStack: Number((stack - 11.4).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: `Терн [${c.turnCard}${s1}]`,
              text: 'BB чек → Hero (BTN) бет 7.0 ББ → BB колл (Банк: 24.3 ББ)'
            },
            {
              street: `Ривер [${c.rivCard}${s4}]`,
              text: 'Бланковый ривер. BB чекает в третий раз.'
            }
          ],
          villainActionText: `На ривере ${c.rivCard}${s4} у тебя стрит. Игрок на BB чекает.`,
          toCall: 0,
          minBet: 6.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 12.0,
            maxOptimalSize: Number((stack - 11.4).toFixed(1)),
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'Скрытый стрит с мелким коннектором почти невозможно прочитать: соперник положил нас на промазавшее флеш-дро или оверкарты и часто вскроет крупную ставку или пуш со своей топ-парой и допером.',
            sizingNote: 'Добор 65–100% банка.'
          },
          rangeMatrix: {
            value: [`${c.flopMid}${c.flopMid}`, `${c.flopLo}${c.flopLo}`, `${c.flopHi}Qo`],
            medium: [`${c.flopHi}Js`, `${c.flopHi}10s`],
            draws: [],
            bluffs: [`A${s1}9${s1}`]
          }
        }
      ]
    };
  },

  // 2. БЛЕФ ИЗ СЛАБОЙ ПОЗИЦИИ (SB vs BB — Слепая война без позиции!)
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const sbHands = [
      { c1: 'Q', c2: '8', f1: '10', f2: '9', f3: '3', t: '4', r: 'K' },
      { c1: 'J', c2: '7', f1: '9', f2: '8', f3: '2', t: '3', r: 'K' },
      { c1: '10', c2: '7', f1: '9', f2: '8', f3: '3', t: '2', r: 'Q' }
    ];
    const h = sbHands[variant % sbHands.length];
    const heroPos = mode === 'headsup' ? 'BTN' : 'SB';
    const villainPos = 'BB';
    return {
      focusCategory: 'bluff_oop',
      mode,
      title: `Блеф без позиции (${heroPos} vs BB): ${h.c1}${s1}${h.c2}${s1} — Три барреля в страшную карту`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${h.c1}${s1}`, `${h.c2}${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 2.5,
          effectiveStack: stack,
          isPreflopRFI: true,
          villainLastActionBadge: 'ББ 1 ББ • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Все игроки с UTG до BTN сбросили. Слово за Hero на Малом Блайнде (SB) против BB.'
            }
          ],
          villainActionText: `Все сбросили до тебя на Малом Блайнде (SB). У тебя ${h.c1}${s1} ${h.c2}${s1} против BB.`,
          toCall: 0.5,
          minBet: 2.5,
          minRaise: 2.5,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['bet', 'raise', 'call'],
            minOptimalSize: 2.5,
            maxOptimalSize: 3.2,
            optimalTags: ['semibluff_equity', 'value_bet'],
            trapTags: ['fold_behind'],
            explanation: `На Малом Блайнде против единственного игрока на BB мы разыгрываем широкий диапазон. С одномастными ${h.c1}${s1} ${h.c2}${s1} отлично работает агрессивный рейз 2.8–3.0 ББ (чтобы забрать банк сразу из-за отсутствия позиции), хотя комплит 0.5 ББ тоже допустим в миксе.`,
            sizingNote: 'Рейз с SB 2.8–3.0 ББ (или комплит 0.5 ББ).'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '88', 'AKs', 'AQs'],
            medium: ['77', '66', '55', 'AJs', 'KQs', 'KJs', 'QJs', 'J10s'],
            draws: ['Q8s', 'J7s', '107s', '97s', '86s', '75s'],
            bluffs: ['K8o', 'Q9o', 'J8o']
          }
        },
        {
          name: 'Флоп',
          board: [`${h.f1}${s1}`, `${h.f2}${s2}`, `${h.f3}${s3}`],
          potBeforeAction: 7.0,
          effectiveStack: Number((stack - 3.0).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Hero (SB) рейз 3.0 ББ → BB коллирует в позиции (Банк: 7.0 ББ)'
            },
            {
              street: `Флоп [${h.f1}${s1} ${h.f2}${s2} ${h.f3}${s3}]`,
              text: 'Первое слово за Hero без позиции. У нас гатшот + бэкдорное флеш-дро + оверкарта.'
            }
          ],
          villainActionText: `Ты без позиции на SB. На флопе ${h.f1}${s1} ${h.f2}${s2} ${h.f3}${s3} первое слово за тобой.`,
          toCall: 0,
          minBet: 2.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 2.2,
            maxOptimalSize: 3.8,
            optimalTags: ['semibluff_equity'],
            trapTags: ['fold_behind'],
            explanation: `Без позиции с ${h.c1}-хай мы не выиграем на вскрытии через чек-фолд. Зато у нас есть гатшот, оверкарта и бэкдор масти ${s1} — ставим контбет ~35–45% банка (2.5–3 ББ), выбивая пустые руки BB.`,
            sizingNote: 'Контбет без позиции 2.5–3.2 ББ.'
          },
          rangeMatrix: {
            value: [`${h.f1}${h.f1}`, `${h.f2}${h.f2}`, `${h.f1}${h.f2}s`],
            medium: [`A${h.f1}o`, `K${h.f1}o`, `Q${h.f1}s`, `J${h.f1}s`, `A${h.f2}s`, '77', '66'],
            draws: ['QJs', 'J8s', '76s', '65s'],
            bluffs: ['A4o', 'K5s', 'Q6s']
          }
        },
        {
          name: 'Терн',
          board: [`${h.f1}${s1}`, `${h.f2}${s2}`, `${h.f3}${s3}`, `${h.t}${s1}`],
          potBeforeAction: 12.6,
          effectiveStack: Number((stack - 5.8).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Флоп [${h.f1}${s1} ${h.f2}${s2} ${h.f3}${s3}]`,
              text: 'Hero (SB) бет 2.8 ББ → BB колл (Банк: 12.6 ББ)'
            },
            {
              street: `Терн [${h.t}${s1}]`,
              text: `Открылось флеш-дро ${s1} в масть нашим картам! У нас теперь फлеш-дро + гатшот (12 аутов).`
            }
          ],
          villainActionText: `На терне ${h.t}${s1} у тебя открылось флеш-дро + гатшот. Первое слово за тобой без позиции.`,
          toCall: 0,
          minBet: 4.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 6.5,
            maxOptimalSize: 9.5,
            optimalTags: ['semibluff_equity', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation: `Карта ${h.t}${s1} дала нам мощное комбо-дро (9 аутов на флеш + 3 аута на стрит). Продолжаем агрессию плотным вторым баррелем ~60% банка (7.5–8.5 ББ), заставляя BB выбрасывать вторые и третьи пары!`,
            sizingNote: 'Второй баррель в полублеф 7.5–8.5 ББ.'
          },
          rangeMatrix: {
            value: [`${h.f1}${h.f1}`, `${h.f2}${h.f2}`, `${h.f1}${h.f2}s`],
            medium: [`A${h.f1}o`, `K${h.f1}o`, `Q${h.f1}s`, `J${h.f1}s`],
            draws: ['QJs', '76s', `A${s1}5${s1}`],
            bluffs: []
          }
        },
        {
          name: 'Ривер',
          board: [`${h.f1}${s1}`, `${h.f2}${s2}`, `${h.f3}${s3}`, `${h.t}${s1}`, `${h.r}${s4}`],
          potBeforeAction: 28.6,
          effectiveStack: Number((stack - 13.8).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Терн [${h.t}${s1}]`,
              text: 'Hero (SB) бет 8.0 ББ → BB колл (Банк: 28.6 ББ)'
            },
            {
              street: `Ривер [${h.r}${s4}]`,
              text: `Наше дро промазало, но вышла оверкарта ${h.r}${s4}! У Hero ${h.c1}-хай без шоудаун-вэлью.`
            }
          ],
          villainActionText: `Твое дро промазало, но на ривере вышла страшная оверкарта ${h.r}${s4}. Стек ${fmtBB(
            stack - 13.8
          )} ББ в банк 28.6 ББ.`,
          toCall: 0,
          minBet: 8.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: Number((stack - 16.8).toFixed(1)),
            maxOptimalSize: Number((stack - 13.8).toFixed(1)),
            optimalTags: ['blockers_factor', 'semibluff_equity'],
            trapTags: ['pot_control'],
            explanation: `Чек на ривере с ${h.c1}-хай означает 100% поражение. При этом вышедшая оверкарта ${h.r} идеально подходит спектру префлоп-рейзера, а наша рука ${h.c1}${s1}${h.c2}${s1} блокирует стрит-комбинации соперника! Дожимаем третьим баррелем (пушем), выбивая все средние пары (${h.f1}x, ${h.f2}x).`,
            sizingNote: 'Дожимающий блеф-пуш на ривере!'
          },
          rangeMatrix: {
            value: [`${h.f1}${h.f1}`, `${h.f2}${h.f2}`, `K${h.f1}s`],
            medium: [`A${h.f1}o`, `Q${h.f1}s`, `J${h.f1}s`],
            draws: [],
            bluffs: ['QJs', '76s']
          }
        }
      ]
    };
  },

  // 3. ЧЕК-РЕЙЗ В БЛЕФ С БОЛЬШОГО БЛАЙНДА (BB vs BTN с 6♦4♦ / 7♠5♠ / 8♥5♥)
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const gappers = [
      { c1: '6', c2: '4', f1: '8', f2: '5', f3: '2', t: '7', r: 'K' },
      { c1: '7', c2: '5', f1: '9', f2: '6', f3: '2', t: '8', r: 'Q' },
      { c1: '9', c2: '7', f1: 'J', f2: '8', f3: '3', t: '10', r: '2' }
    ];
    const g = gappers[variant % gappers.length];
    const heroPos = 'BB';
    const villainPos = 'BTN';
    return {
      focusCategory: 'bluff_oop',
      mode,
      title: `Агрессивная защита BB: ${g.c1}${s1}${g.c2}${s1} против BTN (Чек-рейз на флопе)`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${g.c1}${s1}`, `${g.c2}${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 4.5,
          effectiveStack: stack,
          villainLastActionBadge: 'Рейз 2.0 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Все пас до BTN. Баттон открывается мин-рейзом 2.0 ББ → SB пас. Слово за Hero на BB.'
            }
          ],
          villainActionText: `BTN открылся мин-рейзом 2.0 ББ. Тебе на BB нужно доставить 1.0 ББ с одномастным гаппером ${g.c1}${s1} ${g.c2}${s1}.`,
          toCall: 1.0,
          minRaise: 5.5,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call'],
            optimalTags: ['protect_check_range', 'pot_control'],
            trapTags: ['fold_behind'],
            explanation: `Против мин-рейза 2 ББ с баттона нам нужно всего 18% эквити (доставить 1 ББ в банк 4.5 ББ). Одномастные связки ${g.c1}${s1} ${g.c2}${s1} обязательно защищаются коллом на BB.`,
            sizingNote: 'Колл 1.0 ББ на Большом Блайнде.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '88', 'AKs', 'AQs'],
            medium: ['77', '66', '55', '44', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J10s', '109s', '98s', '87s', '76s', '65s', '54s'],
            bluffs: ['A2o', 'K7o', 'Q8o', 'J8o']
          }
        },
        {
          name: 'Флоп',
          board: [`${g.f1}${s2}`, `${g.f2}${s1}`, `${g.f3}${s3}`],
          potBeforeAction: 5.5,
          effectiveStack: Number((stack - 1.0).toFixed(1)),
          villainLastActionBadge: 'Бет 1.8 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'BTN рейз 2.0 ББ → Hero (BB) колл (Банк: 5.5 ББ)'
            },
            {
              street: `Флоп [${g.f1}${s2} ${g.f2}${s1} ${g.f3}${s3}]`,
              text: 'Низкий борд. Hero чек → BTN ставит мелкий контбет 1.8 ББ (33% банка).'
            }
          ],
          villainActionText: `На низком флопе ${g.f1}${s2} ${g.f2}${s1} ${g.f3}${s3} баттон ставит 1.8 ББ. У тебя гатшот + бэкдорное ФД без шоудаун-вэлью.`,
          toCall: 1.8,
          minRaise: 5.2,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['raise', 'call'],
            minOptimalSize: 5.2,
            maxOptimalSize: 6.8,
            optimalTags: ['semibluff_equity', 'protect_check_range'],
            trapTags: ['fold_behind'],
            explanation: `На низком борде ${g.f1}-${g.f2}-${g.f3} у BB много двух пар и сетов, а баттон ставит мелкий контбет со множеством пустых оверкарт (AK, AQ, KQ, QJ). Наша рука ${g.c1}${s1}${g.c2}${s1} имеет гатшот и бэкдорное ФД, но 0% шансов выиграть на чек-шоудауне — идеальный кандидат для чек-рейза в полублеф до 5.5–6.0 ББ!`,
            sizingNote: 'Агрессивный чек-рейз до 5.5–6.2 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', `${g.f1}${g.f1}`, `${g.f2}${g.f2}`],
            medium: [`A${g.f1}s`, `K${g.f1}s`, '99', '77', '66'],
            draws: ['97s', '76s', '64s', '54s'],
            bluffs: ['AKo', 'AQo', 'AJo', 'KQo', 'KJo', 'QJo']
          }
        },
        {
          name: 'Терн',
          board: [`${g.f1}${s2}`, `${g.f2}${s1}`, `${g.f3}${s3}`, `${g.t}${s4}`],
          potBeforeAction: 17.1,
          effectiveStack: Number((stack - 6.8).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Флоп [${g.f1}${s2} ${g.f2}${s1} ${g.f3}${s3}]`,
              text: 'Hero (BB) чек-рейз до 5.8 ББ → BTN колл (Банк: 17.1 ББ)'
            },
            {
              street: `Терн [${g.t}${s4}]`,
              text: `Закрылся наш стрит на ${g.t}${s4}! Первое слово за Hero.`
            }
          ],
          villainActionText: `На терне ${g.t}${s4} твой чек-рейз в полублеф доехал в чистый стрит! Первое слово за тобой.`,
          toCall: 0,
          minBet: 4.5,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 8.5,
            maxOptimalSize: 12.5,
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'Наш агрессивный чек-рейз на флопе окупился сполна: на терне закрылся натсовый стрит! Продолжаем ставить 55–70% банка (9.5–11.5 ББ), чтобы к риверу подготовить пуш против оверпар и топ-пар баттона.',
            sizingNote: 'Продолженная ставка 9.5–11.5 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', `${g.f1}${g.f1}`, `${g.f2}${g.f2}`],
            medium: [`A${g.f1}s`, `K${g.f1}s`],
            draws: ['98s', '87s'],
            bluffs: []
          }
        },
        {
          name: 'Ривер',
          board: [`${g.f1}${s2}`, `${g.f2}${s1}`, `${g.f3}${s3}`, `${g.t}${s4}`, `${g.r}${s1}`],
          potBeforeAction: 38.1,
          effectiveStack: Math.max(8, Number((stack - 17.3).toFixed(1))),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Терн [${g.t}${s4}]`,
              text: 'Hero (BB) бет 10.5 ББ → BTN колл (Банк: 38.1 ББ)'
            },
            {
              street: `Ривер [${g.r}${s1}]`,
              text: 'Бланковый ривер. Первое слово за Hero.'
            }
          ],
          villainActionText: `На ривере ${g.r}${s1} у тебя стрит, в банке 38.1 ББ. Твой ход.`,
          toCall: 0,
          minBet: 8.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: Math.max(6, Number((stack - 19.3).toFixed(1))),
            maxOptimalSize: Math.max(8, Number((stack - 17.3).toFixed(1))),
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'У нас стрит в разогнанном банке при SPR ~ 0.5. Спокойно ставим олл-ин и забираем стек у оверпар (AA, KK, QQ) и совпавших двух пар соперника.',
            sizingNote: 'Доборный олл-ин на ривере.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', `${g.f1}${g.f1}`, `${g.f2}${g.f2}`],
            medium: [`A${g.f1}s`, `K${g.f1}s`],
            draws: [],
            bluffs: []
          }
        }
      ]
    };
  },

  // 4. ИГРА ИЗ РАННЕЙ/СРЕДНЕЙ ПОЗИЦИИ ПОД ДАВЛЕНИЕМ (LJ vs BTN — раздача без позиции с K♠Q♦ / Q♥J♠)
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const offBroadways = [
      { r1: 'K', r2: 'Q', f1: 'Q', f2: '8', f3: '5', t: '9', r: 'J' },
      { r1: 'Q', r2: 'J', f1: 'J', f2: '7', f3: '4', t: '8', r: '10' },
      { r1: 'K', r2: 'J', f1: 'J', f2: '6', f3: '3', t: '7', r: '9' }
    ];
    const b = offBroadways[variant % offBroadways.length];
    const heroPos = mode === 'headsup' ? 'BB' : 'LJ';
    const villainPos = 'BTN';
    return {
      focusCategory: 'bluff_oop',
      mode,
      title: `Под давлением без позиции (${heroPos} vs BTN): ${b.r1}${s1}${b.r2}${s2} на 4-стрит доске`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${b.r1}${s1}`, `${b.r2}${s2}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 2.5,
          effectiveStack: stack,
          isPreflopRFI: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `UTG и UTG+1 сбрасывают. Слово за Hero на ранней-средней позиции (${heroPos}).`
            }
          ],
          villainActionText: `До тебя сбросили. У тебя разномастный бродвей ${b.r1}${s1} ${b.r2}${s2} на позиции ${heroPos}.`,
          toCall: 1.0,
          minBet: 2.0,
          minRaise: 2.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['bet', 'raise'],
            minOptimalSize: 2.0,
            maxOptimalSize: 2.4,
            optimalTags: ['value_bet'],
            trapTags: ['fold_behind'],
            explanation: `Разномастные ${b.r1}${b.r2}o входят в стандартный спектр открытия с ${heroPos}, но требуют аккуратного сайзинга 2.1–2.2 ББ, так как позади сидят 5 игроков в позиции.`,
            sizingNote: 'Опен-рейз 2.1–2.2 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AQs', 'AJs'],
            medium: ['88', '77', '66', 'AQo', 'KQs', 'KJs', 'QJs', 'KQo'],
            draws: ['J10s', '109s', '98s'],
            bluffs: []
          }
        },
        {
          name: 'Флоп',
          board: [`${b.f1}${s3}`, `${b.f2}${s1}`, `${b.f3}${s4}`],
          potBeforeAction: 5.9,
          effectiveStack: Number((stack - 2.2).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `Hero (${heroPos}) рейз 2.2 ББ → BTN коллирует в позиции → Блайнды пас (Банк: 5.9 ББ)`
            },
            {
              street: `Флоп [${b.f1}${s3} ${b.f2}${s1} ${b.f3}${s4}]`,
              text: 'Hero попал в топ-пару со вторым кикером, но играет без позиции против баттона.'
            }
          ],
          villainActionText: `Ты без позиции на ${heroPos} против колдколлера на BTN. Доска ${b.f1}${s3} ${b.f2}${s1} ${b.f3}${s4}.`,
          toCall: 0,
          minBet: 1.8,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet', 'check'],
            minOptimalSize: 1.8,
            maxOptimalSize: 3.0,
            optimalTags: ['value_bet', 'pot_control'],
            trapTags: ['trap_fold_worse'],
            explanation: `С топ-парой ${b.r1}${b.r2} без позиции против плотного диапазона баттона мы используем аккуратный контбет 33% банка (2 ББ) или миксуем с чеком, чтобы не раздувать огромный банк без позиции.`,
            sizingNote: 'Мелкий контбет 2.0 ББ (или чек).'
          },
          rangeMatrix: {
            value: [`${b.f2}${b.f2}`, `${b.f3}${b.f3}`, `A${b.f1}s`, `K${b.f1}s`],
            medium: ['1010', '99', `Q${b.f1}s`, `J${b.f1}s`, '87s'],
            draws: ['109s', '98s', '76s'],
            bluffs: ['AJo', 'K10s']
          }
        },
        {
          name: 'Терн',
          board: [`${b.f1}${s3}`, `${b.f2}${s1}`, `${b.f3}${s4}`, `${b.t}${s2}`],
          potBeforeAction: 9.9,
          effectiveStack: Number((stack - 4.2).toFixed(1)),
          villainLastActionBadge: 'Бет 5.5 ББ',
          actionHistory: [
            {
              street: `Флоп [${b.f1}${s3} ${b.f2}${s1} ${b.f3}${s4}]`,
              text: `Hero (${heroPos}) бет 2.0 ББ → BTN колл (Банк: 9.9 ББ)`
            },
            {
              street: `Терн [${b.t}${s2}]`,
              text: `Выходит связующая карта ${b.t}${s2}. Hero чекает для пот-контроля → BTN ставит 5.5 ББ.`
            }
          ],
          villainActionText: `На скоординированном терне ${b.t}${s2} ты сыграл чек, и BTN ставит 5.5 ББ в банк 9.9 ББ.`,
          toCall: 5.5,
          minRaise: 14.0,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call'],
            optimalTags: ['pot_control', 'protect_check_range'],
            trapTags: ['fold_behind', 'trap_fold_worse'],
            explanation:
              'Против одной ставки на терне наша топ-пара со вторым кикером обязана коллировать: баттон часто флоатит наш чек с гатшотами, парами слабее и флеш-дро.',
            sizingNote: 'Чек-колл 5.5 ББ.'
          },
          rangeMatrix: {
            value: [`${b.f2}${b.f2}`, `${b.f3}${b.f3}`, 'J10s', '76s'],
            medium: [`A${b.f1}s`, `K${b.f1}s`, `Q${b.f1}s`, '1010', '99'],
            draws: ['109s', 'J9s'],
            bluffs: ['A10s', 'K10s']
          }
        },
        {
          name: 'Ривер',
          board: [`${b.f1}${s3}`, `${b.f2}${s1}`, `${b.f3}${s4}`, `${b.t}${s2}`, `${b.r}${s3}`],
          potBeforeAction: 20.9,
          effectiveStack: Number((stack - 9.7).toFixed(1)),
          villainLastActionBadge: 'Бет 16.5 ББ',
          actionHistory: [
            {
              street: `Терн [${b.t}${s2}]`,
              text: `Hero (${heroPos}) чек-колл 5.5 ББ (Банк: 20.9 ББ)`
            },
            {
              street: `Ривер [${b.r}${s3}]`,
              text: `На доске закрылся 4-стрит! Hero чек → BTN ставит крупно 16.5 ББ.`
            }
          ],
          villainActionText: `На 4-стрит ривере ${b.r}${s3} соперник на BTN ставит 16.5 ББ. У тебя только одна пара ${b.r1}${b.r2}.`,
          toCall: 16.5,
          minRaise: Number((stack - 9.7).toFixed(1)),
          gtoAction: {
            type: 'fold',
            acceptableTypes: ['fold'],
            optimalTags: ['fold_behind', 'spr_icm_control'],
            trapTags: ['trap_pot_committed'],
            explanation:
              'На 4-стрит доске в спектре баттона огромное количество готовых стритов, сетов и двух пар, а превращать руки в блеф такой крупной ставкой против нашего узкого спектра он будет крайне редко. Не привязывайся к уже вложенным фишкам — спокойный пас!',
            sizingNote: 'Дисциплинированный пас одной пары.'
          },
          rangeMatrix: {
            value: ['1010', 'J10s', '109s', `${b.f2}${b.f2}`],
            medium: [`A${b.f1}s`],
            draws: [],
            bluffs: ['A5s']
          }
        }
      ]
    };
  },

  // 5. МЕЛКИЕ И СРЕДНИЕ КАРМАННЫЕ ПАРЫ (55 / 66 / 77 / 88 на BB vs CO) — Пот-контроль и доезд/блеф-кетч
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const pairPool = [
      { p: '6', f1: 'Q', f2: '8', f3: '3', t: '6', r: '2' },
      { p: '7', f1: 'K', f2: '9', f3: '4', t: '7', r: '2' },
      { p: '5', f1: 'J', f2: '8', f3: '2', t: '5', r: '3' }
    ];
    const pk = pairPool[variant % pairPool.length];
    const heroPos = 'BB';
    const villainPos = mode === 'headsup' ? 'BTN' : 'CO';
    return {
      focusCategory: 'pairs_broadway',
      mode,
      title: `Карманная пара на BB: ${pk.p}${s1}${pk.p}${s2} против ${villainPos} (Чек-колл и скрытый сет)`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${pk.p}${s1}`, `${pk.p}${s2}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 4.7,
          effectiveStack: stack,
          villainLastActionBadge: 'Рейз 2.2 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `${villainPos} открывается рейзом 2.2 ББ → BTN и SB пас. Слово за Hero на BB.`
            }
          ],
          villainActionText: `Игрок на ${villainPos} открыл 2.2 ББ. Тебе на BB нужно доставить 1.2 ББ с парой ${pk.p}${s1} ${pk.p}${s2}.`,
          toCall: 1.2,
          minRaise: 6.0,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call'],
            optimalTags: ['pot_control', 'protect_check_range'],
            trapTags: ['fold_behind'],
            explanation: `Карманные ${pk.p}${pk.p} на Большом Блайнде против открытия 2.2 ББ всегда играются коллом: отличные шансы банка (нужно 20% эквити) и высокий имплайд-потенциал при попадании в сет.`,
            sizingNote: 'Колл 1.2 ББ на BB.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '88', 'AKs', 'AQs'],
            medium: ['77', '66', '55', '44', 'AJs', 'KQs', 'AQo', 'KQo'],
            draws: ['J10s', '109s', '98s', '87s', '76s'],
            bluffs: ['K10o', 'Q10o', 'J9s']
          }
        },
        {
          name: 'Флоп',
          board: [`${pk.f1}${s3}`, `${pk.f2}${s1}`, `${pk.f3}${s4}`],
          potBeforeAction: 5.9,
          effectiveStack: Number((stack - 1.2).toFixed(1)),
          villainLastActionBadge: 'Бет 1.9 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `${villainPos} рейз 2.2 ББ → Hero (BB) колл (Банк: 5.9 ББ)`
            },
            {
              street: `Флоп [${pk.f1}${s3} ${pk.f2}${s1} ${pk.f3}${s4}]`,
              text: `Hero чек → ${villainPos} ставит мелкий контбет 1.9 ББ (32% банка).`
            }
          ],
          villainActionText: `На сухом флопе ${pk.f1}${s3} ${pk.f2}${s1} ${pk.f3}${s4} соперник ставит 1.9 ББ. У тебя третья пара ${pk.p}${pk.p}.`,
          toCall: 1.9,
          minRaise: 5.0,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call'],
            optimalTags: ['protect_check_range', 'pot_control', 'dry_board'],
            trapTags: ['fold_behind', 'trap_fold_worse'],
            explanation:
              'Против мелкой ставки 32% банка на сухой доске нельзя сдаваться с карманной парой: мы бьем все непарные руки соперника (AK, AJ, A10, KJ, J10) и имеем 2 чистых аута на скрытый сет.',
            sizingNote: 'Защита чек-коллом 1.9 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', `${pk.f2}${pk.f2}`, `A${pk.f1}o`, `K${pk.f1}o`],
            medium: ['JJ', '1010', '99', `A${pk.f2}s`, '98s', '87s'],
            draws: ['J10s', '109s'],
            bluffs: ['AKo', 'AJo', 'A10o', 'K10s']
          }
        },
        {
          name: 'Терн',
          board: [`${pk.f1}${s3}`, `${pk.f2}${s1}`, `${pk.f3}${s4}`, `${pk.t}${s3}`],
          potBeforeAction: 9.7,
          effectiveStack: Number((stack - 3.1).toFixed(1)),
          villainLastActionBadge: 'Бет 6.5 ББ',
          actionHistory: [
            {
              street: `Флоп [${pk.f1}${s3} ${pk.f2}${s1} ${pk.f3}${s4}]`,
              text: 'Hero (BB) чек-колл 1.9 ББ (Банк: 9.7 ББ)'
            },
            {
              street: `Терн [${pk.t}${s3}]`,
              text: `Доехал наш скрытый сет ${pk.p}${pk.p}! Hero чек → ${villainPos} ставит 6.5 ББ.`
            }
          ],
          villainActionText: `На терне ${pk.t}${s3} ты поймал сет! Соперник ставит второй баррель 6.5 ББ.`,
          toCall: 6.5,
          minRaise: 15.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['raise', 'call'],
            minOptimalSize: 15.0,
            maxOptimalSize: Number((stack - 3.1).toFixed(1)),
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['fold_behind'],
            explanation:
              'Соперник ставит плотный второй баррель, полярно изображая сильную топ-пару, оверпару или флеш-дро. С нашим сетом обязателен чек-рейз на терне, чтобы забрать весь его стек на ривере!',
            sizingNote: 'Чек-рейз на вэлью до 16–18 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', `${pk.f2}${pk.f2}`, `A${pk.f1}o`, `K${pk.f1}o`],
            medium: [`Q${pk.f1}s`, '98s'],
            draws: [`A${s3}K${s3}`, `K${s3}J${s3}`, '109s'],
            bluffs: ['AKo', 'AJo']
          }
        },
        {
          name: 'Ривер',
          board: [`${pk.f1}${s3}`, `${pk.f2}${s1}`, `${pk.f3}${s4}`, `${pk.t}${s3}`, `${pk.r}${s2}`],
          potBeforeAction: 41.7,
          effectiveStack: Math.max(8, Number((stack - 19.1).toFixed(1))),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Терн [${pk.t}${s3}]`,
              text: `Hero чек-рейз до 16 ББ → ${villainPos} колл (Банк: 41.7 ББ)`
            },
            {
              street: `Ривер [${pk.r}${s2}]`,
              text: 'Полный бланк на ривере! Первое слово за Hero.'
            }
          ],
          villainActionText: `На бланковом ривере ${pk.r}${s2} у тебя сет, в банке 41.7 ББ. Первое слово за тобой.`,
          toCall: 0,
          minBet: 8.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: Math.max(6, Number((stack - 21.1).toFixed(1))),
            maxOptimalSize: Math.max(8, Number((stack - 19.1).toFixed(1))),
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'Все дро промазали, а топ-пары и оверпары соперника уже привязаны к банку после колла на терне. Ставим олл-ин на вэлью!',
            sizingNote: 'Доборный олл-ин на ривере.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', `A${pk.f1}o`, `K${pk.f1}o`],
            medium: ['98s'],
            draws: [],
            bluffs: []
          }
        }
      ]
    };
  },

  // 6. ОДНОМАСТНЫЕ ГАППЕРЫ НА КАТОФФЕ (J♠9♠ / 10♥8♥ / 9♦7♦) — Против чек-рейза или проб-бета
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const gapPool = [
      { c1: 'J', c2: '9', f1: '10', f2: '8', f3: '2', t: '4', r: 'Q' },
      { c1: '10', c2: '8', f1: '9', f2: '7', f3: '2', t: '3', r: 'J' }
    ];
    const g = gapPool[variant % gapPool.length];
    const heroPos = 'CO';
    const villainPos = 'BB';
    return {
      focusCategory: 'connectors',
      mode,
      title: `Гаппер на CO: ${g.c1}${s1}${g.c2}${s1} против BB (Двусторонка и доезд на ривере)`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${g.c1}${s1}`, `${g.c2}${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 2.5,
          effectiveStack: stack,
          isPreflopRFI: true,
          villainLastActionBadge: 'ББ 1 ББ • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'UTG–HJ сбросили. Слово за Hero на катоффе (CO).'
            }
          ],
          villainActionText: `До тебя все сбросили. Твое слово на CO с одномастным гаппером ${g.c1}${s1} ${g.c2}${s1}.`,
          toCall: 1.0,
          minBet: 2.0,
          minRaise: 2.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['bet', 'raise'],
            minOptimalSize: 2.0,
            maxOptimalSize: 2.5,
            optimalTags: ['semibluff_equity', 'value_bet'],
            trapTags: ['fold_behind'],
            explanation: `Одномастные гапперы ${g.c1}${s1} ${g.c2}${s1} входят в стандартный спектр опен-рейза с CO: они отлично цепляются за средние доски и маскируют собранные стриты.`,
            sizingNote: 'Опен-рейз 2.2 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AQs'],
            medium: ['88', '77', '66', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J9s', '108s', '97s', '86s', 'J10s', '109s'],
            bluffs: ['K10o', 'Q10o']
          }
        },
        {
          name: 'Флоп',
          board: [`${g.f1}${s2}`, `${g.f2}${s1}`, `${g.f3}${s3}`],
          potBeforeAction: 5.9,
          effectiveStack: Number((stack - 2.2).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Hero (CO) рейз 2.2 ББ → BTN и SB пас → BB колл (Банк: 5.9 ББ)'
            },
            {
              street: `Флоп [${g.f1}${s2} ${g.f2}${s1} ${g.f3}${s3}]`,
              text: 'BB чекает. У Hero двустороннее стрит-дро + оверкарта + бэкдорное ФД.'
            }
          ],
          villainActionText: `На флопе ${g.f1}${s2} ${g.f2}${s1} ${g.f3}${s3} игрок на BB чекает. У тебя двусторонка (8 аутов).`,
          toCall: 0,
          minBet: 1.8,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet', 'check'],
            minOptimalSize: 2.0,
            maxOptimalSize: 3.5,
            optimalTags: ['semibluff_equity'],
            trapTags: ['fold_behind'],
            explanation:
              'С 8 аутами на натсовый стрит и живой оверкартой мы ставим контбет в полублеф (40–50% банка), выбивая пустые бродвеи BB и наращивая банк на случай доезда.',
            sizingNote: 'Контбет 2.4–3.0 ББ.'
          },
          rangeMatrix: {
            value: [`${g.f1}${g.f1}`, `${g.f2}${g.f2}`, `${g.f1}${g.f2}s`],
            medium: [`A${g.f1}o`, `K${g.f1}s`, `Q${g.f1}s`, `A${g.f2}s`, '77', '66'],
            draws: ['QJs', '97s', '76s'],
            bluffs: ['A5o', 'KJo', 'QJo']
          }
        },
        {
          name: 'Терн',
          board: [`${g.f1}${s2}`, `${g.f2}${s1}`, `${g.f3}${s3}`, `${g.t}${s4}`],
          potBeforeAction: 11.1,
          effectiveStack: Number((stack - 4.8).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: `Флоп [${g.f1}${s2} ${g.f2}${s1} ${g.f3}${s3}]`,
              text: 'BB чек → Hero (CO) бет 2.6 ББ → BB колл (Банк: 11.1 ББ)'
            },
            {
              street: `Терн [${g.t}${s4}]`,
              text: 'Бланковый терн. BB снова чекает.'
            }
          ],
          villainActionText: `На бланковом терне ${g.t}${s4} соперник на BB чекает. У тебя по-прежнему 8 аутов на стрит и 3 аута на топ-пару.`,
          toCall: 0,
          minBet: 3.0,
          gtoAction: {
            type: 'check',
            acceptableTypes: ['check', 'bet'],
            optimalTags: ['pot_control', 'spr_icm_control'],
            trapTags: ['trap_fold_worse'],
            explanation:
              'BB заколлировал флоп на связанной доске и не сдаст топ-пару на бланковом терне, а более сильные руки могут сыграть чек-пуш, лишив нас эквити! Пользуемся преимуществом позиции — берем бесплатную карту и реализуем свои 11 аутов.',
            sizingNote: 'Бесплатный чек вдогонку для реализации эквити.'
          },
          rangeMatrix: {
            value: [`${g.f1}${g.f1}`, `${g.f2}${g.f2}`, `${g.f1}${g.f2}s`],
            medium: [`A${g.f1}o`, `K${g.f1}s`, `Q${g.f1}s`, `A${g.f2}s`, '77'],
            draws: ['QJs', '76s'],
            bluffs: []
          }
        },
        {
          name: 'Ривер',
          board: [`${g.f1}${s2}`, `${g.f2}${s1}`, `${g.f3}${s3}`, `${g.t}${s4}`, `${g.r}${s2}`],
          potBeforeAction: 11.1,
          effectiveStack: Number((stack - 4.8).toFixed(1)),
          villainLastActionBadge: 'Бет 7.0 ББ',
          actionHistory: [
            {
              street: `Терн [${g.t}${s4}]`,
              text: 'BB чек → Hero (CO) чек вдогонку (Банк: 11.1 ББ)'
            },
            {
              street: `Ривер [${g.r}${s2}]`,
              text: `На ривере ${g.r}${s2} закрылся наш натсовый стрит! И BB сам ставит 7.0 ББ!`
            }
          ],
          villainActionText: `На ривере ${g.r}${s2} закрылся твой натсовый стрит, а BB ставит 7.0 ББ в банк 11.1 ББ!`,
          toCall: 7.0,
          minRaise: 18.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['raise'],
            minOptimalSize: 18.0,
            maxOptimalSize: Number((stack - 4.8).toFixed(1)),
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'Наш бесплатный чек на терне замаскировал стрит-дро! Теперь на ривере соперник добирает со своих двух пар или сетов, вообще не ожидая увидеть у нас натсовый стрит после чека терна. Обязателен рейз на вэлью!',
            sizingNote: 'Рейз на вэлью до 20 ББ или олл-ин.'
          },
          rangeMatrix: {
            value: [`${g.f1}${g.f1}`, `${g.f2}${g.f2}`, `Q${g.f1}s`, `${g.f1}${g.f2}s`],
            medium: [`A${g.f1}o`, `K${g.f1}s`],
            draws: [],
            bluffs: ['76s']
          }
        }
      ]
    };
  },

  // 7. СЛОУПЛЕЙ МОНСТРА (K♣10♣ / Q♠10♠ на спаренной доске 10-10-4) — Ловушка для блефов
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const kic = variant % 2 === 0 ? 'K' : 'Q';
    const heroPos = 'BB';
    const villainPos = 'BTN';
    return {
      focusCategory: 'pairs_broadway',
      mode,
      title: `Ловушка с трипсом на BB: ${kic}${s1}10${s1} против BTN (Спаренный борд 10-10-4)`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${kic}${s1}`, `10${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 4.5,
          effectiveStack: stack,
          villainLastActionBadge: 'Рейз 2.0 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'Все пас до BTN. Баттон открывает 2.0 ББ → SB пас. Слово за Hero на BB.'
            }
          ],
          villainActionText: `BTN открывает 2.0 ББ. У тебя на BB одномастный бродвей ${kic}${s1} 10${s1}.`,
          toCall: 1.0,
          minRaise: 5.5,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call', 'raise'],
            optimalTags: ['protect_check_range', 'pot_control'],
            trapTags: ['fold_behind'],
            explanation: `Одномастные ${kic}${s1} 10${s1} великолепно играются коллом на BB против широкого спектра баттона, не выбивая доминируемые руки 109s, 108s, K9s, Q9s.`,
            sizingNote: 'Колл 1.0 ББ на BB.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AQs'],
            medium: ['88', '77', '66', '55', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J10s', '109s', '98s', '87s', '76s'],
            bluffs: ['A4o', 'K8o', 'Q8o']
          }
        },
        {
          name: 'Флоп',
          board: [`10${s2}`, `10${s3}`, `4${s4}`],
          potBeforeAction: 5.5,
          effectiveStack: Number((stack - 1.0).toFixed(1)),
          villainLastActionBadge: 'Бет 1.8 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: 'BTN рейз 2.0 ББ → Hero (BB) колл (Банк: 5.5 ББ)'
            },
            {
              street: `Флоп [10${s2} 10${s3} 4${s4}]`,
              text: 'Hero флопнул трипс десяток! Hero чек → BTN ставит 1.8 ББ.'
            }
          ],
          villainActionText: `На спаренном сухом флопе 10${s2} 10${s3} 4${s4} у тебя трипс десяток. BTN ставит 1.8 ББ.`,
          toCall: 1.8,
          minRaise: 5.0,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call'],
            optimalTags: ['pot_control', 'dry_board', 'blockers_factor'],
            trapTags: ['trap_fold_worse'],
            explanation:
              'На сухом спаренном борде 10-10-4 с десяткой в руке мы блокируем продолжение соперника! Если мы сыграем чек-рейз на флопе, баттон мгновенно выбросит все свои блефы (AQ, AJ, KQ, QJ, 98s). Колл заманивает его ставить второй баррель на терне!',
            sizingNote: 'Слоуплей чек-коллом 1.8 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '44', 'A10s'],
            medium: ['99', '88', '77', '66', '55', 'J10s', '109s'],
            draws: ['65s', '76s'],
            bluffs: ['AKo', 'AQo', 'AJo', 'KQo', 'QJo', 'J9s']
          }
        },
        {
          name: 'Терн',
          board: [`10${s2}`, `10${s3}`, `4${s4}`, `7${s1}`],
          potBeforeAction: 9.1,
          effectiveStack: Number((stack - 2.8).toFixed(1)),
          villainLastActionBadge: 'Бет 6.0 ББ',
          actionHistory: [
            {
              street: `Флоп [10${s2} 10${s3} 4${s4}]`,
              text: 'Hero (BB) чек-колл 1.8 ББ (Банк: 9.1 ББ)'
            },
            {
              street: `Терн [7${s1}]`,
              text: 'Hero чек → BTN продолжает агрессию ставкой 6.0 ББ.'
            }
          ],
          villainActionText: `На терне 7${s1} баттон ставит второй баррель 6.0 ББ в твой скрытый трипс!`,
          toCall: 6.0,
          minRaise: 14.5,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call', 'raise'],
            optimalTags: ['pot_control', 'protect_check_range'],
            trapTags: ['fold_behind'],
            explanation:
              'Ловушка сработала: соперник продолжает баррелить! Колл на терне позволяет оставить в раздаче все его блефы, чтобы он поставил третий баррель на ривере (или добрать с его оверпар самим).',
            sizingNote: 'Чек-колл 6.0 ББ (или чек-рейз против оверпар).'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '77', '44', 'A10s'],
            medium: ['99', '88', 'J10s', '109s'],
            draws: [`A${s1}5${s1}`, '98s', '86s'],
            bluffs: ['AKo', 'AQo', 'AJo']
          }
        },
        {
          name: 'Ривер',
          board: [`10${s2}`, `10${s3}`, `4${s4}`, `7${s1}`, `2${s2}`],
          potBeforeAction: 21.1,
          effectiveStack: Number((stack - 8.8).toFixed(1)),
          villainLastActionBadge: 'Бет 15.0 ББ',
          actionHistory: [
            {
              street: `Терн [7${s1}]`,
              text: 'Hero (BB) чек-колл 6.0 ББ (Банк: 21.1 ББ)'
            },
            {
              street: `Ривер [2${s2}]`,
              text: 'Hero чек → BTN ставит третий баррель 15.0 ББ!'
            }
          ],
          villainActionText: `На ривере 2${s2} баттон ставит 15.0 ББ в банк 21.1 ББ. У тебя трипс ${kic}10.`,
          toCall: 15.0,
          minRaise: Number((stack - 8.8).toFixed(1)),
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['raise', 'call'],
            minOptimalSize: Number((stack - 10.8).toFixed(1)),
            maxOptimalSize: Number((stack - 8.8).toFixed(1)),
            optimalTags: ['value_bet'],
            trapTags: ['fold_behind'],
            explanation:
              'На ривере больше нет следующих улиц — пора вскрывать карты и забирать максимум! Чек-пуш на остатки стека получает колл от всех оверпар (JJ–AA) и десяток младше (J10, 109).',
            sizingNote: 'Доборный чек-пуш на ривере!'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '77', '44', 'A10s', 'J10s'],
            medium: ['109s'],
            draws: [],
            bluffs: ['AKo', 'AQo', '98s']
          }
        }
      ]
    };
  },

  // 8. 3-БЕТ БЛЕФ С КОННЕКТОРОМ В ПОЗИЦИИ (BTN vs HJ с 6♠5♠ / 7♣6♣ / 8♦7♦)
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const c = variant % 2 === 0 ? { hi: '6', lo: '5' } : { hi: '8', lo: '7' };
    const heroPos = 'BTN';
    const villainPos = mode === 'headsup' ? 'BB' : 'HJ';
    return {
      focusCategory: 'connectors',
      mode,
      title: `Полярный 3-бет с коннектором: ${c.hi}${s1}${c.lo}${s1} на BTN vs ${villainPos}`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${c.hi}${s1}`, `${c.lo}${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 4.7,
          effectiveStack: stack,
          villainLastActionBadge: 'Рейз 2.2 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `${villainPos} открывается 2.2 ББ → CO пас. Слово за Hero на BTN (позади SB и BB).`
            }
          ],
          villainActionText: `Регуляр на ${villainPos} открыл 2.2 ББ. Твой ход на баттоне с одномастным коннектором ${c.hi}${s1} ${c.lo}${s1}.`,
          toCall: 2.2,
          minRaise: 6.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['raise', 'call'],
            minOptimalSize: 6.2,
            maxOptimalSize: 7.2,
            optimalTags: ['semibluff_equity', 'spr_icm_control'],
            trapTags: [],
            explanation: `Одномастные коннекторы ${c.hi}${s1} ${c.lo}${s1} в позиции входят в сбалансированный спектр 3-бета наряду с премиум-руками: они не блокируют спектр фолда соперника и отлично попадают в доски, где соперник не ждет у 3-беттора монстра (колл 2.2 ББ тоже допустим).`,
            sizingNote: '3-бет в позиции 6.5–7.0 ББ (или колл).'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', 'AKs', 'AQs'],
            medium: ['99', '88', '77', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J10s', '109s', '87s', '76s', '65s'],
            bluffs: ['A10o', 'KQo']
          }
        },
        {
          name: 'Флоп',
          board: [`A${s2}`, `K${s1}`, `4${s1}`],
          potBeforeAction: 16.3,
          effectiveStack: Number((stack - 6.8).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `${villainPos} рейз 2.2 ББ → Hero (BTN) 3-бет 6.8 ББ → ${villainPos} колл (Банк: 16.3 ББ)`
            },
            {
              street: `Флоп [A${s2} K${s1} 4${s1}]`,
              text: `Флоп идеально подходит спектру 3-беттора (A-K-4), плюс у Hero флеш-дро ${s1}! ${villainPos} чекает.`
            }
          ],
          villainActionText: `В 3-бет банке 16.3 ББ выходит доска A${s2} K${s1} 4${s1} (у тебя флеш-дро ${s1}). Соперник чекает.`,
          toCall: 0,
          minBet: 3.5,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 4.0,
            maxOptimalSize: 6.0,
            optimalTags: ['semibluff_equity', 'dry_board'],
            trapTags: ['pot_control'],
            explanation:
              'Доска A-K-4 дает колоссальный перевес нашему диапазону 3-бета (AA, KK, AK). Маленький контбет 25–33% банка (4.5–5.5 ББ) заставляет соперника мгновенно выбросить все карманные пары 77–QQ, а при колле от туза у нас 9 чистых аутов на флеш!',
            sizingNote: 'Мелкий контбет 4.5–5.5 ББ (30% банка).'
          },
          rangeMatrix: {
            value: ['AKo', 'AQs', 'AJs'],
            medium: ['A10s', 'KQs', 'KJs', 'QQ', 'JJ', '1010', '99'],
            draws: [`Q${s1}J${s1}`, `J${s1}10${s1}`],
            bluffs: ['88', '77']
          }
        },
        {
          name: 'Терн',
          board: [`A${s2}`, `K${s1}`, `4${s1}`, `9${s1}`],
          potBeforeAction: 26.3,
          effectiveStack: Number((stack - 11.8).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: `Флоп [A${s2} K${s1} 4${s1}]`,
              text: `${villainPos} чек → Hero (BTN) бет 5.0 ББ → ${villainPos} колл (Банк: 26.3 ББ)`
            },
            {
              street: `Терн [9${s1}]`,
              text: `Закрылся наш флеш на 9${s1}! Соперник чекает.`
            }
          ],
          villainActionText: `На терне 9${s1} закрылся твой флеш! Соперник чекает в банке 26.3 ББ.`,
          toCall: 0,
          minBet: 6.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 7.5,
            maxOptimalSize: 12.0,
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'Мы собрали скрытый флеш в 3-бет банке! Небольшая ставка 33–40% банка (8.5–10 ББ) вынуждает все руки AQ, AJ, A10 соперника заплатить еще одну улицу (особенно если у него туз или дама в масть флеша).',
            sizingNote: 'Добор 8.5–10.5 ББ.'
          },
          rangeMatrix: {
            value: [`Q${s1}J${s1}`, `J${s1}10${s1}`, 'AKo', 'AQs'],
            medium: ['AJs', 'A10s', 'KQs'],
            draws: [`A${s1}Q${s3}`, `A${s1}J${s3}`],
            bluffs: []
          }
        },
        {
          name: 'Ривер',
          board: [`A${s2}`, `K${s1}`, `4${s1}`, `9${s1}`, `2${s4}`],
          potBeforeAction: 44.3,
          effectiveStack: Math.max(8, Number((stack - 20.8).toFixed(1))),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: `Терн [9${s1}]`,
              text: `${villainPos} чек → Hero (BTN) бет 9.0 ББ → ${villainPos} колл (Банк: 44.3 ББ)`
            },
            {
              street: `Ривер [2${s4}]`,
              text: 'Бланк 2 на ривере. Соперник чекает.'
            }
          ],
          villainActionText: `На ривере 2${s4} у тебя готовый флеш. Соперник чекает, в твоем стеке ${fmtBB(
            Math.max(8, stack - 20.8)
          )} ББ.`,
          toCall: 0,
          minBet: 6.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: Math.max(6, Number((stack - 22.8).toFixed(1))),
            maxOptimalSize: Math.max(8, Number((stack - 20.8).toFixed(1))),
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation:
              'К риверу в стеке осталось меньше трети банка (SPR ~ 0.35). Спокойно допихиваем олл-ин и получаем колл от привязанных к банку AK, AQ и AJ.',
            sizingNote: 'Доборный олл-ин на ривере.'
          },
          rangeMatrix: {
            value: ['AKo', 'AQs', 'AJs'],
            medium: ['A10s'],
            draws: [],
            bluffs: []
          }
        }
      ]
    };
  },

  // 9. ПРЕВРАЩЕНИЕ ПАРЫ В БЛЕФ НА РИВЕРЕ (BB vs CO с 8♠7♠ / 9♥8♥ — блокеры на стрит)
  ({ s1, s2, s3, s4, stack, mode }) => {
    const heroPos = 'BB';
    const villainPos = mode === 'headsup' ? 'BTN' : 'CO';
    return {
      focusCategory: 'bluff_oop',
      mode,
      title: `Превращение пары в блеф: 8${s1}7${s1} на BB vs ${villainPos} (Блокеры на ривере)`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`8${s1}`, `7${s1}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 4.7,
          effectiveStack: stack,
          villainLastActionBadge: 'Рейз 2.2 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `${villainPos} открывает 2.2 ББ → BTN и SB пас. Слово за Hero на BB.`
            }
          ],
          villainActionText: `${villainPos} открылся 2.2 ББ. Твой ход на BB с одномастным коннектором 8${s1} 7${s1}.`,
          toCall: 1.2,
          minRaise: 6.0,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call', 'raise'],
            optimalTags: ['protect_check_range', 'semibluff_equity'],
            trapTags: ['fold_behind'],
            explanation:
              'Одномастные коннекторы 87s — обязательная защита Большого Блайнда коллом 1.2 ББ по отличным шансам банка.',
            sizingNote: 'Колл 1.2 ББ на BB.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AQs'],
            medium: ['88', '77', '66', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J10s', '109s', '98s', '87s', '76s'],
            bluffs: ['K10o', 'Q10o']
          }
        },
        {
          name: 'Флоп',
          board: [`9${s2}`, `7${s3}`, `2${s1}`],
          potBeforeAction: 5.9,
          effectiveStack: Number((stack - 1.2).toFixed(1)),
          villainLastActionBadge: 'Бет 2.0 ББ',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `${villainPos} рейз 2.2 ББ → Hero (BB) колл (Банк: 5.9 ББ)`
            },
            {
              street: `Флоп [9${s2} 7${s3} 2${s1}]`,
              text: `Hero чек → ${villainPos} ставит 2.0 ББ. У Hero вторая пара (7) + гатшот + бэкдорное ФД.`
            }
          ],
          villainActionText: `На флопе 9${s2} 7${s3} 2${s1} соперник ставит 2.0 ББ. У тебя пара семерок + бэкдоры.`,
          toCall: 2.0,
          minRaise: 5.5,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call', 'raise'],
            optimalTags: ['pot_control', 'protect_check_range'],
            trapTags: ['fold_behind'],
            explanation:
              'Со второй парой и бэкдорными стрит- и флеш-дро мы спокойно играем чек-колл: мы бьем все оверкарты соперника и имеем массу карт терна, усиливающих наше эквити.',
            sizingNote: 'Чек-колл 2.0 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '77'],
            medium: ['A9s', 'K9s', 'Q9s', 'J9s', '109s', '88'],
            draws: ['J10s', 'Q10s', '86s', '65s'],
            bluffs: ['AKo', 'AQo', 'KQo', 'KJo']
          }
        },
        {
          name: 'Терн',
          board: [`9${s2}`, `7${s3}`, `2${s1}`, `6${s4}`],
          potBeforeAction: 9.9,
          effectiveStack: Number((stack - 3.2).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Флоп [9${s2} 7${s3} 2${s1}]`,
              text: 'Hero (BB) чек-колл 2.0 ББ (Банк: 9.9 ББ)'
            },
            {
              street: `Терн [6${s4}]`,
              text: 'Выходит 6 — теперь у Hero пара семерок + двустороннее стрит-дро (на 5 и 10)! Первое слово за Hero.'
            }
          ],
          villainActionText: `На терне 6${s4} к твоей паре семерок добавилась двусторонка (8 аутов на стрит). Первое слово за тобой.`,
          toCall: 0,
          minBet: 3.0,
          gtoAction: {
            type: 'check',
            acceptableTypes: ['check', 'bet'],
            optimalTags: ['pot_control', 'protect_check_range'],
            trapTags: ['fold_behind'],
            explanation:
              'У нас пара плюс двустороннее стрит-дро (13 аутов против топ-пары 9x!). Чек позволяет удержать в банке блефы соперника или дешево увидеть ривер.',
            sizingNote: 'Чек без позиции.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '77', '66', '108s', '85s'],
            medium: ['A9s', 'K9s', 'Q9s', '109s', '88'],
            draws: ['J10s', 'Q10s'],
            bluffs: ['AKo', 'AQo', 'KQo']
          }
        },
        {
          name: 'Ривер',
          board: [`9${s2}`, `7${s3}`, `2${s1}`, `6${s4}`, `K${s2}`],
          potBeforeAction: 9.9,
          effectiveStack: Number((stack - 3.2).toFixed(1)),
          isHeroFirstPostflop: true,
          villainLastActionBadge: 'В позиции • Ждет хода',
          actionHistory: [
            {
              street: `Терн [6${s4}]`,
              text: `Hero (BB) чек → ${villainPos} чек вдогонку (спектр соперника капнут до средних рук)`
            },
            {
              street: `Ривер [K${s2}]`,
              text: 'Стрит не закрылся. Первое слово за Hero на ривере.'
            }
          ],
          villainActionText: `Соперник прочекал терн вдогонку. На ривере K${s2} у тебя слабая третья пара семерок, но блокеры 8-7 на стрит и две пары.`,
          toCall: 0,
          minBet: 3.0,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet', 'check'],
            minOptimalSize: 6.5,
            maxOptimalSize: 8.5,
            optimalTags: ['blockers_factor', 'semibluff_equity'],
            trapTags: [],
            explanation:
              'Прочекав терн вдогонку, соперник выдал слабость: у него часто средние руки (88, 9x, A7, QJ). Наша пара семерок редко выиграет на чек-шоудауне у 88/9x, зато 8 и 7 в нашей руке блокируют стриты 10-8 и 8-5! Плотная ставка 75% банка (7.5 ББ) превращает слабую пару в идеальный блеф и выбивает все 88, 9x и QJ.',
            sizingNote: 'Превращение в блеф ставкой 7.0–8.0 ББ (или чек).'
          },
          rangeMatrix: {
            value: ['K9s', 'AKo', 'KQo'],
            medium: ['A9s', 'Q9s', '109s', '88', 'A7s'],
            draws: [],
            bluffs: ['QJo', 'J10s']
          }
        }
      ]
    };
  },

  // 10. СТАРШАЯ КАРМАННАЯ ПАРА 10-10 / JJ НА ОПАСНОМ БОРДЕ (HJ vs BB — Пот-контроль)
  ({ s1, s2, s3, s4, stack, mode, variant }) => {
    const pRank = variant % 2 === 0 ? 'J' : '10';
    const heroPos = mode === 'headsup' ? 'BTN' : 'HJ';
    const villainPos = 'BB';
    return {
      focusCategory: 'pairs_broadway',
      mode,
      title: `Старшая пара ${pRank}${s1}${pRank}${s2} на ${heroPos}: Контроль банка по выходу оверкарты`,
      blindsInfo: `${mode === 'headsup' ? 'Хэдз-ап' : '8-Max'} • Анте 1 ББ • Эфф. стек ${stack} ББ`,
      effectiveStackStart: stack,
      heroPos,
      villainPos,
      heroCards: [`${pRank}${s1}`, `${pRank}${s2}`],
      streets: [
        {
          name: 'Префлоп',
          board: [],
          potBeforeAction: 2.5,
          effectiveStack: stack,
          isPreflopRFI: true,
          villainLastActionBadge: 'ББ 1 ББ • Ждет хода',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `Игроки до ${heroPos} сбросили. Слово за Hero с карманной парой ${pRank}${s1} ${pRank}${s2}.`
            }
          ],
          villainActionText: `До тебя все сбросили. У тебя сильная карманная пара ${pRank}${s1} ${pRank}${s2} на позиции ${heroPos}.`,
          toCall: 1.0,
          minBet: 2.0,
          minRaise: 2.0,
          gtoAction: {
            type: 'raise',
            acceptableTypes: ['bet', 'raise'],
            minOptimalSize: 2.0,
            maxOptimalSize: 2.5,
            optimalTags: ['value_bet'],
            trapTags: ['fold_behind'],
            explanation: `С парой ${pRank}${pRank} мы всегда открываемся стандартным рейзом 2.2 ББ на вэлью.`,
            sizingNote: 'Опен-рейз 2.2 ББ.'
          },
          rangeMatrix: {
            value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AQs'],
            medium: ['88', '77', '66', 'AJs', 'KQs', 'KJs', 'QJs'],
            draws: ['J10s', '109s', '98s'],
            bluffs: ['A10o', 'KQo']
          }
        },
        {
          name: 'Флоп',
          board: [`9${s1}`, `6${s3}`, `3${s4}`],
          potBeforeAction: 5.9,
          effectiveStack: Number((stack - 2.2).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: 'Префлоп',
              text: `Hero (${heroPos}) рейз 2.2 ББ → BB коллирует (Банк: 5.9 ББ)`
            },
            {
              street: `Флоп [9${s1} 6${s3} 3${s4}]`,
              text: `Низкий борд. BB чекает. У Hero оверпара ${pRank}${pRank}, уязвимая к оверкартам Q, K, A.`
            }
          ],
          villainActionText: `На флопе 9${s1} 6${s3} 3${s4} соперник на BB чекает. У тебя уязвимая оверпара ${pRank}${pRank}.`,
          toCall: 0,
          minBet: 1.8,
          gtoAction: {
            type: 'bet',
            acceptableTypes: ['bet'],
            minOptimalSize: 3.0,
            maxOptimalSize: 4.5,
            optimalTags: ['value_bet', 'spr_icm_control'],
            trapTags: ['pot_control'],
            explanation: `Оверпара ${pRank}${pRank} сейчас далеко впереди спектра BB, но любая Q, K или A на терне испортит нам доску. Поэтому на флопе 9-6-3 мы ставим плотный контбет 55–70% банка (3.5–4.0 ББ), добирая с 9x, 6x, 77, 88 и 87s, пока мы старше!`,
            sizingNote: 'Плотный контбет 3.5–4.0 ББ для добора и защиты.'
          },
          rangeMatrix: {
            value: ['99', '66', '33', '96s'],
            medium: ['A9o', 'K9s', 'Q9s', 'J9s', '109s', '88', '77', 'A6s'],
            draws: ['87s', '75s', '65s', '54s'],
            bluffs: ['KQo', 'QJo', 'A4s']
          }
        },
        {
          name: 'Терн',
          board: [`9${s1}`, `6${s3}`, `3${s4}`, `K${s2}`],
          potBeforeAction: 13.5,
          effectiveStack: Number((stack - 6.0).toFixed(1)),
          villainLastActionBadge: 'Чек',
          actionHistory: [
            {
              street: `Флоп [9${s1} 6${s3} 3${s4}]`,
              text: `BB чек → Hero (${heroPos}) бет 3.8 ББ → BB колл (Банк: 13.5 ББ)`
            },
            {
              street: `Терн [K${s2}]`,
              text: 'На терне выходит оверкарта K. BB чекает.'
            }
          ],
          villainActionText: `На терне выходит оверкарта K${s2}. BB чекает в банке 13.5 ББ.`,
          toCall: 0,
          minBet: 4.0,
          gtoAction: {
            type: 'check',
            acceptableTypes: ['check'],
            optimalTags: ['pot_control', 'dry_board'],
            trapTags: ['trap_fold_worse'],
            explanation: `С выходом короля наша рука превратилась во вторую пару. Ставить второй баррель с ${pRank}${pRank} нельзя: мы выбьем слабые карманки и стрит-дро, но заплатим всем K9s, K6s и флоатам с королем. Чекаем вдогонку для пот-контроля!`,
            sizingNote: 'Чек вдогонку для контроля банка.'
          },
          rangeMatrix: {
            value: ['99', '66', '33', 'K9s', 'K6s'],
            medium: ['A9o', 'Q9s', 'J9s', '109s', '88', '77'],
            draws: ['87s', '75s', '54s'],
            bluffs: ['QJo']
          }
        },
        {
          name: 'Ривер',
          board: [`9${s1}`, `6${s3}`, `3${s4}`, `K${s2}`, `2${s1}`],
          potBeforeAction: 13.5,
          effectiveStack: Number((stack - 6.0).toFixed(1)),
          villainLastActionBadge: 'Бет 6.0 ББ',
          actionHistory: [
            {
              street: `Терн [K${s2}]`,
              text: `BB чек → Hero (${heroPos}) чек вдогонку (Банк: 13.5 ББ)`
            },
            {
              street: `Ривер [2${s1}]`,
              text: 'На ривере промазали все стрит-дро (87, 75, 54). BB ставит 6.0 ББ (44% банка).'
            }
          ],
          villainActionText: `На ривере 2${s1} все стрит-дро промазали, и BB ставит 6.0 ББ в банк 13.5 ББ.`,
          toCall: 6.0,
          minRaise: 15.0,
          gtoAction: {
            type: 'call',
            acceptableTypes: ['call'],
            optimalTags: ['protect_check_range', 'pot_control'],
            trapTags: ['fold_behind'],
            explanation: `Наш чек на терне спровоцировал соперника! На ривере промазали все его стрит-дро (87s, 75s, 65s, 54s), плюс он может тонко ставить с 9x (A9, Q9, 109), думая, что у нас AK/AQ без пары. Против сайзинга 44% банка с ${pRank}${pRank} легкий блеф-кетч колл!`,
            sizingNote: 'Колл 6.0 ББ.'
          },
          rangeMatrix: {
            value: ['99', '66', 'K9s'],
            medium: ['A9o', 'Q9s', '109s', '88', '77'],
            draws: [],
            bluffs: ['87s', '75s', '65s', '54s', 'QJo']
          }
        }
      ]
    };
  }
];

function generateInstantProceduralScenario(targetMode = 'chipev_8max', focusFilter = 'all') {
  const suits = ['♠', '♥', '♦', '♣'];
  for (let i = suits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [suits[i], suits[j]] = [suits[j], suits[i]];
  }

  const stacks = [26, 30, 35, 38, 42, 48];
  const stack = stacks[Math.floor(Math.random() * stacks.length)];

  // Читаем список недавно сыгранных шаблонов, чтобы не повторяться
  let recentIndices = [];
  try {
    recentIndices = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECENT_ARCHETYPES) || '[]');
  } catch {
    recentIndices = [];
  }

  const candidateIndices = PROCEDURAL_BLUEPRINTS.map((_, idx) => idx).filter(idx => {
    if (focusFilter === 'all') return true;
    const sample = PROCEDURAL_BLUEPRINTS[idx]({
      s1: '♠',
      s2: '♥',
      s3: '♦',
      s4: '♣',
      stack: 35,
      mode: targetMode,
      variant: 0
    });
    return sample.focusCategory === focusFilter;
  });

  const nonRecent = candidateIndices.filter(idx => !recentIndices.includes(idx));
  const poolToPick = nonRecent.length > 0 ? nonRecent : candidateIndices;
  const chosenIdx = poolToPick[Math.floor(Math.random() * poolToPick.length)];

  const updatedRecent = [chosenIdx, ...recentIndices.filter(i => i !== chosenIdx)].slice(0, 6);
  try {
    localStorage.setItem(STORAGE_KEYS.RECENT_ARCHETYPES, JSON.stringify(updatedRecent));
  } catch {
    // ignore
  }

  const variant = Math.floor(Math.random() * 12);
  const raw = PROCEDURAL_BLUEPRINTS[chosenIdx]({
    s1: suits[0],
    s2: suits[1],
    s3: suits[2],
    s4: suits[3],
    stack,
    mode: targetMode,
    variant
  });

  const newId = `proc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  return {
    ...raw,
    id: newId
  };
}

// ============================================================================
// САНИТАЙЗЕР ИИ-СЦЕНАРИЯ (ИСПРАВЛЯЕТ МАСТИ 'Ah'->'A♥', БАНК 1.5->2.5 ББ И ПОЗИЦИИ)
// ============================================================================

function sanitizeAiGeneratedScenario(rawScenario, fallbackMode, forcedSeed) {
  const mode = rawScenario.mode || fallbackMode || 'chipev_8max';
  const heroPos = normalizePokerPosition(
    rawScenario.heroPos || forcedSeed.heroPos,
    mode,
    forcedSeed.heroPos
  );
  let villainPos = normalizePokerPosition(
    rawScenario.villainPos || forcedSeed.villainPos,
    mode,
    forcedSeed.villainPos
  );
  if (villainPos === heroPos) {
    villainPos = heroPos === 'BB' ? 'BTN' : 'BB';
  }

  const rawHeroCards =
    Array.isArray(rawScenario.heroCards) && rawScenario.heroCards.length === 2
      ? rawScenario.heroCards
      : forcedSeed.heroCards;
  const heroCards = rawHeroCards.map(normalizeCardString);

  const stackStart = Number(rawScenario.effectiveStackStart) || forcedSeed.stack || 35;

  const streets = (rawScenario.streets || []).slice(0, 4).map((st, idx) => {
    const streetNames = ['Префлоп', 'Флоп', 'Терн', 'Ривер'];
    const board =
      idx === 0
        ? []
        : Array.isArray(st.board)
        ? st.board.map(normalizeCardString)
        : [];

    const isPreflop = idx === 0;
    const heroPreflopIdx = POKER_POSITIONS_8MAX.indexOf(heroPos);
    const villainPreflopIdx = POKER_POSITIONS_8MAX.indexOf(villainPos);
    const isPreflopRFI = Boolean(
      isPreflop && (st.isPreflopRFI || heroPreflopIdx < villainPreflopIdx)
    );

    // Если это открытие на префлопе, банк ДО хода всегда 2.5 ББ (0.5 МБ + 1 ББ + 1 анте)
    let potBeforeAction = Number(st.potBeforeAction) || 2.5;
    if (isPreflop && isPreflopRFI) {
      potBeforeAction = 2.5;
    }

    let toCall = Number(st.toCall) || 0;
    if (isPreflop && isPreflopRFI) {
      toCall = heroPos === 'SB' ? 0.5 : 1.0;
    }

    const gtoRaw = st.gtoAction || {};
    let gtoType = (gtoRaw.type || 'bet').toLowerCase();
    if (isPreflop && isPreflopRFI && gtoType === 'bet') {
      gtoType = 'raise';
    }

    return {
      ...st,
      name: streetNames[idx] || st.name || 'Улица',
      board,
      potBeforeAction,
      effectiveStack: Number(st.effectiveStack) || stackStart,
      isPreflopRFI,
      toCall,
      minBet: Number(st.minBet) || 2.0,
      minRaise: Number(st.minRaise) || 2.2,
      villainActionText: sanitizeTextCardNotations(
        st.villainActionText ||
          (isPreflopRFI
            ? `До тебя все сбросили. Твое слово на ${heroPos} с рукой ${heroCards.join(' ')}.`
            : 'Твое слово.')
      ),
      actionHistory: (st.actionHistory || []).map(h => ({
        street: sanitizeTextCardNotations(h.street || streetNames[idx]),
        text: sanitizeTextCardNotations(h.text || '')
      })),
      gtoAction: {
        type: gtoType,
        acceptableTypes: Array.isArray(gtoRaw.acceptableTypes)
          ? gtoRaw.acceptableTypes
          : [gtoType],
        minOptimalSize: Number(gtoRaw.minOptimalSize) || (isPreflopRFI ? 2.0 : 2.5),
        maxOptimalSize: Number(gtoRaw.maxOptimalSize) || (isPreflopRFI ? 2.5 : 6.0),
        optimalTags:
          Array.isArray(gtoRaw.optimalTags) && gtoRaw.optimalTags.length > 0
            ? gtoRaw.optimalTags
            : ['value_bet', 'semibluff_equity'],
        trapTags: Array.isArray(gtoRaw.trapTags) ? gtoRaw.trapTags : [],
        explanation: sanitizeTextCardNotations(
          gtoRaw.explanation || 'Решение основано на балансе спектра и геометрии банка.'
        ),
        sizingNote: sanitizeTextCardNotations(gtoRaw.sizingNote || 'Оптимальный сайзинг по GTO.')
      },
      rangeMatrix: st.rangeMatrix || {
        value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99'],
        medium: ['88', '77', '66', 'KQs', 'QJs'],
        draws: ['J10s', '109s', '98s', '87s'],
        bluffs: ['K10o', 'Q10o']
      }
    };
  });

  return {
    id: `ai_${Date.now()}`,
    mode,
    title: sanitizeTextCardNotations(rawScenario.title || forcedSeed.themeTitle),
    blindsInfo:
      rawScenario.blindsInfo || `8-Max • Анте 1 ББ • Эфф. стек ${stackStart} ББ`,
    effectiveStackStart: stackStart,
    heroPos,
    villainPos,
    heroCards,
    streets
  };
}

// ============================================================================
// УНИВЕРСАЛЬНЫЙ ВЫЗОВ GEMINI API (ПОДДЕРЖКА AQ. И AIzaSy + ТАЙМ-АУТ 8 СЕК)
// ============================================================================

async function callGeminiWithFallback({ apiKey, payload, timeoutMs = 8500 }) {
  const cleanKey = (apiKey || '').trim();
  const isVertexExpress = cleanKey.startsWith('AQ.');

  // Если ключ внешний (указан пользователем), пробуем быстрые публичные модели, иначе — системную модель среды
  const modelsToTry = cleanKey
    ? ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-flash-preview']
    : ['gemini-3-flash-preview'];

  let lastError = null;

  for (const modelName of modelsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = isVertexExpress
        ? `https://aiplatform.googleapis.com/v1/publishers/google/models/${modelName}:generateContent?key=${encodeURIComponent(
            cleanKey
          )}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(
            cleanKey
          )}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timer);

      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text;
      }
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }
  }

  throw lastError || new Error('Timeout or API Error');
}

// ============================================================================
// КЛАССИЧЕСКАЯ БЕЛАЯ КАРТА ПОКЕР-РУМА (4-ЦВЕТНАЯ КОЛОДА, ЧЕТКИЕ ИНДЕКСЫ)
// ============================================================================

function parseCard(cardStr) {
  const normalized = normalizeCardString(cardStr);
  const suit = normalized.slice(-1);
  const rank = normalized.slice(0, -1);
  return { rank, suit };
}

function PokerCard({ cardStr, size = 'md' }) {
  const { rank, suit } = parseCard(cardStr);

  const suitColor =
    suit === '♥'
      ? 'text-red-600'
      : suit === '♦'
      ? 'text-blue-600'
      : suit === '♣'
      ? 'text-emerald-700'
      : 'text-slate-900';

  const sizeClass =
    size === 'sm'
      ? 'w-10 h-14 text-xs rounded-md'
      : size === 'lg'
      ? 'w-14 h-20 sm:w-16 sm:h-22 text-base rounded-lg'
      : 'w-12 h-17 sm:w-14 sm:h-20 text-sm rounded-lg';

  return (
    <div
      className={`${sizeClass} bg-white border border-slate-300 shadow-md flex flex-col justify-between p-1.5 select-none font-bold ${suitColor}`}
    >
      <div className="leading-none text-left tracking-tighter font-extrabold">{rank}</div>
      <div className="text-center text-lg sm:text-xl leading-none">{suit}</div>
      <div className="leading-none text-right tracking-tighter font-extrabold rotate-180">
        {rank}
      </div>
    </div>
  );
}

function CardBackPair() {
  return (
    <div className="flex -space-x-2">
      <div className="w-7 h-10 rounded bg-gradient-to-br from-rose-700 to-rose-900 border border-rose-400/60 shadow-sm flex items-center justify-center">
        <div className="w-4 h-7 rounded-sm border border-rose-300/30 bg-rose-800/40" />
      </div>
      <div className="w-7 h-10 rounded bg-gradient-to-br from-rose-700 to-rose-900 border border-rose-400/60 shadow-sm flex items-center justify-center">
        <div className="w-4 h-7 rounded-sm border border-rose-300/30 bg-rose-800/40" />
      </div>
    </div>
  );
}

// ============================================================================
// СТРОГИЙ РАСЧЕТ РАССАДКИ И ОЧЕРЕДНОСТИ СЛОВА ИГРОКОВ ВОКРУГ СТОЛА
// ============================================================================

function buildOrderedTableSeats(scenario, currentStreet) {
  const safeHeroPos = normalizePokerPosition(
    scenario.heroPos,
    scenario.mode,
    scenario.mode === 'headsup' ? 'BTN' : 'BTN'
  );
  let safeVillainPos = normalizePokerPosition(
    scenario.villainPos,
    scenario.mode,
    scenario.mode === 'headsup' ? 'BB' : 'BB'
  );
  if (safeVillainPos === safeHeroPos) {
    safeVillainPos = safeHeroPos === 'BB' ? 'BTN' : 'BB';
  }

  const isPreflop = !currentStreet.board || currentStreet.board.length === 0;
  const heroPreflopIdx = POKER_POSITIONS_8MAX.indexOf(safeHeroPos);
  const villainPreflopIdx = POKER_POSITIONS_8MAX.indexOf(safeVillainPos);

  // Определяем, открывает ли Hero торги на префлопе первым (RFI)
  const isHeroOpeningPreflopFirst =
    isPreflop &&
    (currentStreet.isPreflopRFI || heroPreflopIdx < villainPreflopIdx);

  // Определяем, ходит ли Hero первым на текущей улице постфлопа
  const isHeroFirstNowPostflop =
    !isPreflop &&
    currentStreet.toCall === 0 &&
    (currentStreet.isHeroFirstPostflop ||
      isHeroFirstPostflop(safeHeroPos, safeVillainPos, scenario.mode));

  // Вычисляем корректную плашку над Оппонентом (чтобы ББ НИКОГДА не показывал "Чек" до слова CO!)
  let computedVillainBadge = currentStreet.villainLastActionBadge || '';
  if (isHeroOpeningPreflopFirst) {
    computedVillainBadge =
      safeVillainPos === 'BB'
        ? 'ББ 1 ББ • Ждет хода'
        : safeVillainPos === 'SB'
        ? 'МБ 0.5 ББ • Ждет хода'
        : 'Ждет твоего хода';
  } else if (isHeroFirstNowPostflop) {
    computedVillainBadge = 'В позиции • Ждет хода';
  } else if (!computedVillainBadge || /чек/i.test(computedVillainBadge)) {
    if (isPreflop && currentStreet.toCall > 0) {
      computedVillainBadge = `Рейз ${fmtBB(
        safeHeroPos === 'BB' ? currentStreet.toCall + 1 : currentStreet.toCall
      )} ББ`;
    } else if (!isPreflop && currentStreet.toCall > 0) {
      computedVillainBadge = `Бет ${fmtBB(currentStreet.toCall)} ББ`;
    } else {
      computedVillainBadge = 'Чек';
    }
  }

  if (scenario.mode === 'headsup' || scenario.seats?.length === 2) {
    return [
      {
        pos: safeHeroPos,
        stack: scenario.effectiveStackStart || 40,
        isHero: true,
        isVillain: false,
        layout: SEAT_SLOTS_8MAX[0]
      },
      {
        pos: safeVillainPos,
        stack: scenario.effectiveStackStart || 40,
        isHero: false,
        isVillain: true,
        computedBadge: computedVillainBadge,
        layout: SEAT_SLOTS_8MAX[4]
      }
    ];
  }

  const rawSeats = scenario.seats || [];

  return POKER_POSITIONS_8MAX.map((_, offset) => {
    const posName = POKER_POSITIONS_8MAX[(heroPreflopIdx + offset) % 8];
    const seatOrderIdx = POKER_POSITIONS_8MAX.indexOf(posName);
    const found = rawSeats.find(
      s => normalizePokerPosition(s.pos, scenario.mode, posName) === posName
    ) || {
      pos: posName,
      stack: scenario.effectiveStackStart || 35
    };

    const isHeroSeat = offset === 0;
    const isVillainSeat = !isHeroSeat && posName === safeVillainPos;

    // Статус для остальных 6 мест за столом (с учетом очередности префлопа!)
    let statusLabel = 'ПАС';
    let isWaitingToAct = false;

    if (found.isShortStack) {
      statusLabel = 'Шорт-стек (ICM)';
    } else if (isPreflop) {
      if (isHeroOpeningPreflopFirst) {
        // Игроки до Героя сбросили, а игроки ПОСЛЕ Героя еще ждут своего слова!
        if (seatOrderIdx > heroPreflopIdx) {
          isWaitingToAct = true;
          statusLabel =
            posName === 'SB'
              ? 'МБ 0.5 ББ • Ждет'
              : posName === 'BB'
              ? 'ББ 1 ББ • Ждет'
              : 'Ждет хода';
        }
      } else if (seatOrderIdx > heroPreflopIdx && seatOrderIdx > villainPreflopIdx) {
        // Оппонент открылся до Героя, но позади Героя еще сидят блайнды
        isWaitingToAct = true;
        statusLabel =
          posName === 'SB'
            ? 'МБ 0.5 ББ • Ждет'
            : posName === 'BB'
            ? 'ББ 1 ББ • Ждет'
            : 'Ждет хода';
      }
    }

    return {
      ...found,
      pos: isHeroSeat ? safeHeroPos : posName,
      isHero: isHeroSeat,
      isVillain: isVillainSeat,
      computedBadge: isVillainSeat ? computedVillainBadge : null,
      statusLabel,
      isWaitingToAct,
      layout: SEAT_SLOTS_8MAX[offset]
    };
  });
}

// ============================================================================
// ОЦЕНКА ХОДА ИГРОКА (70% МАТЕМАТИКА / 30% ЛОГИКА + ОЦЕНКА ЛИМПА)
// ============================================================================

function evaluateDecision(street, chosenAction, chosenSize, selectedTags) {
  const gto = street.gtoAction;
  const feedback = [];
  let mathScore = 0;

  const isMatchedAction =
    chosenAction === gto.type ||
    (street.isPreflopRFI &&
      (chosenAction === 'bet' || chosenAction === 'raise') &&
      (gto.type === 'bet' || gto.type === 'raise'));

  if (isMatchedAction) {
    mathScore = 7.0;
    if (chosenAction === 'bet' || chosenAction === 'raise') {
      const minOpt = gto.minOptimalSize ?? 0;
      const maxOpt = gto.maxOptimalSize ?? street.effectiveStack;
      if (chosenSize >= minOpt - 0.25 && chosenSize <= maxOpt + 0.25) {
        feedback.push({
          type: 'positive',
          title: 'Точный выбор действия и сайзинга',
          text: `Размер ${fmtBB(chosenSize)} ББ идеально соответствует GTO (${
            gto.sizingNote || ''
          }).`
        });
      } else {
        mathScore = 4.5;
        feedback.push({
          type: 'warning',
          title: 'Неточный размер ставки',
          text: `Само решение верное, но размер ${fmtBB(
            chosenSize
          )} ББ отклоняется от оптимального коридора (${fmtBB(minOpt)}–${fmtBB(maxOpt)} ББ).`
        });
      }
    } else {
      feedback.push({
        type: 'positive',
        title: 'Эталонное действие по GTO',
        text: `Ты выбрал верное решение (${chosenAction.toUpperCase()}). ${gto.sizingNote || ''}`
      });
    }
  } else if (gto.acceptableTypes?.includes(chosenAction)) {
    mathScore = 5.5;
    feedback.push({
      type: 'warning',
      title: 'Допустимая альтернативная линия',
      text: `Основная частота солвера — ${gto.type.toUpperCase()}, но твой вариант тоже присутствует в миксе.`
    });
  } else if (street.isPreflopRFI && chosenAction === 'call') {
    // Специальный разбор ситуации, когда игрок вошел в банк Опен-Лимпом (Колл 1 ББ)
    mathScore = 2.5;
    feedback.push({
      type: 'error',
      title: 'Пассивный вход Опен-Лимпом (Потеря EV)',
      text: 'Вход коллом 1 ББ (опен-лимп) на свободной позиции уступает опен-рейзу 2.2 ББ: ты лишаешь себя фолд-эквити (не можешь забрать 2.5 ББ сразу), приглашаешь игроков позади к изолейту и даешь Большому Блайнду бесплатный флоп.'
    });
  } else {
    mathScore = 1.0;
    feedback.push({
      type: 'error',
      title: 'Математическая ошибка (Потеря EV)',
      text: `Ты нажал ${chosenAction.toUpperCase()}, тогда как по GTO правильное действие — ${gto.type.toUpperCase()} (${
        gto.sizingNote || ''
      }).`
    });
  }

  const optimalTags = gto.optimalTags || [];
  const trapTags = gto.trapTags || [];
  const hitOptimal = selectedTags.filter(t => optimalTags.includes(t));
  const hitTraps = selectedTags.filter(t => trapTags.includes(t) || t.startsWith('trap_'));

  let logicScore = 0;
  if (selectedTags.length === 0) {
    logicScore = 0.5;
    feedback.push({
      type: 'warning',
      title: 'Не отмечена причина хода',
      text: 'Обязательно выбирай 1–2 тега причины перед нажатием кнопки действия, чтобы фиксировать логику.'
    });
  } else {
    const ratio =
      optimalTags.length > 0
        ? Math.min(1, hitOptimal.length / Math.min(2, optimalTags.length))
        : 1;
    logicScore = Math.round(ratio * 3.0 * 10) / 10;

    if (hitTraps.length > 0) {
      logicScore = Math.max(0, logicScore - 2.0);
      hitTraps.forEach(trapId => {
        const tagObj = LOGIC_TAGS.find(t => t.id === trapId);
        if (tagObj) {
          feedback.push({
            type: 'error',
            title: `Логическая ловушка: «${tagObj.label}»`,
            text: tagObj.desc
          });
        }
      });
    } else if (hitOptimal.length > 0) {
      feedback.push({
        type: 'positive',
        title: 'Системное понимание ситуации',
        text: `Верно выделены факторы: ${hitOptimal
          .map(id => LOGIC_TAGS.find(t => t.id === id)?.label)
          .filter(Boolean)
          .join(', ')}.`
      });
    }
  }

  const totalScore = Math.min(10, Math.max(1, Math.round((mathScore + logicScore) * 10) / 10));

  return {
    totalScore,
    mathScore,
    logicScore,
    chosenAction,
    chosenSize,
    selectedTags,
    feedback,
    gtoExplanation: gto.explanation,
    sizingNote: gto.sizingNote
  };
}

// ============================================================================
// МОДАЛЬНОЕ ОКНО: МАТРИЦА ДИАПАЗОНА ОППОНЕНТА 13x13
// ============================================================================

function RangeMatrixModal({ isOpen, onClose, rangeMatrix, villainPos }) {
  if (!isOpen) return null;

  const valueSet = new Set(rangeMatrix?.value || []);
  const mediumSet = new Set(rangeMatrix?.medium || []);
  const drawsSet = new Set(rangeMatrix?.draws || []);
  const bluffsSet = new Set(rangeMatrix?.bluffs || []);

  const getHandLabel = (rIdx, cIdx) => {
    const r1 = RANKS[rIdx];
    const r2 = RANKS[cIdx];
    if (rIdx === cIdx) return `${r1}${r2}`;
    if (rIdx < cIdx) return `${r1}${r2}s`;
    return `${r2}${r1}o`;
  };

  const getCellColor = hand => {
    if (valueSet.has(hand)) return 'bg-rose-600 text-white font-bold border-rose-400';
    if (mediumSet.has(hand)) return 'bg-amber-500/80 text-slate-950 font-semibold border-amber-300';
    if (drawsSet.has(hand)) return 'bg-sky-600 text-white font-semibold border-sky-400';
    if (bluffsSet.has(hand)) return 'bg-purple-600/80 text-white border-purple-400';
    return 'bg-slate-800/70 text-slate-500 border-slate-700/50';
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-4 shadow-2xl">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Grid className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              Матрица диапазона ({villainPos})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-3 mb-3 text-xs">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-rose-600 inline-block" /> Сильное вэлью
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Средние руки / ШДВ
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-sky-600 inline-block" /> Дро (Полублеф)
          </span>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-3 h-3 rounded-sm bg-purple-600 inline-block" /> Блефы / Воздух
          </span>
        </div>

        <div
          className="grid gap-0.5 select-none"
          style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}
        >
          {RANKS.map((_, rIdx) =>
            RANKS.map((__, cIdx) => {
              const label = getHandLabel(rIdx, cIdx);
              return (
                <div
                  key={label}
                  className={`aspect-square flex items-center justify-center text-[9px] sm:text-[10px] rounded-[3px] border ${getCellColor(
                    label
                  )}`}
                >
                  {label}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ОСНОВНОЙ КОМПОНЕНТ ТРЕНАЖЕРА
// ============================================================================

export default function App() {
  // 1. Загрузка сохраненных сгенерированных раздач из localStorage
  const [customScenarios, setCustomScenarios] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_SCENARIOS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 2. Загрузка сохраненного журнала истории и ошибок из localStorage
  const [sessionHistory, setSessionHistory] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 3. Восстановление текущей раздачи и улицы после перезагрузки
  const [selectedMode, setSelectedMode] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_STATE) || '{}');
      return saved.selectedMode || 'chipev_8max';
    } catch {
      return 'chipev_8max';
    }
  });

  const [trainingFocus, setTrainingFocus] = useState('all');

  const [currentScenarioId, setCurrentScenarioId] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_STATE) || '{}');
      return saved.currentScenarioId || 'full_1';
    } catch {
      return 'full_1';
    }
  });

  const [streetIndex, setStreetIndex] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_STATE) || '{}');
      return Number(saved.streetIndex) || 0;
    } catch {
      return 0;
    }
  });

  // Состояние текущего хода
  const [selectedTags, setSelectedTags] = useState([]);
  const [betSliderValue, setBetSliderValue] = useState(2.2);
  const [showSizingDrawer, setShowSizingDrawer] = useState(false);
  const [customReasoning, setCustomReasoning] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Оценка и ИИ-тренер
  const [evaluation, setEvaluation] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

  // Модальные окна
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyFilterTab, setHistoryFilterTab] = useState('all'); // 'all' | 'mistakes' | 'saved_spots'
  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);

  // Ключ Gemini API
  const [userApiKey, setUserApiKey] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    } catch {
      return '';
    }
  });

  // Авто-сохранение истории в localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(sessionHistory.slice(0, 150)));
    } catch {
      // ignore storage quota errors
    }
  }, [sessionHistory]);

  // Авто-сохранение сгенерированных раздач в localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.CUSTOM_SCENARIOS,
        JSON.stringify(customScenarios.slice(0, 60))
      );
    } catch {
      // ignore storage quota errors
    }
  }, [customScenarios]);

  // Авто-сохранение открытой раздачи и улицы
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_STATE,
        JSON.stringify({ selectedMode, currentScenarioId, streetIndex })
      );
    } catch {
      // ignore
    }
  }, [selectedMode, currentScenarioId, streetIndex]);

  const handleSaveApiKey = newKey => {
    const cleaned = newKey.trim();
    setUserApiKey(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem(STORAGE_KEYS.API_KEY, cleaned);
      } else {
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }
    } catch {
      // ignore
    }
  };

  const allScenarios = useMemo(() => [...customScenarios, ...SCENARIOS], [customScenarios]);

  const modeScenarios = useMemo(
    () => allScenarios.filter(s => s.mode === selectedMode),
    [allScenarios, selectedMode]
  );

  const currentScenario = useMemo(
    () =>
      allScenarios.find(s => s.id === currentScenarioId) || modeScenarios[0] || allScenarios[0],
    [allScenarios, modeScenarios, currentScenarioId]
  );

  const currentStreet = useMemo(
    () => currentScenario.streets[streetIndex] || currentScenario.streets[0],
    [currentScenario, streetIndex]
  );

  const isPreflop = !currentStreet.board || currentStreet.board.length === 0;
  const heroPreflopIdx = POKER_POSITIONS_8MAX.indexOf(currentScenario.heroPos);
  const villainPreflopIdx = POKER_POSITIONS_8MAX.indexOf(currentScenario.villainPos);
  const isPreflopRFI = Boolean(
    isPreflop &&
      (currentStreet.isPreflopRFI ||
        (heroPreflopIdx !== -1 &&
          villainPreflopIdx !== -1 &&
          heroPreflopIdx < villainPreflopIdx &&
          currentScenario.heroPos !== 'BB'))
  );

  // Сколько нужно доставить для колла/лимпа на текущей улице
  const effectiveToCall = useMemo(() => {
    if (isPreflopRFI) {
      return currentScenario.heroPos === 'SB' ? 0.5 : 1.0;
    }
    return Number(currentStreet.toCall) || 0;
  }, [isPreflopRFI, currentScenario.heroPos, currentStreet.toCall]);

  // Реальный размер банка на столе перед ходом Героя
  const displayPotOnTable = useMemo(() => {
    if (isPreflopRFI) return 2.5;
    return Number(currentStreet.potBeforeAction || 0) + Number(currentStreet.toCall || 0);
  }, [isPreflopRFI, currentStreet]);

  // Сброс ползунка и ввода при смене улицы или раздачи
  useEffect(() => {
    let defaultBet = 2.2;
    if (isPreflopRFI) {
      defaultBet = currentScenario.heroPos === 'SB' ? 2.8 : 2.2;
    } else if (currentStreet.toCall > 0) {
      defaultBet =
        currentStreet.minRaise ||
        Math.min(currentStreet.effectiveStack, Math.round(currentStreet.toCall * 2.8 * 10) / 10);
    } else {
      defaultBet =
        currentStreet.minBet ||
        Math.max(1.5, Math.round(currentStreet.potBeforeAction * 0.35 * 10) / 10);
    }

    setBetSliderValue(Math.min(currentStreet.effectiveStack, Number(defaultBet.toFixed(1))));
    setSelectedTags([]);
    setShowSizingDrawer(false);
    setEvaluation(null);
    setAiAnalysis('');
    setCustomReasoning('');
    setShowNoteInput(false);
  }, [currentScenarioId, streetIndex, currentStreet, isPreflopRFI, currentScenario.heroPos]);

  const spr = useMemo(() => {
    const p = displayPotOnTable;
    return p > 0 ? Math.round((currentStreet.effectiveStack / p) * 10) / 10 : 0;
  }, [displayPotOnTable, currentStreet.effectiveStack]);

  const potOddsPct = useMemo(() => {
    if (effectiveToCall <= 0) return 0;
    const total = displayPotOnTable + effectiveToCall;
    return Math.round((effectiveToCall / total) * 1000) / 10;
  }, [displayPotOnTable, effectiveToCall]);

  const nextStreetSprPreview = useMemo(() => {
    const remaining = Math.max(0, currentStreet.effectiveStack - betSliderValue);
    const futurePot = displayPotOnTable + betSliderValue * 2;
    return futurePot > 0 ? Math.round((remaining / futurePot) * 100) / 100 : 0;
  }, [displayPotOnTable, currentStreet.effectiveStack, betSliderValue]);
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  // Запрос разбора к ИИ-тренеру
  const requestAiCoachAnalysis = async (evalResult, extraQuestion = '', historyEntryId = null) => {
    setIsAiLoading(true);
    try {
      const tagNames = evalResult.selectedTags
        .map(id => LOGIC_TAGS.find(t => t.id === id)?.label)
        .filter(Boolean)
        .join(', ');

      const historyStr = (currentStreet.actionHistory || [])
        .map(h => `${h.street}: ${h.text}`)
        .join(' | ');

      const prompt = `Ты — профессиональный покерный GTO-тренер. Отвечай СТРОГО НА РУССКОМ ЯЗЫКЕ, лаконично и по делу (3–4 предложения).
Раздача: ${currentScenario.title}.
Хронология: ${historyStr}.
Улица: ${currentStreet.name}. Доска: ${
        currentStreet.board.length ? currentStreet.board.join(' ') : 'Префлоп'
      }.
Карты Героя (${currentScenario.heroPos}): ${currentScenario.heroCards.join(' ')}.
Банк: ${fmtBB(currentStreet.potBeforeAction)} ББ, Стек: ${fmtBB(
        currentStreet.effectiveStack
      )} ББ, SPR: ${spr}.
Ход игрока: ${evalResult.chosenAction.toUpperCase()} ${
        evalResult.chosenAction === 'bet' || evalResult.chosenAction === 'raise'
          ? `${fmtBB(evalResult.chosenSize)} ББ`
          : ''
      }.
Теги игрока: ${tagNames || 'не указаны'}. Мысль: "${customReasoning || 'нет'}".
Эталон GTO: ${currentStreet.gtoAction.type.toUpperCase()} (${
        currentStreet.gtoAction.sizingNote
      }). Объяснение GTO: ${currentStreet.gtoAction.explanation}.
${
  extraQuestion
    ? `Ответь на вопрос игрока: "${extraQuestion}"`
    : 'Разбери ход игрока и его логику. Всегда пиши 10 вместо T.'
}`;

      const text = await callGeminiWithFallback({
        apiKey: userApiKey,
        payload: { contents: [{ parts: [{ text: prompt }] }] },
        timeoutMs: 8500
      });

      setAiAnalysis(text);
      if (historyEntryId) {
        setSessionHistory(prev =>
          prev.map(item => (item.id === historyEntryId ? { ...item, aiText: text } : item))
        );
      }
    } catch {
      setAiAnalysis(
        'Встроенный разбор GTO уже выведен выше. (Для живого диалога с ИИ на внешнем сайте проверь API-ключ и VPN).'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  // Отправка хода игрока и сохранение в постоянный журнал
  const submitPokerAction = (actionType, sizeValue = 0) => {
    const finalSize =
      actionType === 'bet' || actionType === 'raise'
        ? sizeValue
        : actionType === 'call'
        ? effectiveToCall
        : 0;

    const streetForEval = isPreflopRFI
      ? { ...currentStreet, isPreflopRFI: true, potBeforeAction: 2.5 }
      : currentStreet;

    const result = evaluateDecision(streetForEval, actionType, finalSize, selectedTags);
    setEvaluation(result);
    setShowSizingDrawer(false);
  // МГНОВЕННАЯ генерация новой 4-уличной раздачи (< 0.02 сек, 18 архетипов без повторов)
  const handleInstantNewHand = () => {
    const newScenario = generateInstantProceduralScenario(selectedMode, trainingFocus);
    setCustomScenarios(prev => [newScenario, ...prev]);
    setCurrentScenarioId(newScenario.id);
    setStreetIndex(0);
    setIsSelectorOpen(false);
    setStatusBanner(`Новая раздача: ${newScenario.heroCards.join(' ')} на ${newScenario.heroPos} vs ${newScenario.villainPos}`);
    setTimeout(() => setStatusBanner(''), 3000);
  };

  // Генерация через ИИ с принудительной инъекцией разнообразных рук БЕЗ ТУЗОВ
  const handleGenerateAiScenario = async () => {
    setIsGeneratingScenario(true);

    // Пул разнообразных стартовых рук и тактических сценариев (88% БЕЗ ТУЗА!)
    const diverseSeeds = [
      {
        heroPos: 'BTN',
        villainPos: 'BB',
        heroCards: ['8♠', '7♠'],
        stack: 35,
        themeTitle: 'Коннекторы 8♠7♠ на баттоне: флоат и давление на терне',
        focus: 'connectors'
      },
      {
        heroPos: 'SB',
        villainPos: 'BB',
        heroCards: ['Q♥', '8♥'],
        stack: 32,
        themeTitle: 'Слепая война SB vs BB: блеф без позиции с Q♥8♥',
        focus: 'bluff_oop'
      },
      {
        heroPos: 'BB',
        villainPos: 'BTN',
        heroCards: ['7♦', '5♦'],
        stack: 38,
        themeTitle: 'Защита BB с гаппером 7♦5♦: чек-рейз в полублеф на низком борде',
        focus: 'bluff_oop'
      },
      {
        heroPos: 'CO',
        villainPos: 'BB',
        heroCards: ['J♣', '9♣'],
        stack: 36,
        themeTitle: 'Одномастный гаппер J♣9♣ на CO: розыгрыш двусторонки на 4 улицах',
        focus: 'connectors'
      },
      {
        heroPos: 'LJ',
        villainPos: 'BTN',
        heroCards: ['K♠', 'Q♦'],
        stack: 40,
        themeTitle: 'Игра без позиции (LJ vs BTN) с K♠Q♦ под давлением',
        focus: 'bluff_oop'
      },
      {
        heroPos: 'BB',
        villainPos: 'CO',
        heroCards: ['6♠', '6♥'],
        stack: 34,
        themeTitle: 'Карманная пара 6♠6♥ на BB: защита спектра и доезд в сет',
        focus: 'pairs_broadway'
      },
      {
        heroPos: 'BTN',
        villainPos: 'HJ',
        heroCards: ['6♣', '5♣'],
        stack: 42,
        themeTitle: 'Полярный 3-бет с коннектором 6♣5♣ в позиции',
        focus: 'connectors'
      },
      {
        heroPos: 'HJ',
        villainPos: 'BB',
        heroCards: ['10♠', '10♦'],
        stack: 35,
        themeTitle: 'Карманные десятки 10♠10♦: пот-контроль при выходе оверкарты',
        focus: 'pairs_broadway'
      },
      {
        heroPos: 'BB',
        villainPos: 'BTN',
        heroCards: ['9♠', '8♠'],
        stack: 30,
        themeTitle: 'Превращение пары в блеф на ривере с 9♠8♠ по блокерам',
        focus: 'bluff_oop'
      }
    ];

    const filteredSeeds =
      trainingFocus === 'all'
        ? diverseSeeds
        : diverseSeeds.filter(s => s.focus === trainingFocus);
    const chosenSeed =
      (filteredSeeds.length > 0 ? filteredSeeds : diverseSeeds)[
        Math.floor(Math.random() * (filteredSeeds.length || diverseSeeds.length))
      ];

    setStatusBanner(
      `Генерация ИИ-спота: ${chosenSeed.heroCards.join(' ')} (${chosenSeed.heroPos} vs ${chosenSeed.villainPos})...`
    );

    try {
      const prompt = `Создай покерную раздачу ровно из 4 улиц подряд: 1. "Префлоп" (board: []), 2. "Флоп" (3 карты), 3. "Терн" (4 карты), 4. "Ривер" (5 карт).
ОБЯЗАТЕЛЬНЫЕ ВВОДНЫЕ (НЕ МЕНЯЙ ИХ):
- Позиция Hero: "${chosenSeed.heroPos}"
- Позиция Оппонента: "${chosenSeed.villainPos}"
- Карты Hero: ${JSON.stringify(chosenSeed.heroCards)} (ЗАПРЕЩЕНО менять на тузов!)
- Тема раздачи: "${chosenSeed.themeTitle}"
- Эффективный стек: ${chosenSeed.stack} ББ, Анте 1 ББ.
- Масти пиши ТОЛЬКО символами ♠, ♥, ♦, ♣ (например "8♠", "10♥", "Q♦"). Десятку пиши как "10".
- На Префлопе если Hero открывает первым, potBeforeAction = 2.5, isPreflopRFI = true.
Верни чистый JSON: title, blindsInfo, effectiveStackStart, heroPos, villainPos, heroCards, streets (массив из 4 улиц: name, board, potBeforeAction, effectiveStack, toCall, minRaise, isPreflopRFI, villainLastActionBadge, villainActionText, actionHistory [{street, text}], gtoAction {type, acceptableTypes, minOptimalSize, maxOptimalSize, optimalTags, trapTags, explanation, sizingNote}).`;

      const rawJson = await callGeminiWithFallback({
        apiKey: userApiKey,
        payload: {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        },
        timeoutMs: 8000
      });

      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed.streets) && parsed.streets.length >= 4) {
        const cleanScenario = sanitizeAiGeneratedScenario(parsed, selectedMode, chosenSeed);
        setCustomScenarios(prev => [cleanScenario, ...prev]);
        setCurrentScenarioId(cleanScenario.id);
        setStreetIndex(0);
        setIsSelectorOpen(false);
        setStatusBanner(
          `Загружен ИИ-спот: ${cleanScenario.heroCards.join(' ')} (${cleanScenario.heroPos} vs ${cleanScenario.villainPos})`
        );
        setTimeout(() => setStatusBanner(''), 3000);
        return;
      }
      throw new Error('Incomplete streets');
    } catch {
      const fallbackScenario = generateInstantProceduralScenario(selectedMode, trainingFocus);
      setCustomScenarios(prev => [fallbackScenario, ...prev]);
      setCurrentScenarioId(fallbackScenario.id);
      setStreetIndex(0);
      setIsSelectorOpen(false);
      setStatusBanner(
        `Создана раздача: ${fallbackScenario.heroCards.join(' ')} (${fallbackScenario.heroPos} vs ${fallbackScenario.villainPos})`
      );
      setTimeout(() => setStatusBanner(''), 3500);
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  // Восстановление и переигровка любой раздачи из Журнала Истории
  const handleReplayFromHistory = (historyItem, fromPreflop = false) => {
    if (historyItem.scenarioSnapshot) {
      const exists = allScenarios.some(s => s.id === historyItem.scenarioSnapshot.id);
      if (!exists) {
        setCustomScenarios(prev => [historyItem.scenarioSnapshot, ...prev]);
      }
      setSelectedMode(historyItem.scenarioSnapshot.mode || 'chipev_8max');
      setCurrentScenarioId(historyItem.scenarioSnapshot.id);
      setStreetIndex(fromPreflop ? 0 : historyItem.streetIndex || 0);
      setIsHistoryModalOpen(false);
    }
  };

  const currentModeObj = TABLE_MODES.find(m => m.id === selectedMode) || TABLE_MODES[0];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col font-sans select-none">
      {/* ==================================================================== */}
      {/* 1. КОМПАКТНАЯ ШАПКА ПОКЕР-РУМА                                        */}
      {/* ==================================================================== */}
      <header className="bg-slate-900/95 border-b border-slate-800 px-3 h-12 flex items-center justify-between gap-2 z-30">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center gap-2 text-xs font-medium text-white truncate transition"
          >
            <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px] shrink-0">
              {currentModeObj.shortName} ({modeScenarios.length})
            </span>
            <span className="truncate max-w-[110px] sm:max-w-[200px] text-slate-200">
              {currentScenario.title}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {/* ВЫБОР ФОКУСА ТРЕНИРОВКИ (КОННЕКТОРЫ, БЛЕФ OOP, ПАРЫ ИЛИ ВСЕ) */}
          <select
            value={trainingFocus}
            onChange={e => setTrainingFocus(e.target.value)}
            className="hidden sm:block px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-200 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
            title="Выбери тему генерируемых раздач"
          >
            {TRAINING_FOCUS_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* МГНОВЕННАЯ КНОПКА НОВОЙ 4-УЛИЧНОЙ РАЗДАЧИ */}
          <button
            onClick={handleInstantNewHand}
            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow transition"
            title="Мгновенно создать новую разнообразную раздачу на 4 улицы"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Новая раздача</span>
          </button>

          {/* КНОПКА ИИ-ГЕНЕРАТОРА */}
          <button
            onClick={handleGenerateAiScenario}
            disabled={isGeneratingScenario}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-300 text-xs font-semibold transition disabled:opacity-50 shrink-0"
            title="Сгенерировать раздачу через Gemini API (с разнообразными руками без перекоса в тузов)"
          >
            {isGeneratingScenario ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{isGeneratingScenario ? 'ИИ думает...' : 'ИИ-спот'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {averageScore && (
            <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Ср. балл:</span>
              <span className="font-bold text-white">{averageScore}</span>
            </div>
          )}

          <button
            onClick={() => setIsRangeModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            title="Матрица диапазона 13x13"
          >
            <Grid className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Спектр</span>
          </button>

          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            title="Сохраненный журнал раздач и работа над ошибками"
          >
            <History className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">История / Ошибки</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-[10px] font-bold">
              {sessionHistory.length}
            </span>
            {mistakesHistory.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                ! {mistakesHistory.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsGlossaryModalOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title="Справочник тегов логики"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsApiKeyModalOpen(true)}
            className={`px-2 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition ${
              userApiKey.trim()
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
            }`}
            title="Настройка Gemini API ключа"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">{userApiKey.trim() ? 'API OK' : 'API Ключ'}</span>
          </button>
        </div>
      </header>

      {/* ВСПЛЫВАЮЩЕЕ УВЕДОМЛЕНИЕ О СТАТУСЕ */}
      {statusBanner && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/40 px-3 py-1 text-center text-xs text-emerald-200 font-medium">
          {statusBanner}
        </div>
      )}

      {/* ВЫПАДАЮЩЕЕ МЕНЮ ВЫБОРА СТОЛА И СПИСКА СОХРАНЕННЫХ РАЗДАЧ */}
      {isSelectorOpen && (
        <div className="bg-slate-900 border-b border-slate-700 p-3 shadow-2xl z-30">
          <div className="max-w-4xl mx-auto space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {TABLE_MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => {
                      setSelectedMode(m.id);
                      const first = allScenarios.find(s => s.mode === m.id);
                      if (first) {
                        setCurrentScenarioId(first.id);
                        setStreetIndex(0);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
                      selectedMode === m.id
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    {m.name}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleInstantNewHand}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Мгновенная 4-уличная раздача</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto">
              {modeScenarios.map(sc => (
                <button
                  key={sc.id}
                  onClick={() => {
                    setCurrentScenarioId(sc.id);
                    setStreetIndex(0);
                    setIsSelectorOpen(false);
                  }}
                  className={`text-left p-2.5 rounded-lg border text-xs transition flex items-center justify-between ${
                    sc.id === currentScenario.id
                      ? 'bg-slate-800 border-emerald-500 text-white font-semibold'
                      : 'bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="truncate pr-2">
                    <div>{sc.title}</div>
                    <div className="text-[11px] text-slate-400">
                      {sc.blindsInfo} • {sc.streets.length} улицы (с Префлопа)
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 text-[10px] shrink-0">
                    {sc.heroCards.join(' ')} ({sc.heroPos})
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. ПОЛОСА ХРОНОЛОГИИ И НАВИГАТОР ПО ВСЕМ 4 УЛИЦАМ (ПРЕФЛОП -> РИВЕР)  */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-3 py-1.5">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Лог действий до текущего момента */}
          <div className="flex flex-wrap items-center gap-1.5 text-slate-300">
            {(currentStreet.actionHistory || []).map((step, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
                <span className="inline-flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/70">
                  <strong className="text-emerald-400 font-semibold">{step.street}:</strong>
                  <span>{step.text}</span>
                </span>
              </React.Fragment>
            ))}
          </div>

          {/* Навигатор по всем 4 улицам раздачи */}
          <div className="flex items-center gap-1 shrink-0">
            {currentScenario.streets.map((st, idx) => (
              <button
                key={idx}
                onClick={() => setStreetIndex(idx)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition flex items-center gap-1 ${
                  idx === streetIndex
                    ? 'bg-emerald-600 text-white shadow'
                    : idx < streetIndex
                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>
                  {idx + 1}. {st.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. КЛАССИЧЕСКИЙ ОВАЛЬНЫЙ ПОКЕРНЫЙ СТОЛ                               */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto px-2 sm:px-4 py-2 gap-2">
        <div className="relative w-full h-[310px] sm:h-[360px] my-auto flex items-center justify-center">
          {/* Овальное зеленое сукно */}
          <div className="relative w-[92%] sm:w-[86%] h-[82%] rounded-[999px] bg-gradient-to-b from-[#155e3b] via-[#0f4c2f] to-[#0a3622] border-[10px] sm:border-[12px] border-[#1f2937] shadow-[inset_0_0_50px_rgba(0,0,0,0.65),0_15px_35px_rgba(0,0,0,0.7)] flex flex-col items-center justify-center">
            <div className="absolute inset-3 sm:inset-4 rounded-[999px] border border-emerald-300/15 pointer-events-none" />

            {/* ЦЕНТР СТОЛА: БАНК, КАРТЫ БОРДА, СТАТУС ХОДА */}
            <div className="z-10 flex flex-col items-center gap-2 px-3">
              <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-950/80 border border-emerald-400/30 shadow-md">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  Банк: {fmtBB(displayPotOnTable)} ББ
                </span>
                <span className="text-[11px] text-emerald-300 border-l border-slate-700 pl-2">
                  SPR: {spr}
                </span>
              </div>

              {/* Карты борда */}
              <div className="min-h-[68px] sm:min-h-[82px] flex items-center justify-center gap-1.5 sm:gap-2">
                {currentStreet.board && currentStreet.board.length > 0 ? (
                  currentStreet.board.map((card, i) => <PokerCard key={i} cardStr={card} />)
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-black/25 border border-white/10 text-xs text-emerald-200/90 font-medium">
                    1. Префлоп • Карты борда еще не сданы
                  </div>
                )}
              </div>

              {/* Описание текущей ситуации на улице */}
              <div className="text-[11px] sm:text-xs text-emerald-100/95 bg-black/40 px-3 py-0.5 rounded-full text-center max-w-md truncate">
                {currentStreet.villainActionText}
              </div>
            </div>
          </div>

          {/* РАССАДКА ИГРОКОВ ВОКРУГ СТОЛА С ТОЧНОЙ ОЧЕРЕДНОСТЬЮ ХОДА */}
          {orderedSeats.map(seat => {
            const isHero = seat.isHero;
            const isVillain = seat.isVillain;
            const isActive = isHero || isVillain;
            const isDealer = seat.pos === 'BTN';
            const displayStack = isActive ? currentStreet.effectiveStack : seat.stack;

            return (
              <div
                key={seat.pos}
                style={{ top: seat.layout.top, left: seat.layout.left }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
              >
                {/* Плашка действия или ожидания хода Оппонента */}
                {isVillain && seat.computedBadge && (
                  <div
                    className={`mb-1 px-2.5 py-0.5 rounded-full font-extrabold text-[11px] shadow-lg flex items-center gap-1 whitespace-nowrap ${
                      seat.computedBadge.includes('Ждет')
                        ? 'bg-slate-800 text-slate-200 border border-slate-600'
                        : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full inline-block ${
                        seat.computedBadge.includes('Ждет') ? 'bg-sky-400' : 'bg-red-600'
                      }`}
                    />
                    <span>{seat.computedBadge}</span>
                  </div>
                )}

                {isHero ? (
                  <div className="flex items-center gap-2.5 bg-slate-900/95 border-2 border-emerald-500 rounded-2xl px-3 py-1.5 shadow-xl">
                    <div className="flex gap-1 -mt-5">
                      {currentScenario.heroCards.map((c, idx) => (
                        <PokerCard key={idx} cardStr={c} size="md" />
                      ))}
                    </div>
                    <div className="text-left pr-1">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px]">
                          {seat.pos}
                        </span>
                        <span className="text-xs font-bold text-white">Ты (Hero)</span>
                        {isDealer && (
                          <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow">
                            D
                          </span>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-emerald-400 mt-0.5">
                        {fmtBB(displayStack)} ББ
                      </div>
                    </div>
                  </div>
                ) : isVillain ? (
                  <div className="flex items-center gap-2 bg-slate-900/95 border-2 border-rose-500 rounded-xl px-2.5 py-1.5 shadow-xl">
                    <CardBackPair />
                    <div className="text-left">
                      <div className="flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]">
                          {seat.pos}
                        </span>
                        <span className="text-xs font-bold text-white">Оппонент</span>
                        {isDealer && (
                          <span className="w-4 h-4 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] flex items-center justify-center shadow">
                            D
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-extrabold text-amber-300">
                        {fmtBB(displayStack)} ББ
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Остальные места: различаем тех, кто уже сбросил (ПАС), и тех, кто еще ЖДЕТ ХОДА позади Героя */
                  <div
                    className={`px-2.5 py-1 rounded-xl border text-center transition ${
                      seat.isShortStack
                        ? 'bg-slate-900/85 border-amber-500/50 text-amber-200'
                        : seat.isWaitingToAct
                        ? 'bg-slate-900/85 border-slate-600 text-slate-200'
                        : 'bg-slate-900/50 border-slate-800 text-slate-500 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold">
                      <span>{seat.pos}</span>
                      <span>• {fmtBB(seat.stack)} ББ</span>
                      {isDealer && (
                        <span className="w-3.5 h-3.5 rounded-full bg-amber-400 text-slate-950 font-black text-[9px] flex items-center justify-center">
                          D
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] uppercase tracking-wider">{seat.statusLabel}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ================================================================== */}
        {/* 4. НИЖНЯЯ ПАНЕЛЬ УПРАВЛЕНИЯ                                        */}
        {/* ================================================================== */}
        {!evaluation ? (
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 shadow-xl space-y-2.5">
            {/* Шаг 1: Выбор тегов логики */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. Отметь причину хода ({currentStreet.name}):</span>
                </span>
                <button
                  onClick={() => setShowNoteInput(!showNoteInput)}
                  className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <MessageSquare className="w-3 h-3" />
                  <span>{showNoteInput ? 'Скрыть заметку' : '+ Написать свою мысль'}</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {LOGIC_TAGS.map(tag => {
                  const active = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      title={tag.desc}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition border ${
                        active
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-sm'
                          : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-750'
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>

              {showNoteInput && (
                <input
                  type="text"
                  value={customReasoning}
                  onChange={e => setCustomReasoning(e.target.value)}
                  placeholder="Напиши свою мысль (ИИ-тренер проверит логику)..."
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

            {/* Ползунок выбора сайзинга */}
            {showSizingDrawer && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {(isPreflopRFI
                      ? [
                          { label: '2.0 ББ', fixed: 2.0 },
                          { label: '2.2 ББ (Стандарт)', fixed: 2.2 },
                          { label: '2.5 ББ', fixed: 2.5 },
                          { label: '3.0 ББ', fixed: 3.0 },
                          { label: 'Олл-ин', allIn: true }
                        ]
                      : [
                          { label: '33%', mult: 0.33 },
                          { label: '50%', mult: 0.5 },
                          { label: '75%', mult: 0.75 },
                          { label: 'Банк', mult: 1.0 },
                          { label: 'Олл-ин', allIn: true }
                        ]
                    ).map(btn => (
                      <button
                        key={btn.label}
                        onClick={() => {
                          if (btn.allIn) {
                            setBetSliderValue(currentStreet.effectiveStack);
                          } else if (btn.fixed) {
                            setBetSliderValue(Math.min(currentStreet.effectiveStack, btn.fixed));
                          } else {
                            const basePot =
                              currentStreet.potBeforeAction + currentStreet.toCall * 2;
                            const raw = currentStreet.toCall + basePot * btn.mult;
                            const minAllowed =
                              currentStreet.toCall > 0
                                ? currentStreet.minRaise || currentStreet.toCall * 2
                                : currentStreet.minBet || 1.5;
                            const clamped = Math.min(
                              currentStreet.effectiveStack,
                              Math.max(minAllowed, Math.round(raw * 10) / 10)
                            );
                            setBetSliderValue(clamped);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold"
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">
                      Будущий SPR:{' '}
                      <strong
                        className={
                          nextStreetSprPreview > 0.6 && nextStreetSprPreview < 1.3
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }
                      >
                        {nextStreetSprPreview}
                      </strong>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={
                      isPreflopRFI
                        ? 2.0
                        : currentStreet.toCall > 0
                        ? currentStreet.minRaise || currentStreet.toCall * 2
                        : currentStreet.minBet || 1.5
                    }
                    max={currentStreet.effectiveStack}
                    step="0.1"
                    value={betSliderValue}
                    onChange={e => setBetSliderValue(Number(e.target.value))}
                    className="flex-1 accent-emerald-500 cursor-pointer"
                  />
                  <button
                    onClick={() =>
                      submitPokerAction(
                        currentStreet.toCall > 0 ? 'raise' : 'bet',
                        betSliderValue
                      )
                    }
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg"
                  >
                    Подтвердить {fmtBB(betSliderValue)} ББ
                  </button>
                </div>
              </div>
            )}

            {/* КНОПКИ ДЕЙСТВИЙ ПОКЕР-РУМА (ИСПРАВЛЕНЫ ДЛЯ ПРЕФЛОП-ОТКРЫТИЯ И ПОСТФЛОПА) */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-0.5">
              {/* 1. Кнопка ПАС (активна и при открытии на префлопе, и против ставки!) */}
              <button
                onClick={() => submitPokerAction('fold', 0)}
                disabled={!isPreflopRFI && currentStreet.toCall === 0}
            {/* КНОПКИ ДЕЙСТВИЙ ПОКЕР-РУМА (ВСЕ 3 КЛАССИЧЕСКИЕ КНОПКИ ДОСТУПНЫ ВСЕГДА!) */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-0.5">
              {/* 1. Кнопка ПАС (Fold) */}
              <button
                onClick={() => submitPokerAction('fold', 0)}
                disabled={!isPreflopRFI && effectiveToCall === 0}
                className={`py-2.5 sm:py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex flex-col items-center justify-center border transition ${
                  !isPreflopRFI && effectiveToCall === 0
                    ? 'bg-slate-800/40 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-rose-950/70 border-slate-700 hover:border-rose-500/60 text-slate-200'
                }`}
              >
                <span>ПАС (Fold)</span>
                <span className="text-[10px] font-normal text-slate-400">
                  {isPreflopRFI
                    ? `Сбросить руку на ${currentScenario.heroPos}`
                    : effectiveToCall > 0
                    ? `Сохранить ${fmtBB(currentStreet.effectiveStack)} ББ`
                    : 'Доступен бесплатный чек'}
                </span>
              </button>

              {/* 2. Кнопка ЧЕК / КОЛЛ / ЛИМП (Всегда доступна — включая вход лимпом на префлопе!) */}
              <button
                onClick={() =>
                  submitPokerAction(
                    effectiveToCall > 0 ? 'call' : 'check',
                    effectiveToCall
                  )
                }
                className="py-2.5 sm:py-3 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 border border-sky-400/50 text-white font-bold text-xs sm:text-sm flex flex-col items-center justify-center shadow-md transition"
              >
                <span>
                  {isPreflopRFI
                    ? currentScenario.heroPos === 'SB'
                      ? 'КОЛЛ / КОМПЛИТ 0.5 ББ'
                      : 'КОЛЛ (Лимп 1 ББ)'
                    : effectiveToCall > 0
                    ? `КОЛЛ ${fmtBB(effectiveToCall)} ББ`
                    : 'ЧЕК (Check)'}
                </span>
                <span className="text-[10px] font-normal text-sky-100">
                  {isPreflopRFI
                    ? 'Войти в банк без рейза'
                    : effectiveToCall > 0
                    ? `Шансы банка: ${potOddsPct}%`
                    : 'Контроль банка'}
                </span>
              </button>

              {/* 3. Кнопка БЕТ / РЕЙЗ (Открой ползунок или нажми повторно для подтверждения) */}
              <button
                onClick={() => {
                  if (showSizingDrawer) {
                    submitPokerAction(
                      isPreflop || effectiveToCall > 0 ? 'raise' : 'bet',
                      betSliderValue
                    );
                  } else {
                    setShowSizingDrawer(true);
                  }
                }}
                className="py-2.5 sm:py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 border border-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center shadow-md transition"
              >
                <span>
                  {isPreflopRFI
                    ? `РЕЙЗ ${fmtBB(betSliderValue)} ББ`
                    : effectiveToCall > 0
                    ? `РЕЙЗ ${fmtBB(betSliderValue)} ББ`
                    : `БЕТ ${fmtBB(betSliderValue)} ББ`}
                </span>
                <span className="text-[10px] font-semibold text-slate-900">
                  {showSizingDrawer
                    ? `Нажми для подтверждения ${fmtBB(betSliderValue)} ББ`
                    : 'Выбрать размер / Подтвердить'}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* 5. ОКНО РАЗБОРА ПОСЛЕ ХОДА И ПЕРЕХОД НА СЛЕДУЮЩУЮ УЛИЦУ          */
          /* ================================================================ */
          <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-3.5 shadow-2xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1.5 rounded-xl font-extrabold text-base sm:text-lg flex items-center gap-1.5 ${
                    evaluation.totalScore >= 8
                      ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                      : evaluation.totalScore >= 5
                      ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                      : 'bg-rose-500/20 border border-rose-500/50 text-rose-300'
                  }`}
                >
                  <Award className="w-4 h-4" />
                  <span>{evaluation.totalScore} / 10</span>
                </div>

                <div>
                  <div className="text-xs sm:text-sm font-bold text-white">
                    Эталон GTO ({currentStreet.name}): {currentStreet.gtoAction.type.toUpperCase()}{' '}
                    {currentStreet.gtoAction.minOptimalSize
                      ? `(${fmtBB(currentStreet.gtoAction.minOptimalSize)}–${fmtBB(
                          currentStreet.gtoAction.maxOptimalSize
                        )} ББ)`
                      : ''}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Действие: {evaluation.mathScore}/7.0 • Логика: {evaluation.logicScore}/3.0 •
                    Автоматически сохранено в Историю
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEvaluation(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Переиграть улицу</span>
                </button>

                {streetIndex < currentScenario.streets.length - 1 ? (
                  <button
                    onClick={() => setStreetIndex(streetIndex + 1)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1 shadow-md"
                  >
                    <span>
                      Далее: {streetIndex + 2}. {currentScenario.streets[streetIndex + 1].name}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleInstantNewHand}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1 shadow-md"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Следующая 4-уличная раздача</span>
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              {evaluation.gtoExplanation}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {evaluation.feedback.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-2.5 rounded-xl border text-xs flex items-start gap-2 ${
                    item.type === 'positive'
                      ? 'bg-emerald-950/30 border-emerald-700/40 text-emerald-200'
                      : item.type === 'warning'
                      ? 'bg-amber-950/30 border-amber-700/40 text-amber-200'
                      : 'bg-rose-950/30 border-rose-700/40 text-rose-200'
                  }`}
                >
                  {item.type === 'positive' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">{item.title}</div>
                    <div className="text-slate-300 mt-0.5">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>

            {aiAnalysis && (
              <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs text-slate-200 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Комментарий ИИ-тренера:</span>
                </div>
                <div className="leading-relaxed whitespace-pre-line">{aiAnalysis}</div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={followUpQuestion}
                onChange={e => setFollowUpQuestion(e.target.value)}
                placeholder="Задать вопрос по этой улице..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => {
                  requestAiCoachAnalysis(evaluation, followUpQuestion);
                  setFollowUpQuestion('');
                }}
                disabled={isAiLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                {isAiLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{isAiLoading ? 'Запрос...' : 'Спросить ИИ'}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* МОДАЛКИ: МАТРИЦА 13x13, ПОСТОЯННЫЙ ЖУРНАЛ ОШИБОК, СЛОВАРЬ, API КЛЮЧ  */}
      {/* ==================================================================== */}
      <RangeMatrixModal
        isOpen={isRangeModalOpen}
        onClose={() => setIsRangeModalOpen(false)}
        rangeMatrix={currentStreet.rangeMatrix}
        villainPos={currentScenario.villainPos}
      />

      {/* МОДАЛЬНОЕ ОКНО: ЖУРНАЛ ИСТОРИИ, РАБОТА НАД ОШИБКАМИ И СОХРАНЕННЫЕ РАЗДАЧИ */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    Журнал раздач и Работа над ошибками
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Все ходы и сгенерированные раздачи автоматически сохраняются в браузере
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Вкладки фильтрации журнала */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setHistoryFilterTab('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    historyFilterTab === 'all'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Все ходы ({sessionHistory.length})
                </button>
                <button
                  onClick={() => setHistoryFilterTab('mistakes')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                    historyFilterTab === 'mistakes'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-800 text-rose-300 hover:bg-slate-700'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>Мои ошибки &lt; 7.5 ({mistakesHistory.length})</span>
                </button>
                <button
                  onClick={() => setHistoryFilterTab('saved_spots')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    historyFilterTab === 'saved_spots'
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Созданные раздачи ({customScenarios.length})
                </button>
              </div>

              {sessionHistory.length > 0 && (
                <button
                  onClick={() => {
                    setSessionHistory([]);
                    localStorage.removeItem(STORAGE_KEYS.HISTORY);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 text-xs flex items-center gap-1 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Очистить</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {historyFilterTab === 'saved_spots' ? (
                customScenarios.length === 0 ? (
                  <div className="text-center py-10 text-slate-500 text-sm">
                    Ты еще не создал новых раздач. Нажми кнопку «⚡ Новая раздача» в шапке.
                  </div>
                ) : (
                  customScenarios.map(sc => (
                    <div
                      key={sc.id}
                      className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{sc.title}</div>
                        <div className="text-slate-400 mt-0.5">
                          {sc.blindsInfo} • Карты: <strong>{sc.heroCards.join(' ')}</strong> (
                          {sc.heroPos} vs {sc.villainPos})
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedMode(sc.mode || 'chipev_8max');
                          setCurrentScenarioId(sc.id);
                          setStreetIndex(0);
                          setIsHistoryModalOpen(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 shrink-0"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Играть с Префлопа</span>
                      </button>
                    </div>
                  ))
                )
              ) : (historyFilterTab === 'mistakes' ? mistakesHistory : sessionHistory).length ===
                0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  {historyFilterTab === 'mistakes'
                    ? 'Отличная работа! Ошибок с оценкой ниже 7.5 пока нет.'
                    : 'Ты еще не сыграл ни одной улицы.'}
                </div>
              ) : (
                (historyFilterTab === 'mistakes' ? mistakesHistory : sessionHistory).map(item => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-white">
                          {item.scenarioTitle} • {item.streetName}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-2">{item.timestamp}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded font-bold shrink-0 ${
                          item.score >= 8
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : item.score >= 5
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-rose-500/20 text-rose-300'
                        }`}
                      >
                        {item.score} / 10
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-slate-300">
                      <div>
                        Карты ({item.heroPos}): <strong>{item.heroCards.join(' ')}</strong> | Доска:{' '}
                        <strong>{item.board?.length ? item.board.join(' ') : 'Префлоп'}</strong>
                      </div>
                      <div className="text-slate-400">
                        Твой ход:{' '}
                        <strong className="text-white uppercase">
                          {item.chosenAction}{' '}
                          {item.chosenSize > 0 ? `${fmtBB(item.chosenSize)} ББ` : ''}
                        </strong>{' '}
                        → Эталон GTO:{' '}
                        <strong className="text-emerald-400 uppercase">{item.gtoType}</strong> (
                        {item.gtoSizingNote})
                      </div>
                    </div>

                    <div className="text-slate-300 bg-slate-900/80 p-2 rounded-lg leading-relaxed">
                      {item.explanation}
                    </div>

                    {item.scenarioSnapshot && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => handleReplayFromHistory(item, false)}
                          className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Переиграть эту улицу ({item.streetName})</span>
                        </button>
                        <button
                          onClick={() => handleReplayFromHistory(item, true)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 font-semibold flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          <span>Пройти раздачу с Префлопа</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: СПРАВОЧНИК ТЕГОВ */}
      {isGlossaryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-4 shadow-2xl max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Справочник тегов логики (когда их нажимать)
                </h3>
              </div>
              <button
                onClick={() => setIsGlossaryModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {LOGIC_TAGS.map(t => (
                <div
                  key={t.id}
                  className={`p-2.5 rounded-xl border text-xs ${
                    t.isTrap
                      ? 'bg-rose-950/25 border-rose-700/40'
                      : 'bg-slate-800/60 border-slate-700/70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-white">{t.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-400">
                      {t.category}
                    </span>
                  </div>
                  <div className="text-slate-300 leading-relaxed">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: НАСТРОЙКА API-КЛЮЧА */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Настройка API-ключа (AIzaSy и AQ.)
                </h3>
              </div>
              <button
                onClick={() => setIsApiKeyModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
              <p>
                Кнопка <strong>«⚡ Новая раздача»</strong> работает мгновенно и вообще не требует
                ключа. Ключ нужен только для кнопки <strong>«🤖 ИИ-спот»</strong> и живого чата с
                тренером на отдельном сайте. Поддерживаются оба формата ключей (<code>AIzaSy...</code> и{' '}
                <code>AQ....</code>).
              </p>
            </div>

            <div className="space-y-2">
              <input
                type="password"
                value={userApiKey}
                onChange={e => handleSaveApiKey(e.target.value)}
                placeholder="Вставь сюда ключ AIzaSy... или AQ...."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => handleSaveApiKey('')}
                  className="text-xs text-slate-400 hover:text-rose-400"
                >
                  Очистить ключ
                </button>
                <button
                  onClick={() => setIsApiKeyModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                >
                  Сохранить и закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
