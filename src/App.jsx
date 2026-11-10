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
  Layers,
  Coins,
  Key
} from 'lucide-react';

// ============================================================================
// КОНСТАНТЫ КОЛОДЫ, ПОЗИЦИЙ, РЕЖИМОВ СТОЛА И ТЕГОВ ЛОГИКИ
// ============================================================================

const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

const POKER_POSITIONS_8MAX = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

const TABLE_MODES = [
  {
    id: 'chipev_8max',
    shortName: '8-Max: ChipEV',
    name: '8-Max: Рабочая стадия (ChipEV)',
    description: 'Стандартные турнирные стеки 25–50 ББ, игра на ожидание фишек'
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
    description: 'Широкие диапазоны BTN против BB, агрессивная борьба за банки'
  }
];

// Координаты 8 мест вокруг овального стола (индекс 0 — всегда Hero внизу по центру)
const SEAT_SLOTS_8MAX = [
  { top: '87%', left: '50%', badgePos: 'top' },    // 0: Hero (Внизу по центру)
  { top: '76%', left: '16%', badgePos: 'right' },  // 1: Слева внизу
  { top: '48%', left: '6%', badgePos: 'right' },   // 2: Слева по центру
  { top: '20%', left: '18%', badgePos: 'bottom' }, // 3: Слева вверху
  { top: '11%', left: '50%', badgePos: 'bottom' }, // 4: Вверху по центру
  { top: '20%', left: '82%', badgePos: 'bottom' }, // 5: Справа вверху
  { top: '48%', left: '94%', badgePos: 'left' },   // 6: Справа по центру
  { top: '76%', left: '84%', badgePos: 'left' }    // 7: Справа внизу
];

// Компактный список из 10 ключевых тегов для быстрого обоснования хода + словарь
const LOGIC_TAGS = [
  {
    id: 'value_bet',
    label: 'Добор (Вэлью)',
    category: 'Цель хода',
    isTrap: false,
    desc: 'Ставка или рейз с сильной рукой, чтобы получить оплату от рук слабее (вторых пар, топ-пар со слабым кикером, дро).'
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
    label: 'Блеф-кетч / Защита чека',
    category: 'Спектр',
    isTrap: false,
    desc: 'Оставляем крепкую руку в чек-колле, чтобы не давать агрессивному сопернику безнаказанно выдавливать нас ставками.'
  },
  {
    id: 'semibluff_equity',
    label: 'Полублеф (Ауты + ФЭ)',
    category: 'Цель хода',
    isTrap: false,
    desc: 'Агрессия с мощным дро (флеш-дро, стрит-дро): мы забираем мертвые деньги сразу при пасе соперника или доезжаем в натс при колле.'
  },
  {
    id: 'dry_board',
    label: 'Сухая доска / WA-WB',
    category: 'Текстура',
    isTrap: false,
    desc: 'На радужной несвязанной доске нет дро, от которых нужно защищаться рейзом. Ситуация «далеко впереди или далеко позади».'
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
    desc: 'ОШИБКА ИНТУИЦИИ: Зачем выбивать рейзом руки слабее нашей (например, A8s или воздух), если мы уже их бьем и хотим, чтобы они продолжали блефовать?'
  },
  {
    id: 'trap_pot_committed',
    label: 'Уже вложил фишки в банк',
    category: 'Ловушка логики',
    isTrap: true,
    desc: 'ОШИБКА ИНТУИЦИИ: Колл на терне не подписывает контракт на колл овербета на ривере. Прошлые вложения в банк уже не принадлежат тебе.'
  }
];

function normalizeScenarioTag(tagId) {
  const map = {
    value: 'value_bet',
    value_bet: 'value_bet',
    pot_control: 'pot_control',
    showdown_value: 'pot_control',
    protect_check_range: 'protect_check_range',
    bluff_catch: 'protect_check_range',
    semibluff: 'semibluff_equity',
    semibluff_equity: 'semibluff_equity',
    dry_board: 'dry_board',
    wa_wb: 'dry_board',
    blockers: 'blockers_factor',
    blockers_factor: 'blockers_factor',
    good_blockers: 'blockers_factor',
    bad_blockers: 'blockers_factor',
    spr_control: 'spr_icm_control',
    spr_icm_control: 'spr_icm_control',
    icm_pressure: 'spr_icm_control',
    fold_behind: 'fold_behind',
    trap_fold_worse: 'trap_fold_worse',
    trap_pot_committed: 'trap_pot_committed'
  };
  return map[tagId] || 'pot_control';
}

// Тактические архетипы для ИИ-генератора, чтобы он никогда не повторял однотипные топ-пары на 10-7-2
const AI_SPOT_ARCHETYPES = [
  {
    id: 'bluffcatch_river',
    name: 'Блеф-кетч крупной ставки на ривере',
    instruction:
      'Создай раздачу (Флоп -> Терн -> Ривер), где на ривере промахивается очевидное флеш-дро или стрит-дро, и Оппонент ставит крупный бет (65–120% банка). У Hero вторая пара или топ-пара со средним кикером. Решение зависит от блокеров в руке Hero (КОЛЛ с хорошими блокерами или ПАС с анти-блокерами на блеф).'
  },
  {
    id: 'combo_draw_aggression',
    name: 'Розыгрыш мощного дро (OESD / Флеш-дро)',
    instruction:
      'Создай раздачу на дровяной доске (например, Q-J-4, 9-8-3 или K-10-6 с двумя картами одной масти), где у Hero неготовая рука с 12–15 аутами (стрит-дро + флеш-дро или флеш-дро + две оверкарты), и Hero выбирает между чек-рейзом / полублефом и коллом по шансам банка с учетом SPR.'
  },
  {
    id: 'wa_wb_pot_control',
    name: 'Пот-контроль со второй парой / оверкартами (WA/WB)',
    instruction:
      'Создай 3-бет банк или рейзженый банк на доске с тузом или королем (например, A-9-4 или K-8-3), где у Hero карманная пара младше старшей карты (QQ, JJ, 1010 или 99). Задача — сыграть от чека/пот-контроля и не изолировать себя ставкой против рук сильнее.'
  },
  {
    id: 'turn_stop_brake',
    name: 'Стоп-кран на опасном терне или дисциплинированный пас',
    instruction:
      'Создай раздачу (Флоп -> Терн), где на флопе у Hero хорошая рука (топ-пара или оверпара), но на терне выходит очень опасная карта, закрывающая стрит или флеш (или оверкарта к нашей паре), и Оппонент проявляет сильную агрессию (рейз или плотный донк/бет), вынуждая Hero искать дисциплинированный пас или чек вдогонку.'
  },
  {
    id: 'thin_value_vs_capped',
    name: 'Тонкий добор против капнутого чеком спектра',
    instruction:
      'Создай раздачу (Терн -> Ривер), где Оппонент дважды прочекал и тем самым ограничил (капнул) свой диапазон, а у Hero крепкая рука (две пары, сильная топ-пара или трипс), с которой на ривере обязательно нужно выбрать правильный сайзинг ставки на тонкое вэлью.'
  },
  {
    id: 'bb_defense_second_pair',
    name: 'Защита Большого Блайнда со средней парой или гатшотом',
    instruction:
      'Создай раздачу, где Hero защищает BB против открытия с поздней позиции (CO или BTN). На флопе у Hero вторая пара + бэкдорное флеш-дро или гатшот. Оппонент ставит мелкий контбет 30–33% банка. Задача — защитить спектр чека через колл и оценить развитие на терне.'
  },
  {
    id: 'paired_board_trap',
    name: 'Игра на спаренной доске (Защита спектра / Ловушка)',
    instruction:
      'Создай раздачу на спаренном флопе (например, K-7-7, Q-8-8 или 9-9-4), где у Hero либо трипс (слоуплей через чек-колл, чтобы не выбить блефы), либо оверпара/карманка против агрессии соперника.'
  },
  {
    id: 'river_bluff_with_blocker',
    name: 'Превращение руки в блеф с ключевым блокером',
    instruction:
      'Создай раздачу на ривере, где закрылся 3-флеш или 4-стрит борд. У Hero рука без шоудаун-вэлью (например, промазавшее стрит-дро или слабая пара), но с тузом или королем масти флеша (блокер на натс соперника). Оппонент чекает, и Hero должен решить: блефовать или сдаться.'
  }
];

// ============================================================================
// ФОРМАТТЕР БЛАЙНДОВ, НОРМАЛИЗАТОР ПОЗИЦИЙ И РУСИФИКАТОР ИИ-СПОТОВ
// ============================================================================

function fmtBB(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0';
  const rounded = Math.round(num * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// Гарантирует, что любая позиция от ИИ ("BU", "MP", "EP", "Dealer") станет валидной позицией стола
function normalizePokerPosition(rawPos, mode = 'chipev_8max', fallback = 'BTN') {
  if (!rawPos || typeof rawPos !== 'string') {
    return fallback;
  }
  const clean = rawPos.trim().toUpperCase();

  if (mode === 'headsup') {
    if (['BB', 'BIG BLIND', 'ББ'].includes(clean)) return 'BB';
    return 'BTN';
  }

  const aliasMap = {
    UTG: 'UTG',
    EP: 'UTG',
    EP1: 'UTG',
    UTG1: 'UTG+1',
    'UTG+1': 'UTG+1',
    EP2: 'UTG+1',
    'UTG+2': 'LJ',
    MP: 'LJ',
    MP1: 'LJ',
    LJ: 'LJ',
    LOJACK: 'LJ',
    MP2: 'HJ',
    MP3: 'HJ',
    HJ: 'HJ',
    HIJACK: 'HJ',
    CO: 'CO',
    CUTOFF: 'CO',
    'CUT-OFF': 'CO',
    BTN: 'BTN',
    BU: 'BTN',
    BUTTON: 'BTN',
    D: 'BTN',
    DEALER: 'BTN',
    SB: 'SB',
    'SMALL BLIND': 'SB',
    МБ: 'SB',
    BB: 'BB',
    'BIG BLIND': 'BB',
    ББ: 'BB'
  };

  return aliasMap[clean] || (POKER_POSITIONS_8MAX.includes(clean) ? clean : fallback);
}

// Нормализует карту ("Ah" -> "A♥", "Td" -> "10♦")
function normalizeCardString(rawCard, fallbackCard = 'A♠') {
  if (!rawCard || typeof rawCard !== 'string') return fallbackCard;
  const str = rawCard.trim();
  const suitMap = {
    s: '♠',
    S: '♠',
    h: '♥',
    H: '♥',
    d: '♦',
    D: '♦',
    c: '♣',
    C: '♣',
    '♠': '♠',
    '♥': '♥',
    '♦': '♦',
    '♣': '♣'
  };
  const lastChar = str.slice(-1);
  const suit = suitMap[lastChar] || '♠';
  let rank = str.slice(0, -1).toUpperCase().replace('T', '10');
  if (!RANKS.includes(rank)) {
    rank = 'A';
  }
  return `${rank}${suit}`;
}

// Переводит английские термины улиц и действий в чистый русский язык
function translatePokerEnglishToRussian(str) {
  if (!str || typeof str !== 'string') return '';
  let s = str;
  const replacements = [
    [/\bPreflop\b/gi, 'Префлоп'],
    [/\bPre-flop\b/gi, 'Префлоп'],
    [/\bFlop\b/gi, 'Флоп'],
    [/\bTurn\b/gi, 'Терн'],
    [/\bRiver\b/gi, 'Ривер'],
    [/\bBU\b/g, 'BTN'],
    [/\bButton\b/gi, 'BTN'],
    [/\bCutoff\b/gi, 'CO'],
    [/\bHijack\b/gi, 'HJ'],
    [/\bLojack\b/gi, 'LJ'],
    [/\bopens to\b/gi, 'открывается рейзом'],
    [/\braises to\b/gi, 'рейзит до'],
    [/\braises\b/gi, 'рейзит'],
    [/\b3-bets to\b/gi, '3-бетит до'],
    [/\b3bets to\b/gi, '3-бетит до'],
    [/\bcalls\b/gi, 'коллирует'],
    [/\bchecks back\b/gi, 'чекает вдогонку'],
    [/\bchecks\b/gi, 'чекает'],
    [/\bbets\b/gi, 'ставит'],
    [/\bfolds\b/gi, 'пасует'],
    [/\bshoves\b/gi, 'пушит олл-ин'],
    [/\ball-in\b/gi, 'олл-ин'],
    [/\bpot\b/gi, 'банк'],
    [/\bBB\b/g, 'ББ']
  ];
  replacements.forEach(([regex, rus]) => {
    s = s.replace(regex, rus);
  });
  return s;
}

function hasCyrillicText(str) {
  if (!str || typeof str !== 'string') return false;
  const cyrillicMatches = str.match(/[а-яА-ЯёЁ]/g);
  return Boolean(cyrillicMatches && cyrillicMatches.length >= 4);
}

function buildFallbackRussianExplanation(street, heroPos, villainPos, heroCards) {
  const gto = street.gtoAction || {};
  const actionMap = {
    fold: 'дисциплинированный пас (фолд)',
    check: 'чек для контроля банка и защиты спектра',
    call: `колл ${fmtBB(street.toCall)} ББ по шансам банка`,
    bet: `ставку ${fmtBB(gto.minOptimalSize || street.minBet || 2.5)}–${fmtBB(
      gto.maxOptimalSize || street.minBet || 4.0
    )} ББ`,
    raise: `рейз до ${fmtBB(gto.minOptimalSize || street.minRaise || 6.0)}–${fmtBB(
      gto.maxOptimalSize || street.effectiveStack
    )} ББ`
  };
  const actText = actionMap[gto.type] || 'оптимальное действие по GTO';
  const boardText =
    street.board && street.board.length > 0 ? `на доске ${street.board.join(' ')}` : 'на префлопе';
  return `С рукой ${heroCards.join(' ')} на позиции ${heroPos} против ${villainPos} ${boardText} (банк ${fmtBB(
    street.potBeforeAction
  )} ББ, эффективный стек ${fmtBB(
    street.effectiveStack
  )} ББ) эталонным решением по GTO является ${actText}. Это решение позволяет оптимально реализовать эквити нашей руки против спектра продолжения соперника и избежать потери фишек против верхушки его диапазона.`;
}

function sanitizeAiGeneratedScenario(rawScenario, targetMode = 'chipev_8max') {
  if (!rawScenario || !Array.isArray(rawScenario.streets) || rawScenario.streets.length === 0) {
    return rawScenario;
  }

  // 1. Жесткая нормализация позиций Героя и Оппонента (чтобы они НИКОГДА не пропадали со стола)
  const cleanHeroPos = normalizePokerPosition(
    rawScenario.heroPos,
    targetMode,
    targetMode === 'headsup' ? 'BTN' : 'BTN'
  );
  let cleanVillainPos = normalizePokerPosition(
    rawScenario.villainPos,
    targetMode,
    targetMode === 'headsup' ? 'BB' : 'BB'
  );

  if (cleanVillainPos === cleanHeroPos) {
    if (targetMode === 'headsup') {
      cleanVillainPos = cleanHeroPos === 'BTN' ? 'BB' : 'BTN';
    } else {
      cleanVillainPos = cleanHeroPos === 'BB' ? 'BTN' : 'BB';
    }
  }

  // 2. Гарантия двух валидных карт у Героя
  const rawHeroCards = Array.isArray(rawScenario.heroCards) ? rawScenario.heroCards : [];
  const card1 = normalizeCardString(rawHeroCards[0], 'A♠');
  let card2 = normalizeCardString(rawHeroCards[1], 'K♠');
  if (card1 === card2) {
    card2 = card1 === 'A♠' ? 'K♠' : 'A♠';
  }
  const cleanHeroCards = [card1, card2];

  const firstStreet = rawScenario.streets[0];
  const rawStack =
    Number(rawScenario.effectiveStackStart) || Number(firstStreet.effectiveStack) || 35;
  const rawPot = Number(firstStreet.potBeforeAction) || 6;

  let chipDivisor = 1;
  if (rawStack > 120 || rawPot > 120) {
    const standardBlinds = [
      100, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000,
      6000, 8000, 10000, 15000, 20000, 25000, 50000, 100000
    ];
    let bestBlind = Math.max(100, Math.round(rawStack / 35));
    let bestDiff = Infinity;
    for (const candidate of standardBlinds) {
      const resultingStack = rawStack / candidate;
      if (resultingStack >= 18 && resultingStack <= 65) {
        const diff = Math.abs(resultingStack - 35);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestBlind = candidate;
        }
      }
    }
    chipDivisor = bestBlind;
  }

  const normNum = (val, fallback = 0) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return fallback;
    const divided = chipDivisor > 1 ? n / chipDivisor : n;
    return Math.max(0, Math.round(divided * 10) / 10);
  };

  const normText = str => {
    if (!str || typeof str !== 'string') return '';
    let cleaned = translatePokerEnglishToRussian(str.replace(/\bT([♠♥♦♣s])/g, '10$1'));
    if (chipDivisor > 1) {
      cleaned = cleaned.replace(/\b(\d{3,7})\b/g, match => {
        const val = Number(match);
        if (val >= chipDivisor * 0.4) {
          return `${fmtBB(val / chipDivisor)} ББ`;
        }
        return match;
      });
      cleaned = cleaned.replace(/ББ\s+ББ/g, 'ББ');
    }
    return cleaned;
  };

  const cleanStartStack = Math.min(
    100,
    Math.max(12, normNum(rawScenario.effectiveStackStart || firstStreet.effectiveStack, 35))
  );

  const sanitizedStreets = rawScenario.streets.map(st => {
    const pot = Math.max(1.5, normNum(st.potBeforeAction, 6.0));
    const effStack = Math.max(1, normNum(st.effectiveStack, cleanStartStack));
    const toCall = Math.min(effStack, Math.max(0, normNum(st.toCall, 0)));
    const minRaise =
      toCall > 0
        ? Math.min(effStack, Math.max(toCall * 2, normNum(st.minRaise, toCall * 2.2)))
        : Math.min(effStack, Math.max(1, normNum(st.minRaise, Math.round(pot * 0.33 * 10) / 10)));

    const gto = st.gtoAction || {};
    const gtoType = ['fold', 'check', 'call', 'bet', 'raise'].includes(
      String(gto.type || '').toLowerCase()
    )
      ? String(gto.type).toLowerCase()
      : toCall > 0
      ? 'call'
      : 'check';

    let minOpt = gto.minOptimalSize != null ? normNum(gto.minOptimalSize, minRaise) : undefined;
    let maxOpt = gto.maxOptimalSize != null ? normNum(gto.maxOptimalSize, effStack) : undefined;
    if (minOpt !== undefined && maxOpt !== undefined && minOpt > maxOpt) {
      const tmp = minOpt;
      minOpt = maxOpt;
      maxOpt = tmp;
    }

    const pct = pot > 0 && toCall > 0 ? Math.round((toCall / pot) * 100) : 0;
    const cleanBadge = toCall > 0 ? `Бет ${fmtBB(toCall)} ББ (${pct}%)` : 'Чек';

    const cleanBoard = (st.board || []).map(c => normalizeCardString(c, '2♣'));
    const defaultStreetName =
      cleanBoard.length === 0
        ? 'Префлоп'
        : cleanBoard.length === 3
        ? 'Флоп'
        : cleanBoard.length === 4
        ? 'Терн'
        : 'Ривер';

    const rawStreetName = normText(st.name || defaultStreetName);
    const cleanStreetName = hasCyrillicText(rawStreetName) ? rawStreetName : defaultStreetName;

    let cleanExplanation = normText(gto.explanation);
    if (!hasCyrillicText(cleanExplanation)) {
      cleanExplanation = buildFallbackRussianExplanation(
        {
          board: cleanBoard,
          potBeforeAction: pot,
          effectiveStack: effStack,
          toCall,
          minBet: minRaise,
          minRaise,
          gtoAction: { type: gtoType, minOptimalSize: minOpt, maxOptimalSize: maxOpt }
        },
        cleanHeroPos,
        cleanVillainPos,
        cleanHeroCards
      );
    }

    let cleanSizingNote = normText(gto.sizingNote);
    if (!hasCyrillicText(cleanSizingNote)) {
      cleanSizingNote =
        gtoType === 'bet' || gtoType === 'raise'
          ? `Оптимальный размер: ${fmtBB(minOpt || minRaise)}–${fmtBB(maxOpt || effStack)} ББ`
          : gtoType === 'call'
          ? `Колл ${fmtBB(toCall)} ББ`
          : gtoType === 'fold'
          ? 'Дисциплинированный пас'
          : 'Чек';
    }

    const rawHistory = Array.isArray(st.actionHistory) ? st.actionHistory : [];
    const cleanHistory =
      rawHistory.length > 0
        ? rawHistory.map(h => ({
            street: normText(h.street || 'Префлоп'),
            text: normText(h.text || `${cleanVillainPos} против ${cleanHeroPos}`)
          }))
        : [
            {
              street: 'Префлоп',
              text: `${cleanVillainPos} и ${cleanHeroPos} разыгрывают банк ${fmtBB(pot)} ББ`
            },
            {
              street: cleanStreetName,
              text:
                toCall > 0
                  ? `${cleanVillainPos} ставит ${fmtBB(toCall)} ББ в банк ${fmtBB(pot)} ББ`
                  : `Слово переходит к ${cleanHeroPos} (банк ${fmtBB(pot)} ББ)`
            }
          ];

    return {
      ...st,
      name: cleanStreetName,
      board: cleanBoard,
      potBeforeAction: pot,
      effectiveStack: effStack,
      toCall,
      minRaise,
      villainLastActionBadge: cleanBadge,
      villainActionText: hasCyrillicText(normText(st.villainActionText))
        ? normText(st.villainActionText)
        : toCall > 0
        ? `Оппонент (${cleanVillainPos}) ставит ${fmtBB(toCall)} ББ в банк ${fmtBB(pot)} ББ.`
        : `Оппонент (${cleanVillainPos}) чекает. Банк ${fmtBB(pot)} ББ.`,
      actionHistory: cleanHistory,
      gtoAction: {
        ...gto,
        type: gtoType,
        minOptimalSize: minOpt,
        maxOptimalSize: maxOpt,
        optimalTags: Array.isArray(gto.optimalTags)
          ? [...new Set(gto.optimalTags.map(normalizeScenarioTag))]
          : ['pot_control'],
        trapTags: Array.isArray(gto.trapTags)
          ? [...new Set(gto.trapTags.map(normalizeScenarioTag))]
          : [],
        explanation: cleanExplanation,
        sizingNote: cleanSizingNote
      }
    };
  });

  const rawTitle = normText(rawScenario.title);
  const cleanTitle = hasCyrillicText(rawTitle)
    ? rawTitle
    : `ИИ-Спот: ${cleanHeroCards.join('')} на ${cleanHeroPos} против ${cleanVillainPos}`;

  return {
    ...rawScenario,
    mode: targetMode,
    heroPos: cleanHeroPos,
    villainPos: cleanVillainPos,
    title: cleanTitle,
    blindsInfo: `Анте 1 ББ • Эфф. стек ${fmtBB(cleanStartStack)} ББ`,
    effectiveStackStart: cleanStartStack,
    heroCards: cleanHeroCards,
    streets: sanitizedStreets
  };
}

// ============================================================================
// БОЛЬШАЯ ВСТРОЕННАЯ БАЗА РАЗНООБРАЗНЫХ СЦЕНАРИЕВ (15 МНОГОУЛИЧНЫХ РАЗДАЧ)
// ============================================================================

const SCENARIOS = [
  // 1. K♣ J♣ на BB vs HJ (Сухая доска, контроль банка и блеф-кетч ривера)
  {
    id: 'chipev_1',
    mode: 'chipev_8max',
    title: 'Раздача #1: K♣J♣ на BB — Пот-контроль и блокеры на ривере',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 35 ББ',
    effectiveStackStart: 35,
    heroPos: 'BB',
    villainPos: 'HJ',
    heroCards: ['K♣', 'J♣'],
    seats: [
      { pos: 'UTG', stack: 38, active: false },
      { pos: 'UTG+1', stack: 31, active: false },
      { pos: 'LJ', stack: 42, active: false },
      { pos: 'HJ', stack: 35, active: true, isVillain: true },
      { pos: 'CO', stack: 29, active: false },
      { pos: 'BTN', stack: 48, active: false },
      { pos: 'SB', stack: 24, active: false },
      { pos: 'BB', stack: 35, active: true, isHero: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['J♥', '7♠', '4♦'],
        potBeforeAction: 5.7,
        effectiveStack: 32.9,
        villainLastActionBadge: 'Бет 1.8 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'HJ рейз 2.1 ББ → Hero (BB) колл (Банк: 5.7 ББ)'
          },
          {
            street: 'Флоп [J♥ 7♠ 4♦]',
            text: 'Hero чек → HJ ставит контбет 1.8 ББ (32% банка)'
          }
        ],
        villainActionText: 'HJ ставит мелкий контбет 1.8 ББ на сухой радужной доске.',
        toCall: 1.8,
        minRaise: 4.5,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['pot_control', 'protect_check_range', 'dry_board'],
          trapTags: ['trap_fold_worse'],
          explanation:
            'На сухой доске J♥ 7♠ 4♦ чек-рейз с топ-парой заставит соперника выбросить весь воздух и слабые руки (A8s, KQ, мелкие пары), которые мы доминируем, и изолирует нас против сетов (77, 44) и оверпар. Колл сохраняет все его блефы в банке.',
          sizingNote: 'Спокойный колл 1.8 ББ.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '77', '44', 'AJs'],
          medium: ['1010', '99', '88', 'KJs', 'QJs', 'J10s'],
          draws: ['109s', '98s', '65s'],
          bluffs: ['AKo', 'AQo', 'KQo', 'A10s', 'A8s', 'K10s']
        }
      },
      {
        name: 'Ривер',
        board: ['J♥', '7♠', '4♦', '2♠', 'Q♦'],
        potBeforeAction: 9.3,
        effectiveStack: 31.1,
        villainLastActionBadge: 'Бет 4.5 ББ',
        actionHistory: [
          {
            street: 'Флоп [J♥ 7♠ 4♦]',
            text: 'Hero чек-колл 1.8 ББ (Банк: 9.3 ББ)'
          },
          {
            street: 'Терн [2♠]',
            text: 'Hero чек → HJ чек вдогонку (спектр соперника капнут)'
          },
          {
            street: 'Ривер [Q♦]',
            text: 'Hero чек → HJ ставит 4.5 ББ (48% банка)'
          }
        ],
        villainActionText: 'После чека на терне соперник ставит 4.5 ББ по выходу дамы на ривере.',
        toCall: 4.5,
        minRaise: 11.0,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['protect_check_range', 'blockers_factor', 'pot_control'],
          trapTags: ['fold_behind'],
          explanation:
            'Чекнув бланковый терн 2♠, оппонент капнул свой диапазон (там почти нет сетов и оверпар). А твои K♣ и J♣ блокируют главные комбинации с дамой (KQ и QJ), не блокируя его промазавшие А-хай и стрит-дро. Идеальный блеф-кетч коллом!',
          sizingNote: 'Колл 4.5 ББ по шансам банка.'
        },
        rangeMatrix: {
          value: ['AQo', 'KQo', 'QJs'],
          medium: ['1010', '99', '88', 'J10s'],
          draws: [],
          bluffs: ['AKo', 'A10s', 'A9s', 'A8s', '109s', '98s', '65s']
        }
      }
    ]
  },

  // 2. 9♦ 8♦ на BB vs LJ (Монстр комбо-дро 15 аутов и геометрия пуша)
  {
    id: 'chipev_2',
    mode: 'chipev_8max',
    title: 'Раздача #2: 9♦8♦ — Комбо-дро (15 аутов) и геометрия стека',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 30 ББ',
    effectiveStackStart: 30,
    heroPos: 'BB',
    villainPos: 'LJ',
    heroCards: ['9♦', '8♦'],
    seats: [
      { pos: 'UTG', stack: 40, active: false },
      { pos: 'UTG+1', stack: 27, active: false },
      { pos: 'LJ', stack: 30, active: true, isVillain: true },
      { pos: 'HJ', stack: 35, active: false },
      { pos: 'CO', stack: 50, active: false },
      { pos: 'BTN', stack: 22, active: false },
      { pos: 'SB', stack: 31, active: false },
      { pos: 'BB', stack: 30, active: true, isHero: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['7♦', '6♣', '2♦'],
        potBeforeAction: 5.9,
        effectiveStack: 27.8,
        villainLastActionBadge: 'Бет 3 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'LJ рейз 2.2 ББ → Hero (BB) колл (Банк: 5.9 ББ)'
          },
          {
            street: 'Флоп [7♦ 6♣ 2♦]',
            text: 'Hero чек → LJ ставит плотный контбет 3 ББ (51% банка)'
          }
        ],
        villainActionText: 'LJ ставит 3 ББ в банк 5.9 ББ. У тебя стрит-дро + флеш-дро (15 чистых аутов).',
        toCall: 3.0,
        minRaise: 7.5,
        gtoAction: {
          type: 'raise',
          acceptableTypes: ['raise'],
          minOptimalSize: 22.0,
          maxOptimalSize: 27.8,
          optimalTags: ['semibluff_equity', 'spr_icm_control'],
          trapTags: ['pot_control'],
          explanation:
            'Неполный чек-рейз (до 8–9 ББ) загонит тебя в капкан SPR ≈ 1 на бланковом терне без позиции. А олл-ин 27.8 ББ генерирует максимум фолд-эквити (выбивает AK, AQ, 88–1010) и гарантирует 100% реализацию твоих 54% эквити даже при колле от тузов (AA)!',
          sizingNote: 'Чек-рейз олл-ин 27.8 ББ.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '77', '66', '22'],
          medium: ['1010', '99', '88', 'A7s'],
          draws: ['A♦K♦', 'A♦Q♦', 'A♦J♦', 'K♦Q♦'],
          bluffs: ['AKo', 'AQo', 'KQo']
        }
      }
    ]
  },

  // 3. J♠ J♣ на BTN vs UTG (3-бет банк и доска A-K-4)
  {
    id: 'chipev_3',
    mode: 'chipev_8max',
    title: 'Раздача #3: J♠J♣ в 3-бет банке на доске A♥K♦4♠',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 25 ББ',
    effectiveStackStart: 25,
    heroPos: 'BTN',
    villainPos: 'UTG',
    heroCards: ['J♠', 'J♣'],
    seats: [
      { pos: 'UTG', stack: 25, active: true, isVillain: true },
      { pos: 'UTG+1', stack: 34, active: false },
      { pos: 'LJ', stack: 28, active: false },
      { pos: 'HJ', stack: 41, active: false },
      { pos: 'CO', stack: 19, active: false },
      { pos: 'BTN', stack: 25, active: true, isHero: true },
      { pos: 'SB', stack: 30, active: false },
      { pos: 'BB', stack: 36, active: false }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['A♥', 'K♦', '4♠'],
        potBeforeAction: 14.5,
        effectiveStack: 19.0,
        villainLastActionBadge: 'Чек',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'UTG рейз 2 ББ → Hero (BTN) 3-бет 6 ББ → UTG колл (Банк: 14.5 ББ)'
          },
          {
            street: 'Флоп [A♥ K♦ 4♠]',
            text: 'UTG чекает. Слово за Hero в позиции.'
          }
        ],
        villainActionText: 'UTG чекает на флопе с тузом и королем.',
        toCall: 0,
        minBet: 3.5,
        gtoAction: {
          type: 'check',
          acceptableTypes: ['check'],
          optimalTags: ['pot_control', 'dry_board'],
          trapTags: ['trap_fold_worse', 'value_bet'],
          explanation:
            'Классическая ситуация Way Ahead / Way Behind (WA/WB). Диапазон колла 3-бета от UTG на 80% состоит из Ax и Kx. Ставкой с JJ ты выбьешь только карманные 1010 (у которых 2 аута) и подаришь фишки всем тузам и королям.',
          sizingNote: 'Бесплатный чек вдогонку.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'AKs', 'AKo', 'AQs', 'AQo', 'AJs', 'KQs'],
          medium: ['QQ', '1010', '99'],
          draws: ['QJs', 'J10s'],
          bluffs: []
        }
      },
      {
        name: 'Терн',
        board: ['A♥', 'K♦', '4♠', '7♣'],
        potBeforeAction: 14.5,
        effectiveStack: 19.0,
        villainLastActionBadge: 'Бет 5 ББ',
        actionHistory: [
          {
            street: 'Флоп [A♥ K♦ 4♠]',
            text: 'UTG чек → Hero (BTN) чек вдогонку'
          },
          {
            street: 'Терн [7♣]',
            text: 'UTG ставит отложенный бет 5 ББ (34% банка)'
          }
        ],
        villainActionText: 'На бланковой семерке UTG ставит 5 ББ в банк 14.5 ББ.',
        toCall: 5.0,
        minRaise: 12.0,
        gtoAction: {
          type: 'fold',
          acceptableTypes: ['fold'],
          optimalTags: ['fold_behind', 'spr_icm_control'],
          trapTags: ['trap_pot_committed'],
          explanation:
            'Отложенная ставка от UTG на A-K-4-7 после твоего чека на флопе — это прямой добор с AQs, AJs или KQs. Твои валеты бьют только карманные десятки, которые никогда не блефуют в такой линии. Сохраняем рабочий стек 19 ББ.',
          sizingNote: 'Дисциплинированный пас.'
        },
        rangeMatrix: {
          value: ['AKs', 'AQs', 'AQo', 'AJs', 'A10s', 'KQs'],
          medium: ['QQ', '1010'],
          draws: [],
          bluffs: ['QJs']
        }
      }
    ]
  },

  // 4. Q♠ Q♦ на CO vs BB (Анти-блокер Q♠ против овербета на ривере)
  {
    id: 'chipev_4',
    mode: 'chipev_8max',
    title: 'Раздача #4: Q♠Q♦ — Ловушка анти-блокера Q♠ на овербет ривера',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 45 ББ',
    effectiveStackStart: 45,
    heroPos: 'CO',
    villainPos: 'BB',
    heroCards: ['Q♠', 'Q♦'],
    seats: [
      { pos: 'UTG', stack: 45, active: false },
      { pos: 'UTG+1', stack: 45, active: false },
      { pos: 'LJ', stack: 45, active: false },
      { pos: 'HJ', stack: 45, active: false },
      { pos: 'CO', stack: 45, active: true, isHero: true },
      { pos: 'BTN', stack: 45, active: false },
      { pos: 'SB', stack: 45, active: false },
      { pos: 'BB', stack: 45, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Ривер',
        board: ['K♣', '8♠', '4♠', '2♥', '6♦'],
        potBeforeAction: 13.9,
        effectiveStack: 38.8,
        villainLastActionBadge: 'Овербет 20 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Hero (CO) рейз 2.2 ББ → BB колл (Банк: 5.9 ББ)'
          },
          {
            street: 'Флоп [K♣ 8♠ 4♠]',
            text: 'BB чек → Hero чек вдогонку (пот-контроль со второй парой)'
          },
          {
            street: 'Терн [2♥]',
            text: 'BB бет 4 ББ → Hero колл 4 ББ (Банк: 13.9 ББ)'
          },
          {
            street: 'Ривер [6♦]',
            text: 'Все пиковые дро промазали. BB ставит овербет 20 ББ (144% банка)!'
          }
        ],
        villainActionText: 'Регуляр на BB ставит полярный овербет 20 ББ в банк 13.9 ББ.',
        toCall: 20.0,
        minRaise: 38.8,
        gtoAction: {
          type: 'fold',
          acceptableTypes: ['fold'],
          optimalTags: ['blockers_factor', 'fold_behind'],
          trapTags: ['trap_pot_committed'],
          explanation:
            'Овербет 144% банка поляризован (натсы против промазавших пиковых флеш-дро). Но у тебя в руке Q♠! Ты сам блокируешь главные блефы соперника (A♠Q♠, Q♠J♠, Q♠10♠, Q♠9♠), резко смещая его спектр в сторону сетов, доперов и стрита 75s. Колл терна не обязывает платить овербет ривера.',
          sizingNote: 'Пас из-за ужасного анти-блокера Q♠.'
        },
        rangeMatrix: {
          value: ['88', '44', '22', 'K8s', 'K6s', '75s'],
          medium: ['KQs', 'KJs'],
          draws: [],
          bluffs: ['J10s', '109s', '97s', 'A5s']
        }
      }
    ]
  },

  // 5. A♠ Q♣ на BTN vs LJ (3-бет банк, стоп-кран по SPR на терне и блокер A♠ на ривере)
  {
    id: 'chipev_5',
    mode: 'chipev_8max',
    title: 'Раздача #5: A♠Q♣ в 3-бет банке (Тормоз по SPR и блокер A♠)',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 50 ББ',
    effectiveStackStart: 50,
    heroPos: 'BTN',
    villainPos: 'LJ',
    heroCards: ['A♠', 'Q♣'],
    seats: [
      { pos: 'UTG', stack: 44, active: false },
      { pos: 'UTG+1', stack: 39, active: false },
      { pos: 'LJ', stack: 50, active: true, isVillain: true },
      { pos: 'HJ', stack: 31, active: false },
      { pos: 'CO', stack: 47, active: false },
      { pos: 'BTN', stack: 50, active: true, isHero: true },
      { pos: 'SB', stack: 28, active: false },
      { pos: 'BB', stack: 52, active: false }
    ],
    streets: [
      {
        name: 'Терн',
        board: ['J♦', '6♠', '3♥', '10♠'],
        potBeforeAction: 32.5,
        effectiveStack: 35.0,
        villainLastActionBadge: 'Чек',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'LJ рейз 2.2 ББ → Hero (BTN) 3-бет 7 ББ → LJ колл (Банк 16.5 ББ)'
          },
          {
            street: 'Флоп [J♦ 6♠ 3♥]',
            text: 'LJ чек → Hero бет 8 ББ → LJ колл (Банк 32.5 ББ)'
          },
          {
            street: 'Терн [10♠]',
            text: 'LJ чекает. В банке 32.5 ББ, стек 35 ББ (SPR = 1.08).'
          }
        ],
        villainActionText: 'После колла на сухом флопе LJ чекает на терне 10♠. SPR равен 1.08.',
        toCall: 0,
        minBet: 8.0,
        gtoAction: {
          type: 'check',
          acceptableTypes: ['check'],
          optimalTags: ['spr_icm_control', 'pot_control'],
          trapTags: ['trap_fold_worse', 'value_bet'],
          explanation:
            'При SPR ≈ 1 любая ставка привяжет тебя к банку, а 10♠ усилила диапазон колла LJ (J10s, 1010, пиковые дро). Чеком вдогонку мы бесплатно реализуем свои 4 аута на натсовый стрит (короли) и 6 аутов на топ-пару.',
          sizingNote: 'Бесплатный чек вдогонку при SPR = 1.08.'
        },
        rangeMatrix: {
          value: ['JJ', '1010', '66', 'AJs', 'KJs', 'QJs', 'J10s'],
          medium: ['99', '88', '77'],
          draws: ['A♠K♠', 'K♠Q♠', 'Q♠9♠'],
          bluffs: ['A10s', 'K10s']
        }
      },
      {
        name: 'Ривер',
        board: ['J♦', '6♠', '3♥', '10♠', '2♣'],
        potBeforeAction: 32.5,
        effectiveStack: 35.0,
        villainLastActionBadge: 'Бет 12 ББ',
        actionHistory: [
          {
            street: 'Флоп [J♦ 6♠ 3♥]',
            text: 'LJ чек-колл 8 ББ (Банк 32.5 ББ)'
          },
          {
            street: 'Терн [10♠]',
            text: 'LJ чек → Hero (BTN) чек вдогонку'
          },
          {
            street: 'Ривер [2♣]',
            text: 'Бланк 2♣. LJ ставит 12 ББ (37% банка).'
          }
        ],
        villainActionText: 'На бланковом ривере 2♣ регуляр ставит доборный блок-бет 12 ББ.',
        toCall: 12.0,
        minRaise: 35.0,
        gtoAction: {
          type: 'fold',
          acceptableTypes: ['fold'],
          optimalTags: ['fold_behind', 'blockers_factor'],
          trapTags: ['trap_pot_committed'],
          explanation:
            'Флоп J-6-3 был радужным, поэтому в спектре колла флопа у LJ почти не было флеш-дро. Более того, у тебя в руке A♠, который блокирует его редкие пиковые блефы с терна. Ставка 12 ББ от регуляра — это тонкий добор с валетом (AJ, KJ, QJ). Спокойный пас.',
          sizingNote: 'Дисциплинированный фолд.'
        },
        rangeMatrix: {
          value: ['JJ', '1010', '66', 'AJs', 'KJs', 'QJs', 'J10s'],
          medium: ['99', '88'],
          draws: [],
          bluffs: ['K♠Q♠']
        }
      }
    ]
  },

  // 6. A♠ A♣ на CO vs BB (Спаренная доска 8♥ 8♦ 5♠ — ловушка и защита спектра)
  {
    id: 'chipev_6',
    mode: 'chipev_8max',
    title: 'Раздача #6: A♠A♣ на спаренной доске 8♥8♦5♠ (Реакция на чек-рейз)',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 38 ББ',
    effectiveStackStart: 38,
    heroPos: 'CO',
    villainPos: 'BB',
    heroCards: ['A♠', 'A♣'],
    seats: [
      { pos: 'UTG', stack: 35, active: false },
      { pos: 'UTG+1', stack: 41, active: false },
      { pos: 'LJ', stack: 29, active: false },
      { pos: 'HJ', stack: 54, active: false },
      { pos: 'CO', stack: 38, active: true, isHero: true },
      { pos: 'BTN', stack: 44, active: false },
      { pos: 'SB', stack: 22, active: false },
      { pos: 'BB', stack: 38, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['8♥', '8♦', '5♠'],
        potBeforeAction: 7.5,
        effectiveStack: 34.0,
        villainLastActionBadge: 'Чек-рейз 5.5 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Hero (CO) рейз 2.2 ББ → BB колл (Банк 5.9 ББ)'
          },
          {
            street: 'Флоп [8♥ 8♦ 5♠]',
            text: 'BB чек → Hero бет 1.6 ББ → BB чек-рейз до 5.5 ББ!'
          }
        ],
        villainActionText: 'На спаренном флопе 8-8-5 соперник на BB чек-рейзит твой мелкий контбет до 5.5 ББ.',
        toCall: 3.9,
        minRaise: 11.0,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['pot_control', 'protect_check_range', 'dry_board'],
          trapTags: ['trap_fold_worse'],
          explanation:
            'На спаренной доске 8-8-5 чек-рейз от BB содержит много блефов (гатшоты 76s, 97s, 64s, оверкарты с бэкдорами) и редкие трипсы (A8, K8, 98). Если сделать 3-бет на флопе с АА, ты выбьешь 100% его блефов и останешься только против трипсов 8x и фулл-хауса 55. Колл в позиции оставляет его блефы в игре!',
          sizingNote: 'Колл 3.9 ББ в позиции (ловушка с АА).'
        },
        rangeMatrix: {
          value: ['55', 'A8s', 'K8s', 'Q8s', '98s', '87s'],
          medium: ['99', '77', '66', 'A5s'],
          draws: ['76s', '64s', '97s', '96s'],
          bluffs: ['A♠9♠', 'K♠J♠', 'Q♠10♠', 'J♠10♠']
        }
      }
    ]
  },

  // 7. A♦ J♦ на HJ vs BB (Тонкий добор на ривере против капнутого диапазона)
  {
    id: 'chipev_7',
    mode: 'chipev_8max',
    title: 'Раздача #7: A♦J♦ — Тонкий добор на ривере против капнутого спектра',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 35 ББ',
    effectiveStackStart: 35,
    heroPos: 'HJ',
    villainPos: 'BB',
    heroCards: ['A♦', 'J♦'],
    seats: [
      { pos: 'UTG', stack: 40, active: false },
      { pos: 'UTG+1', stack: 32, active: false },
      { pos: 'LJ', stack: 27, active: false },
      { pos: 'HJ', stack: 35, active: true, isHero: true },
      { pos: 'CO', stack: 45, active: false },
      { pos: 'BTN', stack: 38, active: false },
      { pos: 'SB', stack: 29, active: false },
      { pos: 'BB', stack: 35, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Ривер',
        board: ['J♠', '6♣', '2♥', '4♣', '9♦'],
        potBeforeAction: 9.7,
        effectiveStack: 30.9,
        villainLastActionBadge: 'Чек',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Hero (HJ) рейз 2.1 ББ → BB колл (Банк 5.7 ББ)'
          },
          {
            street: 'Флоп [J♠ 6♣ 2♥]',
            text: 'BB чек → Hero бет 2 ББ → BB колл (Банк 9.7 ББ)'
          },
          {
            street: 'Терн [4♣]',
            text: 'BB чек → Hero чек вдогонку для пот-контроля'
          },
          {
            street: 'Ривер [9♦]',
            text: 'На ривере 9♦ игрок на BB снова чекает (в банке 9.7 ББ).'
          }
        ],
        villainActionText: 'После твоего чека на терне BB не стал ставить ривер и прочекал второй раз.',
        toCall: 0,
        minBet: 2.5,
        gtoAction: {
          type: 'bet',
          acceptableTypes: ['bet'],
          minOptimalSize: 5.0,
          maxOptimalSize: 7.5,
          optimalTags: ['value_bet', 'protect_check_range'],
          trapTags: ['pot_control'],
          explanation:
            'Чекнув ривер после твоего чека на терне, соперник на BB полностью капнул свой спектр: там нет сетов или двух пар (с ними он бы сам ставил ривер). Зато у него масса KJ, QJ, J10, 109, 98 и карманок 77–88, которые обязаны вскрывать твою отложенную ставку! Чек вдогонку с A-J здесь — огромная потеря вэлью.',
          sizingNote: 'Плотный доборный бет 5.5–7.0 ББ (60–70% банка).'
        },
        rangeMatrix: {
          value: ['J9s', '66'],
          medium: ['KJs', 'QJs', 'J10s', '109s', '98s', '88', '77', 'A6s'],
          draws: [],
          bluffs: ['A♣8♣', 'K♣10♣', 'Q♣10♣', '87s', '75s']
        }
      }
    ]
  },

  // 8. A♣ K♦ на CO vs BTN (Дисциплинированный пас топ-пары на 4-флеш/стрит доске)
  {
    id: 'chipev_8',
    mode: 'chipev_8max',
    title: 'Раздача #8: A♣K♦ — Пас топ-пары на опасном ривере',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 40 ББ',
    effectiveStackStart: 40,
    heroPos: 'CO',
    villainPos: 'BTN',
    heroCards: ['A♣', 'K♦'],
    seats: [
      { pos: 'UTG', stack: 33, active: false },
      { pos: 'UTG+1', stack: 42, active: false },
      { pos: 'LJ', stack: 37, active: false },
      { pos: 'HJ', stack: 28, active: false },
      { pos: 'CO', stack: 40, active: true, isHero: true },
      { pos: 'BTN', stack: 40, active: true, isVillain: true },
      { pos: 'SB', stack: 51, active: false },
      { pos: 'BB', stack: 24, active: false }
    ],
    streets: [
      {
        name: 'Ривер',
        board: ['K♠', 'J♠', '10♣', '4♠', 'Q♥'],
        potBeforeAction: 22.0,
        effectiveStack: 29.5,
        villainLastActionBadge: 'Олл-ин 29.5 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Hero (CO) рейз 2.2 ББ → BTN колл (Банк 5.9 ББ)'
          },
          {
            street: 'Флоп [K♠ J♠ 10♣]',
            text: 'Hero бет 3 ББ → BTN колл (Банк 11.9 ББ)'
          },
          {
            street: 'Терн [4♠]',
            text: 'Закрылся пиковый флеш. Hero чек → BTN бет 5 ББ → Hero колл (Банк 22 ББ)'
          },
          {
            street: 'Ривер [Q♥]',
            text: 'На доске 4-стрит (K-J-10-Q) и 3-флеш. Hero чек → BTN пушит 29.5 ББ!'
          }
        ],
        villainActionText: 'На доске K♠ J♠ 10♣ 4♠ Q♥ баттон ставит олл-ин 29.5 ББ в банк 22 ББ.',
        toCall: 29.5,
        minRaise: 29.5,
        gtoAction: {
          type: 'fold',
          acceptableTypes: ['fold'],
          optimalTags: ['fold_behind', 'blockers_factor'],
          trapTags: ['trap_pot_committed'],
          explanation:
            'На доске закрылись и пиковый флеш, и стрит по любому тузу или девятке. Наша рука A♣ K♦ — худший возможный блеф-кетчер: у нас нет пикового блокера (у соперника все пиковые флеши в строю), а туз в нашей руке лишь делит банк с чужими тузами и проигрывает любому флешу. Вложения на прошлых улицах уже не важны — легкий пас.',
          sizingNote: 'Железобетонный пас на ривере.'
        },
        rangeMatrix: {
          value: ['A♠9♠', 'Q♠9♠', '9♠8♠', 'A♠5♠', 'AQo', 'AJs', 'A10s', 'KJs', 'JJ', '1010'],
          medium: ['KQo', 'QJs'],
          draws: [],
          bluffs: ['87s']
        }
      }
    ]
  },

  // 9. Q♣ J♣ на BB vs CO (Колл по шансам банка с двусторонкой OESD + бэкдор ФД)
  {
    id: 'chipev_9',
    mode: 'chipev_8max',
    title: 'Раздача #9: Q♣J♣ на BB — Шансы банка с OESD против мелкой ставки',
    blindsInfo: '8-Max • Анте 1 ББ • Эфф. стек 32 ББ',
    effectiveStackStart: 32,
    heroPos: 'BB',
    villainPos: 'CO',
    heroCards: ['Q♣', 'J♣'],
    seats: [
      { pos: 'UTG', stack: 40, active: false },
      { pos: 'UTG+1', stack: 35, active: false },
      { pos: 'LJ', stack: 29, active: false },
      { pos: 'HJ', stack: 48, active: false },
      { pos: 'CO', stack: 32, active: true, isVillain: true },
      { pos: 'BTN', stack: 26, active: false },
      { pos: 'SB', stack: 39, active: false },
      { pos: 'BB', stack: 32, active: true, isHero: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['10♠', '9♦', '2♣'],
        potBeforeAction: 5.7,
        effectiveStack: 29.9,
        villainLastActionBadge: 'Бет 1.9 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'CO рейз 2.1 ББ → Hero (BB) колл (Банк 5.7 ББ)'
          },
          {
            street: 'Флоп [10♠ 9♦ 2♣]',
            text: 'Hero чек → CO ставит 1.9 ББ (33% банка)'
          }
        ],
        villainActionText: 'CO ставит мелкий контбет 1.9 ББ. У тебя двустороннее стрит-дро (8 аутов) + две оверкарты + бэкдорное трефовое флеш-дро.',
        toCall: 1.9,
        minRaise: 5.2,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call', 'raise'],
          optimalTags: ['pot_control', 'semibluff_equity'],
          trapTags: ['fold_behind'],
          explanation:
            'Для колла 1.9 ББ в банк 5.7 ББ нам нужно всего 20% эквити. А у Q♣ J♣ (8 чистых аутов на натсовый стрит + 6 аутов на топ-пару + бэкдорный флеш) около 42% эквити против спектра контбета CO! Спокойный колл позволяет дешево реализовать эквити без раздувания банка без позиции.',
          sizingNote: 'Плюсовый колл 1.9 ББ по шансам банка (нужно 20%, у нас ~42%).'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '22', 'A10s', 'K10s'],
          medium: ['Q10s', 'J10s', '109s', 'A9s', '88', '77'],
          draws: ['QJs', 'J8s', '87s', '76s'],
          bluffs: ['AKo', 'AQo', 'AJo', 'KQo', 'A5s', 'KJs']
        }
      }
    ]
  },

  // 10. БАББЛ / ICM: 9♠ 9♥ на BB vs BTN
  {
    id: 'bubble_1',
    mode: 'bubble_icm',
    title: 'Раздача #10: Баббл турнира — 9♠9♥ на BB vs BTN',
    blindsInfo: 'БАББЛ (2 коротких стека за столом) • Эфф. стек 40 ББ',
    effectiveStackStart: 40,
    heroPos: 'BB',
    villainPos: 'BTN',
    heroCards: ['9♠', '9♥'],
    seats: [
      { pos: 'UTG', stack: 11, active: false, isShortStack: true },
      { pos: 'UTG+1', stack: 52, active: false },
      { pos: 'LJ', stack: 24, active: false },
      { pos: 'HJ', stack: 14, active: false, isShortStack: true },
      { pos: 'CO', stack: 31, active: false },
      { pos: 'BTN', stack: 40, active: true, isVillain: true },
      { pos: 'SB', stack: 19, active: false },
      { pos: 'BB', stack: 40, active: true, isHero: true }
    ],
    streets: [
      {
        name: 'Префлоп',
        board: [],
        potBeforeAction: 4.5,
        effectiveStack: 40.0,
        villainLastActionBadge: 'Рейз 2 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'За столом шорт-стеки 11 ББ и 14 ББ. Агрессивный BTN открывается рейзом 2 ББ.'
          }
        ],
        villainActionText: 'Агрессивный регуляр на BTN открывает 55% рук (2 ББ), давя на баббл.',
        toCall: 1.0,
        minRaise: 5.0,
        gtoAction: {
          type: 'raise',
          acceptableTypes: ['raise'],
          minOptimalSize: 6.5,
          maxOptimalSize: 8.5,
          optimalTags: ['value_bet', 'spr_icm_control'],
          trapTags: [],
          explanation:
            'Против спектра 55% баттона карманные 99 имеют ~65% эквити — это обязательный 3-бет на вэлью. Но сайзинг 7–8 ББ критичен: ставка 10+ ББ привяжет тебя к банку перед бабблом, а после 7 ББ у тебя останется 33 ББ для безопасного паса на 4-бет пуш.',
          sizingNote: '3-бет без позиции до 7–8 ББ.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AQs', 'AKo'],
          medium: ['88', '77', '66', '55', 'AQo', 'AJs', 'KQs'],
          draws: ['A10s', 'A9s', 'A5s', 'KJs', 'QJs', 'J10s', '109s', '98s'],
          bluffs: ['A4o', 'K9o', 'Q9o', 'J8s', '86s', '75s', '54s']
        }
      },
      {
        name: 'Флоп',
        board: ['J♦', '5♠', '4♣'],
        potBeforeAction: 15.5,
        effectiveStack: 33.0,
        villainLastActionBadge: 'Ожидание хода',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'BTN рейз 2 ББ → Hero (BB) 3-бет 7 ББ → BTN колл (Банк: 15.5 ББ)'
          },
          {
            street: 'Флоп [J♦ 5♠ 4♣]',
            text: 'Сухая доска с валетом. Первое слово за Hero без позиции.'
          }
        ],
        villainActionText: 'Слово за тобой в 3-бет банке 15.5 ББ (в стеке 33 ББ).',
        toCall: 0,
        minBet: 3.5,
        gtoAction: {
          type: 'check',
          acceptableTypes: ['check'],
          optimalTags: ['pot_control', 'protect_check_range', 'dry_board'],
          trapTags: ['trap_fold_worse'],
          explanation:
            'С карманными 99 на флопе J-5-4 ставка выбьет слабые руки и изолирует тебя против валетов. Переводя 99 в чек-колл небольшой ставки, мы защищаем свой спектр чека и контролируем банк на баббле.',
          sizingNote: 'Чек (с планом коллировать ставку до 50% банка).'
        },
        rangeMatrix: {
          value: ['JJ', '55', '44', 'AJs', 'KJs', 'QJs', 'J10s'],
          medium: ['1010', '88', '77', '66', 'A5s', 'A4s'],
          draws: ['AQs', 'KQs', '76s', '65s'],
          bluffs: ['A10s', 'K10s', 'Q10s']
        }
      },
      {
        name: 'Терн',
        board: ['J♦', '5♠', '4♣', 'Q♥'],
        potBeforeAction: 25.5,
        effectiveStack: 28.0,
        villainLastActionBadge: 'Бет 15 ББ',
        actionHistory: [
          {
            street: 'Флоп [J♦ 5♠ 4♣]',
            text: 'Hero чек → BTN бет 5 ББ → Hero колл (Банк: 25.5 ББ)'
          },
          {
            street: 'Терн [Q♥]',
            text: 'Выходит Q♥. Hero чек → BTN ставит плотные 15 ББ!'
          }
        ],
        villainActionText: 'По выходу Q♥ баттон ставит 15 ББ в банк 25.5 ББ (у тебя в стеке 28 ББ).',
        toCall: 15.0,
        minRaise: 28.0,
        gtoAction: {
          type: 'fold',
          acceptableTypes: ['fold'],
          optimalTags: ['fold_behind', 'spr_icm_control'],
          trapTags: ['trap_pot_committed'],
          explanation:
            'Дама идеально попала в спектр колла 3-бета баттона (AQ, KQ, QJ, Q10s), а валеты били тебя еще с флопа. Колл 15 ББ оставит тебе 13 ББ на прямом баббле, когда за столом сидят стеки 11 и 14 ББ. Дисциплинированный пас сохраняет комфортные 28 ББ.',
          sizingNote: 'Эталонный чек-фолд по ICM.'
        },
        rangeMatrix: {
          value: ['JJ', '55', '44', 'AQs', 'AQo', 'KQs', 'QJs', 'AJs', 'KJs'],
          medium: ['Q10s', 'J10s', '1010'],
          draws: ['K10s', '109s', '76s', '65s'],
          bluffs: ['A10s', 'A5s']
        }
      }
    ]
  },

  // 11. БАББЛ / ICM: Префлоп рестил или колл с 8♠ 8♣ против чиплидера
  {
    id: 'bubble_2',
    mode: 'bubble_icm',
    title: 'Раздача #11: Баббл — 8♠8♣ на SB против открытия Чиплидера (CO)',
    blindsInfo: 'БАББЛ! За столом два микро-стека по 8 ББ и 11 ББ',
    effectiveStackStart: 24,
    heroPos: 'SB',
    villainPos: 'CO',
    heroCards: ['8♠', '8♣'],
    seats: [
      { pos: 'UTG', stack: 8, active: false, isShortStack: true },
      { pos: 'UTG+1', stack: 31, active: false },
      { pos: 'LJ', stack: 11, active: false, isShortStack: true },
      { pos: 'HJ', stack: 29, active: false },
      { pos: 'CO', stack: 68, active: true, isVillain: true },
      { pos: 'BTN', stack: 22, active: false },
      { pos: 'SB', stack: 24, active: true, isHero: true },
      { pos: 'BB', stack: 34, active: false }
    ],
    streets: [
      {
        name: 'Префлоп',
        board: [],
        potBeforeAction: 4.7,
        effectiveStack: 24.0,
        villainLastActionBadge: 'Рейз 2.2 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Прямой баббл (UTG 8 ББ, LJ 11 ББ). Чиплидер на CO (68 ББ) открывается 2.2 ББ.'
          }
        ],
        villainActionText: 'Чиплидер стола (68 ББ) давит на баббле рейзом 2.2 ББ с CO. У тебя 24 ББ на SB с 8♠ 8♣.',
        toCall: 1.7,
        minRaise: 5.5,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['spr_icm_control', 'pot_control'],
          trapTags: ['value_bet', 'trap_fold_worse'],
          explanation:
            'В обычной стадии (ChipEV) карманные 88 при стеке 24 ББ на SB — это отличный 3-бет пуш. Но на прямом баббле при наличии стеков 8 ББ и 11 ББ фактор риска (Bubble Factor) против чиплидера огромен: вылет стоит всей призовой выплаты! Спокойный колл 1.7 ББ сохраняет твой стек 22+ ББ и позволяет безопасно играть постфлоп.',
          sizingNote: 'Аккуратный колл 1.7 ББ с учетом жесткого давления ICM.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', 'AKs', 'AKo', 'AQs'],
          medium: ['88', '77', '66', '55', 'AQo', 'AJs', 'A10s', 'KQs', 'KJs'],
          draws: ['A9s', 'A8s', 'A5s', 'K10s', 'QJs', 'J10s', '109s', '98s'],
          bluffs: ['KQo', 'Q10s', 'J9s', '87s', '76s', '65s']
        }
      }
    ]
  },

  // 12. БАББЛ / ICM: Блокер-блеф A♠ 5♠ в роли Чиплидера против среднего стека
  {
    id: 'bubble_3',
    mode: 'bubble_icm',
    title: 'Раздача #12: Баббл — Давление на средний стек с блокером A♠5♠',
    blindsInfo: 'БАББЛ! Оппонент со средним стеком боится вылететь до призов',
    effectiveStackStart: 32,
    heroPos: 'BTN',
    villainPos: 'BB',
    heroCards: ['A♠', '5♠'],
    seats: [
      { pos: 'UTG', stack: 12, active: false, isShortStack: true },
      { pos: 'UTG+1', stack: 45, active: false },
      { pos: 'LJ', stack: 9, active: false, isShortStack: true },
      { pos: 'HJ', stack: 38, active: false },
      { pos: 'CO', stack: 27, active: false },
      { pos: 'BTN', stack: 58, active: true, isHero: true },
      { pos: 'SB', stack: 15, active: false, isShortStack: true },
      { pos: 'BB', stack: 32, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['K♦', '9♠', '4♠'],
        potBeforeAction: 5.5,
        effectiveStack: 29.8,
        villainLastActionBadge: 'Чек',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Hero (Чиплидер 58 ББ на BTN) рейз 2.0 ББ → Средний стек на BB (32 ББ) колл'
          },
          {
            street: 'Флоп [K♦ 9♠ 4♠]',
            text: 'BB чекает. У Hero натсовое пиковое флеш-дро (9 аутов) + туз.'
          }
        ],
        villainActionText: 'Средний стек на BB связан по рукам давлением ICM и чекает на флопе K♦ 9♠ 4♠.',
        toCall: 0,
        minBet: 1.5,
        gtoAction: {
          type: 'bet',
          acceptableTypes: ['bet'],
          minOptimalSize: 1.8,
          maxOptimalSize: 3.8,
          optimalTags: ['semibluff_equity', 'spr_icm_control', 'blockers_factor'],
          trapTags: ['pot_control'],
          explanation:
            'На баббле игрок со средним стеком (32 ББ) при наличии коротышей 9 и 12 ББ не может широко защищаться без сильной руки. У тебя натсовое флеш-дро (A♠ 5♠) и блокер на туза — контбет оказывает максимальное ICM-давление и готовит почву для второго барреля на терне.',
          sizingNote: 'Контбет 2.0–3.0 ББ (давление стеком + 12 аутов).'
        },
        rangeMatrix: {
          value: ['99', '44', 'K9s', 'K4s', 'KQo', 'KJs', 'K10s'],
          medium: ['98s', '88', '77', '66', '55', 'A9s', 'Q9s'],
          draws: ['Q♠J♠', 'J♠10♠', '10♠8♠', 'Q10s', 'J10s'],
          bluffs: ['AQo', 'AJo', 'QJo']
        }
      }
    ]
  },

  // 13. ХЭДЗ-АП (1 НА 1): A♣ J♣ в 3-бет поте
  {
    id: 'hu_1',
    mode: 'headsup',
    title: 'Раздача #13: Хэдз-ап — A♣J♣ в 3-бет банке (Блокеры)',
    blindsInfo: 'Хэдз-ап (1v1) • Анте 1 ББ • Стеки 40 ББ',
    effectiveStackStart: 40,
    heroPos: 'BTN',
    villainPos: 'BB',
    heroCards: ['A♣', 'J♣'],
    seats: [
      { pos: 'BTN', stack: 40, active: true, isHero: true },
      { pos: 'BB', stack: 40, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['9♣', '8♣', '2♦'],
        potBeforeAction: 16.0,
        effectiveStack: 32.5,
        villainLastActionBadge: 'Бет 5.5 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'Hero (BTN) рейз 2.2 ББ → BB 3-бет 7.5 ББ → Hero колл (Банк: 16 ББ)'
          },
          {
            street: 'Флоп [9♣ 8♣ 2♦]',
            text: 'BB ставит контбет 5.5 ББ (34% банка)'
          }
        ],
        villainActionText: 'Оппонент в Хэдз-апе ставит 5.5 ББ на флопе 9♣ 8♣ 2♦. У тебя натсовое флеш-дро + две оверкарты.',
        toCall: 5.5,
        minRaise: 14.0,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['pot_control', 'semibluff_equity'],
          trapTags: ['trap_fold_worse'],
          explanation:
            'Наше натсовое флеш-дро с двумя оверкартами идеально играется коллом в позиции: мы не выбиваем блефы соперника (AK, AQ, KQ без треф) и не изолируем себя против его оверпар (1010–AA) и сетов.',
          sizingNote: 'Колл 5.5 ББ в позиции.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '1010', '99', '88'],
          medium: ['A9s', '109s', '87s', '77'],
          draws: ['K♣Q♣', 'Q♣10♣', 'J10s', '76s'],
          bluffs: ['AKo', 'AQo', 'KQo', 'A5s']
        }
      },
      {
        name: 'Ривер',
        board: ['9♣', '8♣', '2♦', '4♠', '2♥'],
        potBeforeAction: 27.0,
        effectiveStack: 27.0,
        villainLastActionBadge: 'Чек',
        actionHistory: [
          {
            street: 'Флоп [9♣ 8♣ 2♦]',
            text: 'BB бет 5.5 ББ → Hero (BTN) колл (Банк: 27 ББ)'
          },
          {
            street: 'Терн [4♠]',
            text: 'BB чек → Hero чек вдогонку (бесплатная реализация эквити при SPR = 1)'
          },
          {
            street: 'Ривер [2♥]',
            text: 'Флеш не закрылся. BB снова чекает. В банке 27 ББ, стек 27 ББ.'
          }
        ],
        villainActionText: 'Трефовое флеш-дро промазало. BB чекает ривер.',
        toCall: 0,
        minBet: 9.0,
        gtoAction: {
          type: 'check',
          acceptableTypes: ['check'],
          optimalTags: ['blockers_factor', 'pot_control'],
          trapTags: [],
          explanation:
            'У тебя в руке A♣ и J♣ — ты сам блокируешь главные промазавшие флеш-дро соперника, которые бы сбросили на твой пуш! При этом твои A-J хай уже бьют на вскрытии его промазавшие KQ, KJ, QJ и Q10. Блефовать здесь категорически нельзя.',
          sizingNote: 'Чек вдогонку и победа на вскрытии против K-хай/Q-хай.'
        },
        rangeMatrix: {
          value: ['99', '88'],
          medium: ['1010', 'A9s', '109s', '87s', '77'],
          draws: [],
          bluffs: ['KQs', 'KJs', 'QJs', 'J10s', '76s']
        }
      }
    ]
  },

  // 14. ХЭДЗ-АП (1 НА 1): Слоуплей трипса с флопа (9♥ 8♥ на доске 8♠ 8♣ 3♦)
  {
    id: 'hu_2',
    mode: 'headsup',
    title: 'Раздача #14: Хэдз-ап — Ловушка с трипсом 9♥8♥ на доске 8♠8♣3♦',
    blindsInfo: 'Хэдз-ап (1v1) • Анте 1 ББ • Стеки 35 ББ',
    effectiveStackStart: 35,
    heroPos: 'BB',
    villainPos: 'BTN',
    heroCards: ['9♥', '8♥'],
    seats: [
      { pos: 'BB', stack: 35, active: true, isHero: true },
      { pos: 'BTN', stack: 35, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Флоп',
        board: ['8♠', '8♣', '3♦'],
        potBeforeAction: 5.0,
        effectiveStack: 33.0,
        villainLastActionBadge: 'Бет 1.6 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'BTN рейз 2 ББ → Hero (BB) колл (Банк 5 ББ)'
          },
          {
            street: 'Флоп [8♠ 8♣ 3♦]',
            text: 'Hero чек → BTN ставит 1.6 ББ (32% банка)'
          }
        ],
        villainActionText: 'В хэдз-апе оппонент ставит мелкий контбет 1.6 ББ на сухой спаренной доске 8-8-3.',
        toCall: 1.6,
        minRaise: 4.2,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['pot_control', 'protect_check_range', 'dry_board'],
          trapTags: ['trap_fold_worse', 'value_bet'],
          explanation:
            'У тебя трипс восьмерок на абсолютно сухой радужной доске 8♠ 8♣ 3♦. В хэдз-апе баттон контбетит здесь почти 100% своего воздуха (К-хай, Q-хай, J-хай). Если ты сделаешь чек-рейз прямо на флопе, он мгновенно выбросит весь воздух и не заплатит больше ни копейки! Колл маскирует силу руки и дает ему возможность поймать пару на терне или продолжить блеф.',
          sizingNote: 'Слоуплей через колл 1.6 ББ (оставляем все блефы соперника в игре).'
        },
        rangeMatrix: {
          value: ['AA', 'KK', 'QQ', 'JJ', '1010', '33', 'A8s', 'K8s', 'Q8s'],
          medium: ['99', '77', '66', '55', '44', 'A3s', 'K3s'],
          draws: ['76s', '65s', '54s'],
          bluffs: ['AKo', 'AQo', 'AJo', 'KQo', 'KJo', 'QJo', 'J10s', '109s']
        }
      },
      {
        name: 'Терн',
        board: ['8♠', '8♣', '3♦', 'K♥'],
        potBeforeAction: 8.2,
        effectiveStack: 31.4,
        villainLastActionBadge: 'Бет 5.5 ББ',
        actionHistory: [
          {
            street: 'Флоп [8♠ 8♣ 3♦]',
            text: 'Hero чек-колл 1.6 ББ (Банк 8.2 ББ)'
          },
          {
            street: 'Терн [K♥]',
            text: 'Выходит K♥. Hero чек → BTN ставит плотные 5.5 ББ (67% банка)!'
          }
        ],
        villainActionText: 'По выходу короля на терне соперник ставит второй баррель 5.5 ББ.',
        toCall: 5.5,
        minRaise: 13.5,
        gtoAction: {
          type: 'raise',
          acceptableTypes: ['raise', 'call'],
          minOptimalSize: 13.0,
          maxOptimalSize: 18.0,
          optimalTags: ['value_bet', 'spr_icm_control'],
          trapTags: ['fold_behind'],
          explanation:
            'Выход короля (K♥) — идеальная карта для нашей ловушки! Теперь все его руки с королем (AK, KQ, KJ, K10) поймали топ-пару и никогда не выбросят на чек-рейз. Пора разгонять банк чек-рейзом до 14–16 ББ, чтобы подготовить комфортный олл-ин на ривере.',
          sizingNote: 'Чек-рейз на вэлью до 14–16 ББ.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', '33', 'AKo', 'KQo', 'KJs', 'K10s', 'A8s', 'K8s'],
          medium: ['QQ', 'JJ', '1010'],
          draws: ['Q♥J♥', 'J♥10♥'],
          bluffs: ['AQo', 'AJo', 'QJo', '76s', '65s']
        }
      }
    ]
  },

  // 15. ХЭДЗ-АП (1 НА 1): Блеф-кетч ривера по третьей паре (A♣ 7♣ на доске K-10-7-3-2)
  {
    id: 'hu_3',
    mode: 'headsup',
    title: 'Раздача #15: Хэдз-ап — Защита с A♣7♣ против трех баррелей',
    blindsInfo: 'Хэдз-ап (1v1) • Анте 1 ББ • Стеки 40 ББ',
    effectiveStackStart: 40,
    heroPos: 'BB',
    villainPos: 'BTN',
    heroCards: ['A♣', '7♣'],
    seats: [
      { pos: 'BB', stack: 40, active: true, isHero: true },
      { pos: 'BTN', stack: 40, active: true, isVillain: true }
    ],
    streets: [
      {
        name: 'Ривер',
        board: ['K♠', '10♦', '7♥', '3♣', '2♠'],
        potBeforeAction: 18.0,
        effectiveStack: 30.0,
        villainLastActionBadge: 'Бет 12 ББ',
        actionHistory: [
          {
            street: 'Префлоп',
            text: 'BTN рейз 2 ББ → Hero (BB) колл (Банк 5 ББ)'
          },
          {
            street: 'Флоп [K♠ 10♦ 7♥]',
            text: 'Hero чек → BTN бет 2 ББ → Hero колл (Банк 9 ББ)'
          },
          {
            street: 'Терн [3♣]',
            text: 'Hero чек → BTN бет 4.5 ББ → Hero колл (Банк 18 ББ)'
          },
          {
            street: 'Ривер [2♠]',
            text: 'Все стрит-дро (QJ, J9, 98, 65, 54) промазали. BTN ставит 12 ББ!'
          }
        ],
        villainActionText: 'На полном бланке 2♠ агрессивный баттон ставит третий баррель 12 ББ в банк 18 ББ.',
        toCall: 12.0,
        minRaise: 30.0,
        gtoAction: {
          type: 'call',
          acceptableTypes: ['call'],
          optimalTags: ['protect_check_range', 'blockers_factor', 'pot_control'],
          trapTags: ['fold_behind'],
          explanation:
            'В хэдз-апе на сухой ран-аут доске K-10-7-3-2 ВСЕ возможные стрит-дро с флопа (QJ, Q9, J9, J8, 98, 86) промазали на ривере. Наша рука A♣ 7♣ не блокирует ни одно из этих промазавших стрит-дро, но при этом туз блокирует его топ-пару AK и A10! Отличный колл по шансам банка (нужно 28.5% эквити).',
          sizingNote: 'Колл 12 ББ — эталонный блеф-кетч в Хэдз-апе.'
        },
        rangeMatrix: {
          value: ['AA', 'KK', '1010', '77', 'AKo', 'KQo', 'KJs', 'K10s'],
          medium: ['Q10s', 'J10s', '99', '88'],
          draws: [],
          bluffs: ['QJo', 'Q9s', 'J9s', 'J8s', '98s', '86s', '65s', '54s']
        }
      }
    ]
  }
];

// ============================================================================
// КЛАССИЧЕСКАЯ БЕЛАЯ КАРТА ПОКЕР-РУМА (4-ЦВЕТНАЯ КОЛОДА, ЧЕТКИЕ ИНДЕКСЫ)
// ============================================================================

function parseCard(cardStr) {
  if (!cardStr) return { rank: '?', suit: '♠' };
  const suit = cardStr.slice(-1);
  const rank = cardStr.slice(0, -1).replace('T', '10');
  return { rank, suit };
}

function PokerCard({ cardStr, size = 'md' }) {
  const { rank, suit } = parseCard(cardStr);

  // Классическая 4-цветная колода покер-румов на белой карте:
  // ♠ — черный, ♥ — красный, ♦ — синий, ♣ — зеленый
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

// Закрытые карты оппонента (рубашка)
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

// Упорядочивает места вокруг овального стола так, чтобы Hero всегда сидел внизу по центру (слот 0)
function buildOrderedTableSeats(scenario) {
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

  if (scenario.mode === 'headsup' || scenario.seats?.length === 2) {
    const heroSeat = scenario.seats?.find(s => s.isHero) || {
      pos: safeHeroPos,
      stack: scenario.effectiveStackStart || 40,
      active: true,
      isHero: true
    };
    const villainSeat = scenario.seats?.find(s => s.isVillain) || {
      pos: safeVillainPos,
      stack: scenario.effectiveStackStart || 40,
      active: true,
      isVillain: true
    };
    return [
      { ...heroSeat, pos: safeHeroPos, isHero: true, isVillain: false, layout: SEAT_SLOTS_8MAX[0] },
      {
        ...villainSeat,
        pos: safeVillainPos,
        isHero: false,
        isVillain: true,
        layout: SEAT_SLOTS_8MAX[4]
      }
    ];
  }

  const rawSeats = scenario.seats || [];
  const heroIdx = Math.max(0, POKER_POSITIONS_8MAX.indexOf(safeHeroPos));

  return POKER_POSITIONS_8MAX.map((_, offset) => {
    const posName = POKER_POSITIONS_8MAX[(heroIdx + offset) % 8];
    const found = rawSeats.find(
      s => normalizePokerPosition(s.pos, scenario.mode, posName) === posName
    ) || {
      pos: posName,
      stack: scenario.effectiveStackStart || 35,
      active: posName === safeHeroPos || posName === safeVillainPos
    };

    const isHeroSeat = offset === 0; // Индекс 0 (внизу по центру) ВСЕГДА принадлежит Hero!
    const isVillainSeat = !isHeroSeat && posName === safeVillainPos;

    return {
      ...found,
      pos: isHeroSeat ? safeHeroPos : posName,
      active: isHeroSeat || isVillainSeat,
      isHero: isHeroSeat,
      isVillain: isVillainSeat,
      layout: SEAT_SLOTS_8MAX[offset]
    };
  });
}

// ============================================================================
// ОЦЕНКА ХОДА ИГРОКА (70% МАТЕМАТИКА / 30% ЛОГИКА)
// ============================================================================

function evaluateDecision(street, chosenAction, chosenSize, selectedTags) {
  const gto = street.gtoAction;
  const feedback = [];
  let mathScore = 0;

  // 1. Оценка действия и сайзинга (макс 7.0)
  if (chosenAction === gto.type) {
    mathScore = 7.0;
    if (chosenAction === 'bet' || chosenAction === 'raise') {
      const minOpt = gto.minOptimalSize ?? 0;
      const maxOpt = gto.maxOptimalSize ?? street.effectiveStack;
      if (chosenSize >= minOpt && chosenSize <= maxOpt) {
        feedback.push({
          type: 'positive',
          title: 'Точный выбор действия и сайзинга',
          text: `Ставка ${fmtBB(chosenSize)} ББ идеально укладывается в диапазон GTO (${
            gto.sizingNote || ''
          }).`
        });
      } else {
        mathScore = 4.5;
        const remaining = Math.max(0, street.effectiveStack - chosenSize);
        const newPot = street.potBeforeAction + street.toCall + chosenSize;
        const nextSpr = newPot > 0 ? (remaining / newPot).toFixed(2) : '0';
        feedback.push({
          type: 'warning',
          title: 'Погрешность в сайзинге',
          text: `Направление верное (${chosenAction.toUpperCase()}), но размер ${fmtBB(
            chosenSize
          )} ББ отклоняется от оптимума (${fmtBB(minOpt)}–${fmtBB(
            maxOpt
          )} ББ). Будущий SPR составит ${nextSpr}.`
        });
      }
    } else {
      feedback.push({
        type: 'positive',
        title: 'Эталонное действие по GTO',
        text: `Ты выбрал верное действие (${chosenAction.toUpperCase()}). ${gto.sizingNote || ''}`
      });
    }
  } else if (gto.acceptableTypes?.includes(chosenAction)) {
    mathScore = 5.0;
    feedback.push({
      type: 'warning',
      title: 'Допустимая альтернативная линия',
      text: `Основная линия солвера — ${gto.type.toUpperCase()}, но твой вариант тоже встречается в миксе.`
    });
  } else {
    mathScore = 1.0;
    feedback.push({
      type: 'error',
      title: 'Математическая ошибка (Потеря EV)',
      text: `Ты выбрал ${chosenAction.toUpperCase()}, тогда как по GTO здесь играется ${gto.type.toUpperCase()}.`
    });
  }

  // 2. Оценка выбранных тегов логики (макс 3.0)
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
      text: 'Выбирай 1–2 тега причины перед нажатием кнопки действия, чтобы тренировать осознанность.'
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
        text: `Верно выделены ключевые факторы: ${hitOptimal
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
              Матрица диапазона оппонента ({villainPos})
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
            <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" /> Средние пары / ШДВ
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
// ОСНОВНОЙ КОМПОНЕНТ ТРЕНАЖЕРА (КЛАССИЧЕСКИЙ ДИЗАЙН ПОКЕР-РУМА)
// ============================================================================

export default function App() {
  const [selectedMode, setSelectedMode] = useState('chipev_8max');
  const [customScenarios, setCustomScenarios] = useState([]);
  const [currentScenarioId, setCurrentScenarioId] = useState('chipev_1');
  const [streetIndex, setStreetIndex] = useState(0);

  // Ввод игрока на текущей улице
  const [selectedTags, setSelectedTags] = useState([]);
  const [betSliderValue, setBetSliderValue] = useState(0);
  const [showSizingDrawer, setShowSizingDrawer] = useState(false);
  const [customReasoning, setCustomReasoning] = useState('');
  const [showNoteInput, setShowNoteInput] = useState(false);

  // Оценка и ИИ-разбор
  const [evaluation, setEvaluation] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [followUpQuestion, setFollowUpQuestion] = useState('');

  // Модальные окна (чтобы не перегружать основной экран)
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isRangeModalOpen, setIsRangeModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);

  // Пользовательский API-ключ для работы на внешнем сайте (сохраняется в localStorage браузера)
  const [userApiKey, setUserApiKey] = useState(() => {
    try {
      return localStorage.getItem('poker_trainer_gemini_key') || '';
    } catch {
      return '';
    }
  });

  const handleSaveApiKey = (newKey) => {
    const cleaned = newKey.trim();
    setUserApiKey(cleaned);
    try {
      if (cleaned) {
        localStorage.setItem('poker_trainer_gemini_key', cleaned);
      } else {
        localStorage.removeItem('poker_trainer_gemini_key');
      }
    } catch {
      // ignore storage errors
    }
  };

  // Архив сыгранных улиц
  const [sessionHistory, setSessionHistory] = useState([]);

  const allScenarios = useMemo(() => [...SCENARIOS, ...customScenarios], [customScenarios]);

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

  // Инициализация ползунка ставки при переходе на новую улицу
  useEffect(() => {
    const minVal =
      currentStreet.toCall > 0
        ? currentStreet.minRaise || Math.min(currentStreet.effectiveStack, currentStreet.toCall * 2.2)
        : currentStreet.minBet || Math.max(1, Math.round(currentStreet.potBeforeAction * 0.33 * 10) / 10);

    setBetSliderValue(Math.min(currentStreet.effectiveStack, Number(minVal.toFixed(1))));
    setSelectedTags([]);
    setShowSizingDrawer(false);
    setEvaluation(null);
    setAiAnalysis('');
    setCustomReasoning('');
    setShowNoteInput(false);
  }, [currentScenarioId, streetIndex, currentStreet]);

  // Математические показатели текущей улицы
  const spr = useMemo(() => {
    const p = currentStreet.potBeforeAction + currentStreet.toCall;
    return p > 0 ? Math.round((currentStreet.effectiveStack / p) * 10) / 10 : 0;
  }, [currentStreet]);

  const potOddsPct = useMemo(() => {
    if (currentStreet.toCall <= 0) return 0;
    const total = currentStreet.potBeforeAction + currentStreet.toCall * 2;
    return Math.round((currentStreet.toCall / total) * 1000) / 10;
  }, [currentStreet]);

  // Прогноз SPR при выборе сайзинга ставки/рейза
  const nextStreetSprPreview = useMemo(() => {
    const remaining = Math.max(0, currentStreet.effectiveStack - betSliderValue);
    const futurePot = currentStreet.potBeforeAction + betSliderValue * 2;
    return futurePot > 0 ? Math.round((remaining / futurePot) * 100) / 100 : 0;
  }, [currentStreet, betSliderValue]);

  const orderedSeats = useMemo(() => buildOrderedTableSeats(currentScenario), [currentScenario]);

  const averageScore = useMemo(() => {
    if (sessionHistory.length === 0) return null;
    const sum = sessionHistory.reduce((acc, item) => acc + item.score, 0);
    return (sum / sessionHistory.length).toFixed(1);
  }, [sessionHistory]);

  const handleToggleTag = tagId => {
    if (evaluation) return;
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  // Запрос к ИИ-тренеру (Gemini API)
  const requestAiCoachAnalysis = async (evalResult, extraQuestion = '', historyEntryId = null) => {
    setIsAiLoading(true);
    try {
      const apiKey = userApiKey.trim() || '';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

      const tagNames = evalResult.selectedTags
        .map(id => LOGIC_TAGS.find(t => t.id === id)?.label)
        .filter(Boolean)
        .join(', ');

      const historyStr = (currentStreet.actionHistory || [])
        .map(h => `${h.street}: ${h.text}`)
        .join(' | ');

      const prompt = `Ты — профессиональный покерный GTO-тренер. Отвечай СТРОГО НА РУССКОМ ЯЗЫКЕ, лаконично и по делу (3–5 предложений).
Раздача: ${currentScenario.title} (${currentScenario.blindsInfo}).
Хронология до хода: ${historyStr}.
Улица: ${currentStreet.name}. Доска: ${
        currentStreet.board.length ? currentStreet.board.join(' ') : 'Префлоп'
      }.
Карты игрока (${currentScenario.heroPos}): ${currentScenario.heroCards.join(' ')}.
Банк: ${fmtBB(currentStreet.potBeforeAction)} ББ, Эффективный стек: ${fmtBB(
        currentStreet.effectiveStack
      )} ББ, SPR: ${spr}.
Ход игрока: ${evalResult.chosenAction.toUpperCase()} ${
        evalResult.chosenAction === 'bet' || evalResult.chosenAction === 'raise'
          ? `${fmtBB(evalResult.chosenSize)} ББ`
          : ''
      }.
Отмеченные причины: ${tagNames || 'не указаны'}.
Мысль игрока: "${customReasoning || 'нет'}".
Эталон GTO: ${currentStreet.gtoAction.type.toUpperCase()} (${
        currentStreet.gtoAction.sizingNote
      }). Логика GTO: ${currentStreet.gtoAction.explanation}.
Оценка движка: ${evalResult.totalScore}/10.
${
  extraQuestion
    ? `Вопрос игрока: "${extraQuestion}"`
    : 'Разбери ход игрока и его логику без воды. Всегда пиши 10 вместо T.'
}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      const text =
        data?.candidates?.[0]?.content?.parts?.[0]?.text ||
        'Не удалось получить ответ от ИИ-тренера.';
      setAiAnalysis(text);

      if (historyEntryId) {
        setSessionHistory(prev =>
          prev.map(item => (item.id === historyEntryId ? { ...item, aiText: text } : item))
        );
      }
    } catch (err) {
      setAiAnalysis('Ошибка соединения с ИИ-тренером. Проверьте подключение.');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Мгновенная отправка действия по клику на кнопку покер-рума
  const submitPokerAction = (actionType, sizeValue = 0) => {
    const finalSize =
      actionType === 'bet' || actionType === 'raise'
        ? sizeValue
        : actionType === 'call'
        ? currentStreet.toCall
        : 0;

    const result = evaluateDecision(currentStreet, actionType, finalSize, selectedTags);
    setEvaluation(result);
    setShowSizingDrawer(false);

    const entryId = `${Date.now()}`;
    const newEntry = {
      id: entryId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      scenarioTitle: currentScenario.title,
      streetName: currentStreet.name,
      heroPos: currentScenario.heroPos,
      villainPos: currentScenario.villainPos,
      heroCards: currentScenario.heroCards,
      board: currentStreet.board,
      actionHistory: currentStreet.actionHistory || [],
      chosenAction: actionType,
      chosenSize: finalSize,
      gtoType: currentStreet.gtoAction.type,
      gtoSizingNote: currentStreet.gtoAction.sizingNote,
      score: result.totalScore,
      explanation: currentStreet.gtoAction.explanation,
      aiText: ''
    };

    setSessionHistory(prev => [newEntry, ...prev]);

    if (customReasoning.trim().length > 3) {
      requestAiCoachAnalysis(result, '', entryId);
    }
  };

  // Мгновенный выбор случайной раздачи из большой базы без повторов
  const handlePickRandomScenario = () => {
    const candidates = modeScenarios.filter(s => s.id !== currentScenario.id);
    const pool =
      candidates.length > 0 ? candidates : allScenarios.filter(s => s.id !== currentScenario.id);
    if (pool.length > 0) {
      const picked = pool[Math.floor(Math.random() * pool.length)];
      if (picked.mode !== selectedMode) {
        setSelectedMode(picked.mode);
      }
      setCurrentScenarioId(picked.id);
      setStreetIndex(0);
      setIsSelectorOpen(false);
    }
  };

  // Генерация нового спота ИИ (строго на русском языке, с выбором случайного тактического архетипа и без однотипных досок 10-7-2)
  const handleGenerateAiScenario = async () => {
    setIsGeneratingScenario(true);
    try {
      const apiKey = userApiKey.trim() || '';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

      const randomArchetype =
        AI_SPOT_ARCHETYPES[Math.floor(Math.random() * AI_SPOT_ARCHETYPES.length)];

      const posPairs8Max = [
        { hero: 'BB', villain: 'BTN' },
        { hero: 'BTN', villain: 'CO' },
        { hero: 'CO', villain: 'BB' },
        { hero: 'BB', villain: 'HJ' },
        { hero: 'HJ', villain: 'LJ' },
        { hero: 'SB', villain: 'BB' }
      ];
      const randomPair =
        selectedMode === 'headsup'
          ? Math.random() > 0.5
            ? { hero: 'BTN', villain: 'BB' }
            : { hero: 'BB', villain: 'BTN' }
          : posPairs8Max[Math.floor(Math.random() * posPairs8Max.length)];

      const modeDescription =
        selectedMode === 'bubble_icm'
          ? 'Баббл турнира 8-Max с давлением ICM и короткими стеками (11-14 ББ) за столом'
          : selectedMode === 'headsup'
          ? 'Хэдз-ап (1 на 1, только позиции BTN и BB) с широкими спектрами'
          : 'Рабочая стадия 8-Max турнира (стеки 25-45 ББ, акцент на позициях, SPR и блокерах)';

      const prompt = `Создай уникальную покерную раздачу из 2 улиц для режима: "${modeDescription}".
ТАКТИЧЕСКАЯ ТЕМА ЭТОЙ РАЗДАЧИ: "${randomArchetype.name}".
Указание по сценарию: ${randomArchetype.instruction}

ЖЕСТКИЕ ПРАВИЛА (НАРУШЕНИЕ ЗАПРЕЩЕНО):
1. ЯЗЫК: Весь текст (title, blindsInfo, name улиц, actionHistory, villainActionText, explanation, sizingNote) пиши СТРОГО НА РУССКОМ ЯЗЫКЕ! Английский язык категорически запрещен (пиши "Флоп", "Терн", "Ривер", "Префлоп", "рейз", "колл", "чек").
2. ПОЗИЦИИ: Позиция Героя (heroPos) = "${randomPair.hero}", позиция Оппонента (villainPos) = "${randomPair.villain}". Используй только стандартные названия: UTG, UTG+1, LJ, HJ, CO, BTN, SB, BB (не пиши "BU" или "MP").
3. ЗАПРЕТ НА ШАБЛОННЫЕ ДОСКИ: КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО генерировать доски 10-7-2 или 10-7-4 и руку A-10! Выбери свежую комбинацию карт и мастей (например, с участием дам, валетов, девяток, восьмерок, шестерок или пятерок).
4. ЕДИНИЦЫ ИЗМЕРЕНИЯ: Все числа (стеки, ставки, рейзы, банки) пиши СТРОГО в Больших Блайндах (ББ), где 1 ББ = 1.0 (стеки 24–45 ББ).
5. Десятку всегда пиши как "10" (10♠, A10s, K10o), без буквы "T".
6. Используй только ID тегов из списка: value_bet, pot_control, protect_check_range, semibluff_equity, dry_board, blockers_factor, spr_icm_control, fold_behind, trap_fold_worse, trap_pot_committed.`;

      const responseSchema = {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          blindsInfo: { type: 'STRING' },
          effectiveStackStart: { type: 'NUMBER' },
          heroPos: { type: 'STRING' },
          villainPos: { type: 'STRING' },
          heroCards: { type: 'ARRAY', items: { type: 'STRING' } },
          streets: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                board: { type: 'ARRAY', items: { type: 'STRING' } },
                potBeforeAction: { type: 'NUMBER' },
                effectiveStack: { type: 'NUMBER' },
                villainLastActionBadge: { type: 'STRING' },
                villainActionText: { type: 'STRING' },
                toCall: { type: 'NUMBER' },
                minRaise: { type: 'NUMBER' },
                actionHistory: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      street: { type: 'STRING' },
                      text: { type: 'STRING' }
                    }
                  }
                },
                gtoAction: {
                  type: 'OBJECT',
                  properties: {
                    type: { type: 'STRING' },
                    acceptableTypes: { type: 'ARRAY', items: { type: 'STRING' } },
                    minOptimalSize: { type: 'NUMBER' },
                    maxOptimalSize: { type: 'NUMBER' },
                    optimalTags: { type: 'ARRAY', items: { type: 'STRING' } },
                    trapTags: { type: 'ARRAY', items: { type: 'STRING' } },
                    explanation: { type: 'STRING' },
                    sizingNote: { type: 'STRING' }
                  }
                },
                rangeMatrix: {
                  type: 'OBJECT',
                  properties: {
                    value: { type: 'ARRAY', items: { type: 'STRING' } },
                    medium: { type: 'ARRAY', items: { type: 'STRING' } },
                    draws: { type: 'ARRAY', items: { type: 'STRING' } },
                    bluffs: { type: 'ARRAY', items: { type: 'STRING' } }
                  }
                }
              }
            }
          }
        },
        required: [
          'title',
          'blindsInfo',
          'effectiveStackStart',
          'heroPos',
          'villainPos',
          'heroCards',
          'streets'
        ]
      };

      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema
          }
        })
      });

      const data = await res.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawJson) {
        const parsed = sanitizeAiGeneratedScenario(JSON.parse(rawJson), selectedMode);
        const newId = `ai_${Date.now()}`;
        const seats =
          selectedMode === 'headsup'
            ? [
                {
                  pos: parsed.heroPos,
                  stack: parsed.effectiveStackStart || 40,
                  active: true,
                  isHero: true
                },
                {
                  pos: parsed.villainPos,
                  stack: parsed.effectiveStackStart || 40,
                  active: true,
                  isVillain: true
                }
              ]
            : POKER_POSITIONS_8MAX.map(pos => ({
                pos,
                stack: parsed.effectiveStackStart || 35,
                active: pos === parsed.heroPos || pos === parsed.villainPos,
                isHero: pos === parsed.heroPos,
                isVillain: pos === parsed.villainPos
              }));

        const newScenario = { ...parsed, id: newId, mode: selectedMode, seats };
        setCustomScenarios(prev => [newScenario, ...prev]);
        setCurrentScenarioId(newId);
        setStreetIndex(0);
        setIsSelectorOpen(false);
      }
    } catch (e) {
      // ignore error silently
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  const currentModeObj = TABLE_MODES.find(m => m.id === selectedMode) || TABLE_MODES[0];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col font-sans select-none">
      {/* ==================================================================== */}
      {/* 1. КОМПАКТНАЯ ШАПКА ПОКЕР-РУМА (ВЫБОР СТОЛА, СЛУЧАЙНЫЙ СПОТ, ИИ)      */}
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
            <span className="truncate max-w-[130px] sm:max-w-[260px] text-slate-200">
              {currentScenario.title}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          <button
            onClick={handlePickRandomScenario}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 shrink-0 transition"
            title="Случайная раздача из встроенной базы (без ожидания ИИ)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden md:inline">Случайная</span>
          </button>

          <button
            onClick={handleGenerateAiScenario}
            disabled={isGeneratingScenario}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition disabled:opacity-50 shrink-0"
          >
            {isGeneratingScenario ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            <span>{isGeneratingScenario ? 'Генерация...' : 'Новый спот (ИИ)'}</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {averageScore && (
            <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-slate-400">Ср. балл:</span>
              <span className="font-bold text-white">{averageScore}</span>
            </div>
          )}

          <button
            onClick={() => setIsRangeModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            title="Диапазон оппонента 13x13"
          >
            <Grid className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Спектр {currentScenario.villainPos}</span>
          </button>

          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            title="История сыгранных раздач"
          >
            <History className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">История</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-700 text-[10px] font-bold">
              {sessionHistory.length}
            </span>
          </button>

          <button
            onClick={() => setIsGlossaryModalOpen(true)}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
            title="Справочник тегов и терминов"
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
            title="Настройка Gemini API ключа для работы на отдельном сайте"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden lg:inline">{userApiKey.trim() ? 'API OK' : 'API Ключ'}</span>
          </button>
        </div>
      </header>

      {/* ВЫПАДАЮЩЕЕ МЕНЮ ВЫБОРА СТОЛА И РАЗДАЧИ */}
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

              <button
                onClick={handleGenerateAiScenario}
                disabled={isGeneratingScenario}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
              >
                {isGeneratingScenario ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" />
                )}
                <span>Сгенерировать новую раздачу (ИИ)</span>
              </button>
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
                    <div className="text-[11px] text-slate-400">{sc.blindsInfo}</div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 text-[10px] shrink-0">
                    {sc.heroCards.join(' ')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. ТОНКАЯ ПОЛОСА ХРОНОЛОГИИ ДЕЙСТВИЙ И ПЕРЕКЛЮЧАТЕЛЬ УЛИЦ            */}
      {/* ==================================================================== */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-3 py-1.5">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Лог действий с префлопа одной строкой */}
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

          {/* Улицы текущей раздачи */}
          <div className="flex items-center gap-1 shrink-0">
            {currentScenario.streets.map((st, idx) => (
              <button
                key={idx}
                onClick={() => setStreetIndex(idx)}
                className={`px-2.5 py-0.5 rounded text-[11px] font-semibold transition ${
                  idx === streetIndex
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. КЛАССИЧЕСКИЙ ОВАЛЬНЫЙ ПОКЕРНЫЙ СТОЛ (КАК В ОБЫЧНОМ ПОКЕР-РУМЕ)    */}
      {/* ==================================================================== */}
      <main className="flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto px-2 sm:px-4 py-2 gap-2">
        <div className="relative w-full h-[310px] sm:h-[360px] my-auto flex items-center justify-center">
          {/* Внешний бортик стола и зеленое сукно */}
          <div className="relative w-[92%] sm:w-[86%] h-[82%] rounded-[999px] bg-gradient-to-b from-[#155e3b] via-[#0f4c2f] to-[#0a3622] border-[10px] sm:border-[12px] border-[#1f2937] shadow-[inset_0_0_50px_rgba(0,0,0,0.65),0_15px_35px_rgba(0,0,0,0.7)] flex flex-col items-center justify-center">
            {/* Внутренняя тонкая разметка сукна */}
            <div className="absolute inset-3 sm:inset-4 rounded-[999px] border border-emerald-300/15 pointer-events-none" />

            {/* ЦЕНТР СТОЛА: БАНК, ОБЩИЕ КАРТЫ БОРДА, SPR */}
            <div className="z-10 flex flex-col items-center gap-2 px-3">
              {/* Плашка общего банка */}
              <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-950/80 border border-emerald-400/30 shadow-md">
                <Coins className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  Банк: {fmtBB(currentStreet.potBeforeAction + currentStreet.toCall)} ББ
                </span>
                <span className="text-[11px] text-emerald-300 border-l border-slate-700 pl-2">
                  SPR: {spr}
                </span>
              </div>

              {/* Карты борда (Флоп / Терн / Ривер) */}
              <div className="min-h-[68px] sm:min-h-[82px] flex items-center justify-center gap-1.5 sm:gap-2">
                {currentStreet.board && currentStreet.board.length > 0 ? (
                  currentStreet.board.map((card, i) => <PokerCard key={i} cardStr={card} />)
                ) : (
                  <div className="px-4 py-2 rounded-xl bg-black/25 border border-white/10 text-xs text-emerald-200/80">
                    Префлоп • Карты борда еще не сданы
                  </div>
                )}
              </div>

              {/* Краткая подсказка текущего действия соперника */}
              <div className="text-[11px] sm:text-xs text-emerald-100/90 bg-black/35 px-3 py-0.5 rounded-full text-center max-w-md truncate">
                {currentStreet.villainActionText}
              </div>
            </div>
          </div>

          {/* РАССАДКА ИГРОКОВ ВОКРУГ СТОЛА (8-MAX ИЛИ ХЭДЗ-АП) */}
          {orderedSeats.map(seat => {
            const isHero = seat.isHero;
            const isVillain = seat.isVillain;
            const isActive = isHero || isVillain;
            const isDealer = seat.pos === 'BTN';

            // Отображаемый стек игрока на текущей улице
            const displayStack = isActive ? currentStreet.effectiveStack : seat.stack;

            return (
              <div
                key={seat.pos}
                style={{ top: seat.layout.top, left: seat.layout.left }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center"
              >
                {/* Фишка ставки/действия соперника на сукне */}
                {isVillain && currentStreet.villainLastActionBadge && (
                  <div className="mb-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-extrabold text-[11px] shadow-lg flex items-center gap-1 whitespace-nowrap">
                    <span className="w-2 h-2 rounded-full bg-red-600 inline-block" />
                    <span>{currentStreet.villainLastActionBadge}</span>
                  </div>
                )}

                {/* Бокс игрока */}
                {isHero ? (
                  <div className="flex items-center gap-2.5 bg-slate-900/95 border-2 border-emerald-500 rounded-2xl px-3 py-1.5 shadow-xl">
                    {/* Карты Героя */}
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
                  /* Сбросившие игроки (приглушенные компактные плашки, чтобы не отвлекать внимание) */
                  <div
                    className={`px-2.5 py-1 rounded-xl border text-center transition ${
                      seat.isShortStack
                        ? 'bg-slate-900/85 border-amber-500/50 text-amber-200'
                        : 'bg-slate-900/55 border-slate-800 text-slate-500 opacity-65'
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
                    <div className="text-[9px] uppercase tracking-wider">
                      {seat.isShortStack ? 'Короткий стек (ICM)' : 'Пас'}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ================================================================== */}
        {/* 4. НИЖНЯЯ ПАНЕЛЬ УПРАВЛЕНИЯ (КАК В КЛИЕНТЕ ПОКЕР-РУМА)             */}
        {/* ================================================================== */}
        {!evaluation ? (
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 shadow-xl space-y-2.5">
            {/* Компактная строка выбора причины хода ("Почему?") */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. Отметь причину хода (почему ты так играешь):</span>
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
                  placeholder="Напиши свою логику (ИИ-тренер проверит твои аргументы)..."
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              )}
            </div>

            {/* Ползунок выбора сайзинга (открывается при нажатии на Бет/Рейз) */}
            {showSizingDrawer && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: '33%', mult: 0.33 },
                      { label: '50%', mult: 0.5 },
                      { label: '75%', mult: 0.75 },
                      { label: 'Банк', mult: 1.0 },
                      { label: 'Олл-ин', allIn: true }
                    ].map(btn => (
                      <button
                        key={btn.label}
                        onClick={() => {
                          if (btn.allIn) {
                            setBetSliderValue(currentStreet.effectiveStack);
                          } else {
                            const basePot =
                              currentStreet.potBeforeAction + currentStreet.toCall * 2;
                            const raw = currentStreet.toCall + basePot * btn.mult;
                            const minAllowed =
                              currentStreet.toCall > 0
                                ? currentStreet.minRaise || currentStreet.toCall * 2
                                : currentStreet.minBet || 1;
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
                      currentStreet.toCall > 0
                        ? currentStreet.minRaise || currentStreet.toCall * 2
                        : currentStreet.minBet || 1
                    }
                    max={currentStreet.effectiveStack}
                    step="0.5"
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

            {/* 3 главные кнопки покер-рума: ПАС / ЧЕК-КОЛЛ / БЕТ-РЕЙЗ */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-0.5">
              {/* Кнопка ПАС */}
              <button
                onClick={() => submitPokerAction('fold', 0)}
                disabled={currentStreet.toCall === 0}
                className={`py-2.5 sm:py-3 px-3 rounded-xl font-bold text-xs sm:text-sm flex flex-col items-center justify-center border transition ${
                  currentStreet.toCall === 0
                    ? 'bg-slate-800/40 border-slate-800 text-slate-600 cursor-not-allowed'
                    : 'bg-slate-800 hover:bg-rose-950/70 border-slate-700 hover:border-rose-500/60 text-slate-200'
                }`}
              >
                <span>ПАС (Fold)</span>
                <span className="text-[10px] font-normal text-slate-400">
                  {currentStreet.toCall > 0
                    ? `Сохранить ${fmtBB(currentStreet.effectiveStack)} ББ`
                    : 'Бесплатный чек'}
                </span>
              </button>

              {/* Кнопка ЧЕК или КОЛЛ */}
              <button
                onClick={() =>
                  submitPokerAction(
                    currentStreet.toCall > 0 ? 'call' : 'check',
                    currentStreet.toCall
                  )
                }
                className="py-2.5 sm:py-3 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 border border-sky-400/50 text-white font-bold text-xs sm:text-sm flex flex-col items-center justify-center shadow-md transition"
              >
                <span>
                  {currentStreet.toCall > 0
                    ? `КОЛЛ ${fmtBB(currentStreet.toCall)} ББ`
                    : 'ЧЕК (Check)'}
                </span>
                <span className="text-[10px] font-normal text-sky-100">
                  {currentStreet.toCall > 0
                    ? `Шансы банка: ${potOddsPct}%`
                    : 'Контроль банка'}
                </span>
              </button>

              {/* Кнопка БЕТ или РЕЙЗ */}
              <button
                onClick={() => {
                  if (showSizingDrawer) {
                    submitPokerAction(
                      currentStreet.toCall > 0 ? 'raise' : 'bet',
                      betSliderValue
                    );
                  } else {
                    setShowSizingDrawer(true);
                  }
                }}
                className="py-2.5 sm:py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 border border-amber-300 text-slate-950 font-extrabold text-xs sm:text-sm flex flex-col items-center justify-center shadow-md transition"
              >
                <span>
                  {currentStreet.toCall > 0 ? 'РЕЙЗ / ОЛЛ-ИН' : 'БЕТ (Ставка)'}
                </span>
                <span className="text-[10px] font-semibold text-slate-900">
                  {showSizingDrawer
                    ? `Поставить ${fmtBB(betSliderValue)} ББ`
                    : `Выбрать размер (${fmtBB(betSliderValue)} ББ)`}
                </span>
              </button>
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* 5. КОМПАКТНОЕ ОКНО РАЗБОРА ПОСЛЕ СДЕЛАННОГО ХОДА                 */
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
                    Эталон GTO: {currentStreet.gtoAction.type.toUpperCase()}{' '}
                    {currentStreet.gtoAction.minOptimalSize
                      ? `(${fmtBB(currentStreet.gtoAction.minOptimalSize)}–${fmtBB(
                          currentStreet.gtoAction.maxOptimalSize
                        )} ББ)`
                      : ''}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Действие: {evaluation.mathScore}/7.0 • Логика: {evaluation.logicScore}/3.0
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEvaluation(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Переиграть</span>
                </button>

                {streetIndex < currentScenario.streets.length - 1 ? (
                  <button
                    onClick={() => setStreetIndex(streetIndex + 1)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1 shadow-md"
                  >
                    <span>Следующая улица ({currentScenario.streets[streetIndex + 1].name})</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handlePickRandomScenario}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white flex items-center gap-1 shadow-md"
                  >
                    <span>Следующая раздача</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Объяснение почему так играется по GTO */}
            <div className="text-xs sm:text-sm text-slate-200 leading-relaxed bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              {evaluation.gtoExplanation}
            </div>

            {/* Пункты обратной связи по действию и выбранным тегам */}
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

            {/* Разбор от ИИ или поле вопроса тренеру */}
            {aiAnalysis ? (
              <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs text-slate-200 space-y-1">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Комментарий ИИ-тренера:</span>
                </div>
                <div className="leading-relaxed whitespace-pre-line">{aiAnalysis}</div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={followUpQuestion}
                onChange={e => setFollowUpQuestion(e.target.value)}
                placeholder="Задать вопрос тренеру по этой раздаче (например: «А что если у него сет?»)..."
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
                <span>{isAiLoading ? 'Анализ...' : 'Спросить ИИ'}</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* МОДАЛКИ: СПЕКТР 13x13, АРХИВ РАЗДАЧ, СПРАВОЧНИК ТЕРМИНОВ             */}
      {/* ==================================================================== */}
      <RangeMatrixModal
        isOpen={isRangeModalOpen}
        onClose={() => setIsRangeModalOpen(false)}
        rangeMatrix={currentStreet.rangeMatrix}
        villainPos={currentScenario.villainPos}
      />

      {/* Модальное окно Истории сыгранных раздач */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-4 shadow-2xl max-h-[82vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">
                  Архив сыгранных раздач ({sessionHistory.length})
                </h3>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {sessionHistory.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  Ты еще не сыграл ни одной улицы в этой сессии.
                </div>
              ) : (
                sessionHistory.map(item => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/80 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        {item.scenarioTitle} • {item.streetName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
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
                    <div className="text-slate-300">
                      Карты: <strong>{item.heroCards.join(' ')}</strong> | Борд:{' '}
                      <strong>{item.board?.length ? item.board.join(' ') : 'Префлоп'}</strong>
                    </div>
                    <div className="text-slate-400">
                      Твой ход:{' '}
                      <strong className="text-white uppercase">
                        {item.chosenAction}{' '}
                        {item.chosenSize > 0 ? `${fmtBB(item.chosenSize)} ББ` : ''}
                      </strong>{' '}
                      | Эталон GTO:{' '}
                      <strong className="text-emerald-400 uppercase">{item.gtoType}</strong> (
                      {item.gtoSizingNote})
                    </div>
                    <div className="text-slate-300 bg-slate-900/80 p-2 rounded-lg">
                      {item.explanation}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно Справочника тегов и понятий */}
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

      {/* Модальное окно настройки API-ключа для внешнего сайта */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Настройка API-ключа (для отдельного сайта)
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
                Внутри этого чата ключ подставляется автоматически. Но когда ты выложишь тренажер на{' '}
                <strong>отдельный сайт</strong>, для работы генератора ИИ-спотов и ИИ-тренера нужен
                бесплатный ключ из <strong>Google AI Studio</strong> (15 встроенных раздач работают и
                без ключа).
              </p>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-emerald-400">Где взять бесплатный ключ за 30 секунд:</div>
                <div>1. Зайди на сайт <strong>aistudio.google.com</strong></div>
                <div>2. Нажми <strong>Get API key → Create API key</strong></div>
                <div>3. Скопируй строку (начинается на <code>AIzaSy...</code>) и вставь ниже:</div>
              </div>
            </div>

            <div className="space-y-2">
              <input
                type="password"
                value={userApiKey}
                onChange={e => handleSaveApiKey(e.target.value)}
                placeholder="Вставь сюда ключ AIzaSy..."
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
