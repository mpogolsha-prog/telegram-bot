const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const admin = require('firebase-admin');
const fs = require('fs');

// ===== ENV =====
const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is not set in environment variables');

const ADMIN_ID = process.env.ADMIN_ID || '137269914';
const INSTAGRAM_PROFILE = 'https://www.instagram.com/childpsy_khatsevych';

// ===== Firestore init (Secret File) =====
// ⬇️ ВАЖНО: имя файла совпадает с твоим Secret File в Render
const FIREBASE_KEY_PATH = '/etc/secrets/psybot-jul-firebase-adminsdk-fbsvc-06961a40cb.json';

if (!fs.existsSync(FIREBASE_KEY_PATH)) {
  throw new Error(`Firebase service account file not found at ${FIREBASE_KEY_PATH}`);
}

const serviceAccount = JSON.parse(fs.readFileSync(FIREBASE_KEY_PATH, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
console.log('✅ Firestore connected');

// ===== Bot =====
const bot = new TelegramBot(token, { polling: true });

// --- FIX 409: graceful shutdown ---
const shutdown = async (signal) => {
  try {
    console.log(`🛑 Received ${signal}, stopping polling...`);
    await bot.stopPolling();
  } catch (e) {}
  process.exit(0);
};
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

// --- FIX 409: restart polling if conflict ---
let pollingRestartTimer = null;
bot.on('polling_error', async (err) => {
  const code = err?.response?.body?.error_code;
  const desc = err?.response?.body?.description || err?.message || '';

  if (code === 409 || String(desc).includes('409 Conflict')) {
    if (pollingRestartTimer) return;
    console.log('⚠️ 409 Conflict detected. Restart polling in 5s...');
    try { await bot.stopPolling(); } catch (e) {}
    pollingRestartTimer = setTimeout(async () => {
      pollingRestartTimer = null;
      try {
        await bot.startPolling();
        console.log('✅ Polling restarted');
      } catch (e) {
        console.log('❌ Failed to restart polling:', e.message);
      }
    }, 5000);
    return;
  }

  console.log('polling_error:', desc);
});

// ===== Helpers =====
const escapeHTML = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const validateUsername = (username) => /^[a-zA-Z0-9._]{1,30}$/.test(username);

// ===== Content =====

// ✅ Чек-листы (с правильными ссылками)
const CHECKLISTS = {
  checklist_7_10: {
    ua: 'https://childpsy-guide7-10.netlify.app',
    title_ua: 'Чек-ліст 7–10 років',
    title_ru: 'Чек-лист 7–10 лет',
    description_ua: 'Міні-опитувальник: чи потрібна дитині психологічна підтримка.',
    description_ru: 'Мини-опросник: нужна ли ребенку психологическая поддержка.',
    emoji: '🧩'
  },
  checklist_11_15: {
    ua: 'https://childpsyguide11-15.netlify.app',
    title_ua: 'Чек-ліст 11–15 років',
    title_ru: 'Чек-лист 11–15 лет',
    description_ua: 'Важкий вік чи тривожний дзвіночок? Чек-лист + результати.',
    description_ru: 'Трудный возраст или тревожный сигнал? Чек-лист + результаты.',
    emoji: '🌀'
  },
  checklist_16_18: {
    ua: 'https://childspyguide16-18.netlify.app',
    title_ua: 'Чек-ліст 16–18 років',
    title_ru: 'Чек-лист 16–18 лет',
    description_ua: 'Незалежність чи крик про допомогу? Чек-лист + інтерпретація.',
    description_ru: 'Независимость или крик о помощи? Чек-лист + интерпретация.',
    emoji: '🔥'
  }
};

const getChecklistUrl = (key, lang) => {
  const item = CHECKLISTS[key];
  if (!item) return null;
  return lang === 'ru' ? (item.ru || item.ua) : item.ua;
};

// ✅ Гайды (отдельное меню)
const GUIDES = {
  adaptation: {
    ua: 'https://kids-adaptation.netlify.app',
    ru: 'https://kids-adaptation1.netlify.app',
    title_ua: "Міцний зв'язок в нових обставинах",
    title_ru: 'Крепкая связь в новых обстоятельствах',
    description_ua: "Керівництво з м'якої адаптації дітей до садочка або школи",
    description_ru: 'Руководство по мягкой адаптации детей к детскому саду или школе',
    emoji: '🌿'
  }
};

const getGuideUrl = (key, lang) => {
  const item = GUIDES[key];
  if (!item) return null;
  return lang === 'ru' ? (item.ru || item.ua) : item.ua;
};

// ===== Keyboards =====
const languageKeyboard = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: '🇺🇦 Українська', callback_data: 'lang_ua' },
        { text: '🇷🇺 Русский', callback_data: 'lang_ru' }
      ]
    ]
  }
};

const getMainKeyboard = (lang) => {
  const keyboards = {
    ua: {
      reply_markup: {
        keyboard: [
          ['✅ Вибрати чек-ліст'],
          ['📚 Вибрати гайд'],
          ['👩‍⚕️ Про психолога', '📞 Контакти'],
          ['🗓️ Записатися на безкоштовну консультацію'],
          ['🔄 Змінити мову']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    },
    ru: {
      reply_markup: {
        keyboard: [
          ['✅ Выбрать чек-лист'],
          ['📚 Выбрать гайд'],
          ['👩‍⚕️ О психологе', '📞 Контакты'],
          ['🗓️ Записаться на бесплатную консультацию'],
          ['🔄 Сменить язык']
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  };
  return keyboards[lang];
};

const getInstagramKeyboard = () => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: '📱 Перейти в Instagram', url: INSTAGRAM_PROFILE }]
    ]
  }
});

const getChecklistsListKeyboard = (lang) => {
  const buttons = [];
  for (const [key, item] of Object.entries(CHECKLISTS)) {
    const title = lang === 'ua' ? item.title_ua : item.title_ru;
    buttons.push([{ text: `${item.emoji} ${title}`, callback_data: `checklist:${key}` }]);
  }
  buttons.push([{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]);
  return { reply_markup: { inline_keyboard: buttons } };
};

const getGuidesListKeyboard = (lang) => {
  const buttons = [];
  for (const [key, item] of Object.entries(GUIDES)) {
    const title = lang === 'ua' ? item.title_ua : item.title_ru;
    buttons.push([{ text: `${item.emoji} ${title}`, callback_data: `guide:${key}` }]);
  }
  buttons.push([{ text: '🔙 Назад в меню', callback_data: 'back_to_menu' }]);
  return { reply_markup: { inline_keyboard: buttons } };
};

const getGuideKeyboard = (guideKey, lang) => {
  const url = getGuideUrl(guideKey, lang);
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: lang === 'ua' ? '📖 Відкрити гайд' : '📖 Открыть гайд', url }],
        [{ text: '📱 Перейти в Instagram', url: INSTAGRAM_PROFILE }],
        [{ text: lang === 'ua' ? '🔙 Назад до списку' : '🔙 Назад к списку', callback_data: 'show_guides' }]
      ]
    }
  };
};

const contactKeyboard = (lang) => ({
  reply_markup: {
    keyboard: [
      [{ text: lang === 'ua' ? '📲 Поділитися контактом' : '📲 Поделиться контактом', request_contact: true }],
      [lang === 'ua' ? '❌ Скасувати' : '❌ Отмена']
    ],
    resize_keyboard: true,
    one_time_keyboard: true
  }
});

const consultReviewKeyboard = (lang) => ({
  reply_markup: {
    inline_keyboard: [
      [{ text: lang === 'ua' ? '✅ Підтвердити та надіслати' : '✅ Подтвердить и отправить', callback_data: 'consult_confirm' }],
      [{ text: lang === 'ua' ? '✏️ Змінити дані' : '✏️ Изменить данные', callback_data: 'consult_edit' }],
      [{ text: lang === 'ua' ? '❌ Скасувати' : '❌ Отмена', callback_data: 'consult_cancel' }]
    ]
  }
});

// ===== Messages =====
const ABOUT_UA = `👩‍⚕️ Про мене:

Привіт! Мене звати Юлія Хацевич. Я - дитячий та юнацький психотерапевт в навчанні, психолог і нейрокорекційний спеціаліст.

Я працюю з дітьми, підлітками та батьками, які стикаються з тривогою, агресією, емоційними зривами, труднощами в адаптації, навчанні, самооцінці чи поведінці. І не тільки: тіки, самоушкодження, гіперактивність, дефіцит уваги, затримки психічного розвитку, смоктання пальців, гризіння нігтів, енурези, страхи, булінг, втрати - робота моєї практики.

💛 Моя мета - не «виправити» дитину, а допомогти їй зростати, розуміти себе і мати ресурс бути собою.

Я не граю в коаліції «проти» батьків чи «з дитиною замість мами». Ми - команда. Терапевтична і жива. Бо тільки разом, крок за кроком, ми можемо дати дитині те, що неможливо дати в ізоляції - безпечний простір, емоційну опору, прийняття і стабільність.

🌱 Освіта та кваліфікація:
• Вища психологічна освіта
• 5-річне навчання в методі психодинамічної інтегрованої психотерапії немовлят, дітей, підлітків і молоді в Секції дитячої та юнацької психотерапії УСП
• Додаткова спеціалізована освіта з клінічної психології та психотерапії в психодинамічному підході
• Підвищення кваліфікації з дитячої психопатології
• Підвищення кваліфікації з нейропсихологічної корекції дітей і дорослих
• Навчання дитячої арт-терапії
• Ведуча психологічної трансформаційної гри «У променях сонця»

✅ Досвід:
• 1500+ консультацій: індивідуальна робота, групи, підтримка батьків
• Робота з дітьми-біженцями і дорослими в Болгарії після повномасштабного вторгнення в Україні

📍 Працюю онлайн з родинами по всьому світу
📍 Мови роботи: українська, російська, англійська

Якщо вам важко. Якщо ви не впізнаєте свою дитину. Якщо відчуваєте втому, провину, безсилля.

Ви не одні. Ви не погані батьки.
Я тут, щоб підтримати вас. І Вашу дитину. 💙💛`;

const ABOUT_RU = `👩‍⚕️ Обо мне:

Привет! Меня зовут Юлия Хацевич. Я - детский и юношеский психотерапевт в обучении, психолог и нейрокоррекционный специалист.

Я работаю с детьми, подростками и родителями, которые сталкиваются с тревогой, агрессией, эмоциональными срывами, трудностями в адаптации, обучении, самооценке или поведении. И не только: тики, самоповреждения, гиперактивность, дефицит внимания, задержки психического развития, сосание пальцев, грызение ногтей, энурезы, страхи, буллинг, потери - работа моей практики.

💛 Моя цель - не «исправить» ребенка, а помочь ему расти, понимать себя и иметь ресурс быть собой.

Я не играю в коалиции «против» родителей или «с ребенком вместо мамы». Мы - команда. Терапевтическая и живая. Ведь только вместе, шаг за шагом, мы можем дать ребенку то, что невозможно дать в изоляции - безопасное пространство, эмоциональную опору, принятие и стабильность.

🌱 Образование и квалификация:
• Высшее психологическое образование
• 5-летнее обучение в методе психодинамической интегрированной психотерапии младенцев, детей, подростков и молодежи в Секции детской и юношеской психотерапии УСП
• Дополнительное специализированное образование по клинической психологии и психотерапии в психодинамическом подходе
• Повышение квалификации по детской психопатологии
• Повышение квалификации по нейропсихологической коррекции детей и взрослых
• Обучение детской арт-терапии
• Ведущая психологической трансформационной игры «В лучах солнца»

✅ Опыт:
• 1500+ консультаций: индивидуальная работа, группы, поддержка родителей
• Работа с детьми-беженцами и взрослыми в Болгарии после полномасштабного вторжения в Украину

📍 Работаю онлайн с семьями по всему миру
📍 Языки работы: украинский, русский, английский

Если вам тяжело. Если вы не узнаете своего ребенка. Если чувствуете усталость, вину, бессилие.

Вы не одни. Вы не плохие родители.
Я здесь, чтобы поддержать вас. И Вашего ребенка. 💙💛`;

const MESSAGES = {
  ua: {
    welcome: `Привіт! 👋  
Вітаю тебе у моєму боті 🌿  

✅ Тут ти можеш отримати безкоштовні чек-лісти для батьків (7–10, 11–15, 16–18).
📚 А також окремо — корисний гайд з адаптації.

Обирай потрібний пункт меню нижче 👇`,
    checklistsList: `✅ Доступні чек-лісти:

Оберіть чек-ліст, який вас цікавить:`,
    checklistInfo: (item) => `${item.emoji} <b>${escapeHTML(item.title_ua)}</b>

📝 ${escapeHTML(item.description_ua)}

Щоб отримати чек-ліст, напишіть ваш Instagram username (без @).`,
    guidesList: `📚 Доступні гайди:

Оберіть гайд, який вас цікавить:`,
    guideInfo: (item) => `${item.emoji} <b>${escapeHTML(item.title_ua)}</b>

📝 ${escapeHTML(item.description_ua)}

Натисніть кнопку нижче, щоб відкрити гайд 👇`,
    about: ABOUT_UA,
    contacts: `📞 Мої контакти:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультацій та питань звертайтесь у Direct Instagram або до цього бота.`,
    enterUsername: 'Напишіть, будь ласка, ваш Instagram username (без @):',
    invalidUsername: 'Некоректний username. Спробуйте ще раз (без пробілів, без посилань).',
    checking: 'Дякую! ⏳',
    consultStart: `🗓️ Запис на першу безкоштовну консультацію

1) Залиште контакт у Telegram (можна натиснути кнопку нижче, або написати @username)
2) Вкажіть вік дитини
3) Опишіть, що саме турбує

Почнемо 💙💛`,
    consultAskContact: '📩 Надішліть, будь ласка, ваш контакт (кнопка нижче) або напишіть @username:',
    consultAskAge: '👶 Вкажіть вік дитини (наприклад: 9 або 9 років):',
    consultAskProblem: '📝 Коротко опишіть, що саме турбує (1–5 речень):',
    consultCancel: 'Добре, скасувала запис. Якщо захочете — натисніть кнопку запису знову 🙂',
    consultDone: '✅ Дякую! Я отримала заявку. Я напишу вам у найближчий час в Telegram/Instagram.',
    consultReview: (d) => `📝 <b>Перевірте заявку:</b>

📩 <b>Контакт:</b> ${escapeHTML(d.contact)}
👶 <b>Вік дитини:</b> ${escapeHTML(d.age)}
🧠 <b>Запит:</b>
${escapeHTML(d.problem)}

Все вірно?`
  },
  ru: {
    welcome: `Привет! 👋  
Добро пожаловать в мой бот 🌿  

✅ Здесь ты можешь получить бесплатные чек-листы для родителей (7–10, 11–15, 16–18).
📚 А также отдельно — полезный гайд по адаптации.

Выбирай нужный пункт меню ниже 👇`,
    checklistsList: `✅ Доступные чек-листы:

Выберите чек-лист, который вас интересует:`,
    checklistInfo: (item) => `${item.emoji} <b>${escapeHTML(item.title_ru)}</b>

📝 ${escapeHTML(item.description_ru)}

Чтобы получить чек-лист, напишите ваш Instagram username (без @).`,
    guidesList: `📚 Доступные гайды:

Выберите гайд, который вас интересует:`,
    guideInfo: (item) => `${item.emoji} <b>${escapeHTML(item.title_ru)}</b>

📝 ${escapeHTML(item.description_ru)}

Нажмите кнопку ниже, чтобы открыть гайд 👇`,
    about: ABOUT_RU,
    contacts: `📞 Мои контакты:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультаций и вопросов обращайтесь в Direct Instagram или в этот бот.`,
    enterUsername: 'Напишите ваш Instagram username (без @):',
    invalidUsername: 'Некорректный username. Попробуйте еще раз (без пробелов, без ссылок).',
    checking: 'Спасибо! ⏳',
    consultStart: `🗓️ Запись на первую бесплатную консультацию

1) Оставьте контакт в Telegram (можно нажать кнопку ниже или написать @username)
2) Укажите возраст ребёнка
3) Опишите, что беспокоит

Начнём 💙💛`,
    consultAskContact: '📩 Отправьте, пожалуйста, ваш контакт (кнопка ниже) или напишите @username:',
    consultAskAge: '👶 Укажите возраст ребёнка (например: 9 или 9 лет):',
    consultAskProblem: '📝 Коротко опишите, что беспокоит (1–5 предложений):',
    consultCancel: 'Ок, запись отменена. Если захотите — нажмите кнопку записи снова 🙂',
    consultDone: '✅ Спасибо! Я получила заявку. Я напишу вам в ближайшее время в Telegram/Instagram.',
    consultReview: (d) => `📝 <b>Проверьте заявку:</b>

📩 <b>Контакт:</b> ${escapeHTML(d.contact)}
👶 <b>Возраст ребёнка:</b> ${escapeHTML(d.age)}
🧠 <b>Запрос:</b>
${escapeHTML(d.problem)}

Всё верно?`
  }
};

// ===== Firestore user state =====
function userRef(chatId) {
  return db.collection('users').doc(String(chatId));
}
function checklistEventRef() {
  return db.collection('checklist_events').doc(); // auto-id
}

async function getUser(chatId) {
  const ref = userRef(chatId);
  const snap = await ref.get();
  if (!snap.exists) {
    const init = {
      id: String(chatId),
      language: 'ua',
      telegramUsername: null,
      firstName: null,
      lastName: null,
      instagramUsername: null,

      receivedChecklists: [],
      receivedGuides: [],

      currentChecklist: null,
      awaitingInstagramForChecklist: false,

      awaitingConsultation: false,
      consultStep: null,
      consultData: null,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastActivity: admin.firestore.FieldValue.serverTimestamp()
    };
    await ref.set(init, { merge: true });
    return init;
  }
  return snap.data();
}

async function saveUser(chatId, patch) {
  const ref = userRef(chatId);
  await ref.set(
    {
      ...patch,
      lastActivity: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

// ===== Admin stats helpers =====
async function getStats() {
  const usersSnap = await db.collection('users').get();
  const usersTotal = usersSnap.size;

  const checklistsCount = {};
  Object.keys(CHECKLISTS).forEach(k => (checklistsCount[k] = 0));

  usersSnap.forEach(doc => {
    const u = doc.data();
    const arr = Array.isArray(u.receivedChecklists) ? u.receivedChecklists : [];
    arr.forEach(k => {
      if (checklistsCount[k] !== undefined) checklistsCount[k] += 1;
      else checklistsCount[k] = 1;
    });
  });

  const consultSnap = await db.collection('consult_requests').get();
  const consultTotal = consultSnap.size;

  return { usersTotal, checklistsCount, consultTotal };
}

// ===== /start =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  const existing = await getUser(chatId);

  await saveUser(chatId, {
    telegramUsername: msg.from.username || null,
    firstName: msg.from.first_name || null,
    lastName: msg.from.last_name || null,
    language: existing.language || 'ua'
  });

  await bot.sendMessage(chatId, 'Выберите язык / Оберіть мову:', languageKeyboard);
});

// ===== /admin =====
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;

  try {
    const { usersTotal, checklistsCount, consultTotal } = await getStats();

    const lines = [];
    lines.push('📊 Статистика (Firestore)');
    lines.push('');
    lines.push(`👥 Пользователей: ${usersTotal}`);
    lines.push(`🗓️ Заявок на консультацию: ${consultTotal}`);
    lines.push('');
    lines.push('✅ Чек-листы (сколько человек взяли):');
    lines.push(`• Чек-лист 7–10: ${checklistsCount.checklist_7_10 || 0}`);
    lines.push(`• Чек-лист 11–15: ${checklistsCount.checklist_11_15 || 0}`);
    lines.push(`• Чек-лист 16–18: ${checklistsCount.checklist_16_18 || 0}`);
    lines.push('');
    lines.push('Команды:');
    lines.push('/admin — статистика');
    lines.push('/today — статистика за сегодня');

    await bot.sendMessage(chatId, lines.join('\n'));
  } catch (e) {
    console.log('admin stats error:', e);
    await bot.sendMessage(chatId, '❌ Не удалось получить статистику. Проверь логи Render.');
  }
});

// ===== /today =====
bot.onText(/\/today/, async (msg) => {
  const chatId = msg.chat.id;
  if (String(chatId) !== String(ADMIN_ID)) return;

  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const usersTodaySnap = await db
      .collection('users')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
      .get();

    const eventsTodaySnap = await db
      .collection('checklist_events')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
      .get();

    const perChecklist = { checklist_7_10: 0, checklist_11_15: 0, checklist_16_18: 0 };
    eventsTodaySnap.forEach(d => {
      const ev = d.data();
      if (ev.checklistKey && perChecklist[ev.checklistKey] !== undefined) {
        perChecklist[ev.checklistKey] += 1;
      }
    });

    const lines = [];
    lines.push('📅 Статистика за сегодня');
    lines.push('');
    lines.push(`🆕 Новых пользователей: ${usersTodaySnap.size}`);
    lines.push(`✅ Получили чек-листов (событий): ${eventsTodaySnap.size}`);
    lines.push('');
    lines.push('По чек-листам:');
    lines.push(`• Чек-лист 7–10: ${perChecklist.checklist_7_10}`);
    lines.push(`• Чек-лист 11–15: ${perChecklist.checklist_11_15}`);
    lines.push(`• Чек-лист 16–18: ${perChecklist.checklist_16_18}`);

    await bot.sendMessage(chatId, lines.join('\n'));
  } catch (e) {
    console.log('today stats error:', e);
    await bot.sendMessage(chatId, '❌ Не удалось получить статистику за сегодня. Проверь логи Render.');
  }
});

// ===== callback_query =====
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  const user = await getUser(chatId);

  try {
    if (data.startsWith('lang_')) {
      const lang = data.split('_')[1];
      await saveUser(chatId, { language: lang });

      try { await bot.deleteMessage(chatId, callbackQuery.message.message_id); } catch (e) {}
      await bot.sendMessage(chatId, MESSAGES[lang].welcome, getMainKeyboard(lang));
      return;
    }

    if (data === 'back_to_menu') {
      await bot.answerCallbackQuery(callbackQuery.id);
      const lang = user.language || 'ua';
      await bot.sendMessage(chatId, MESSAGES[lang].welcome, getMainKeyboard(lang));
      return;
    }

    if (data === 'show_checklists') {
      await bot.answerCallbackQuery(callbackQuery.id);
      const lang = user.language || 'ua';
      await bot.sendMessage(chatId, MESSAGES[lang].checklistsList, getChecklistsListKeyboard(lang));
      return;
    }

    if (data === 'show_guides') {
      await bot.answerCallbackQuery(callbackQuery.id);
      const lang = user.language || 'ua';
      await bot.sendMessage(chatId, MESSAGES[lang].guidesList, getGuidesListKeyboard(lang));
      return;
    }

    if (data.startsWith('checklist:')) {
      const key = data.slice('checklist:'.length);
      const item = CHECKLISTS[key];
      if (!item) return;

      const lang = user.language || 'ua';

      await saveUser(chatId, {
        currentChecklist: key,
        awaitingInstagramForChecklist: true
      });

      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[lang].checklistInfo(item), { parse_mode: 'HTML' });
      await bot.sendMessage(chatId, MESSAGES[lang].enterUsername);
      return;
    }

    if (data.startsWith('guide:')) {
      const key = data.slice('guide:'.length);
      const item = GUIDES[key];
      if (!item) return;

      const lang = user.language || 'ua';
      const received = Array.isArray(user.receivedGuides) ? user.receivedGuides : [];
      if (!received.includes(key)) received.push(key);

      await saveUser(chatId, { receivedGuides: received });

      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[lang].guideInfo(item), {
        parse_mode: 'HTML',
        ...getGuideKeyboard(key, lang)
      });
      return;
    }

    // consultation buttons
    if (data === 'consult_confirm') {
      const lang = user.language || 'ua';
      const d = user.consultData;
      if (!d) return;

      const adminMsg =
`🆕 Заявка на безкоштовну консультацію

👤 Telegram ID: ${user.id || chatId}
👤 TG: ${user.telegramUsername ? '@' + user.telegramUsername : '—'}
👤 Ім’я: ${(user.firstName || '')} ${(user.lastName || '')}

📩 Контакт: ${d.contact}
👶 Вік дитини: ${d.age}
🧠 Запит:
${d.problem}

🌐 Мова: ${lang}`;

      try { await bot.sendMessage(ADMIN_ID, adminMsg); } catch (e) {}

      await db.collection('consult_requests').add({
        userId: String(chatId),
        telegramUsername: user.telegramUsername || null,
        firstName: user.firstName || null,
        lastName: user.lastName || null,
        lang,
        contact: d.contact,
        age: d.age,
        problem: d.problem,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });

      await saveUser(chatId, {
        awaitingConsultation: false,
        consultStep: null,
        consultData: null
      });

      await bot.editMessageText(MESSAGES[lang].consultDone, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, '💙💛', getMainKeyboard(lang));
      return;
    }

    if (data === 'consult_edit') {
      const lang = user.language || 'ua';

      await saveUser(chatId, {
        awaitingConsultation: true,
        consultStep: 'contact',
        consultData: { contact: '', age: '', problem: '' }
      });

      await bot.editMessageText(MESSAGES[lang].consultAskContact, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
      return;
    }

    if (data === 'consult_cancel') {
      const lang = user.language || 'ua';

      await saveUser(chatId, {
        awaitingConsultation: false,
        consultStep: null,
        consultData: null
      });

      await bot.editMessageText(MESSAGES[lang].consultCancel, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, '💙💛', getMainKeyboard(lang));
      return;
    }

  } catch (error) {
    console.log('Ошибка обработки callback:', error);
  }
});

// ✅ contact handler
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const user = await getUser(chatId);
  const lang = user.language || 'ua';

  if (!user.awaitingConsultation || user.consultStep !== 'contact') return;

  const phone = msg.contact?.phone_number;
  if (!phone) {
    await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
    return;
  }

  const normalized = phone.startsWith('+') ? phone : `+${phone}`;
  const consultData = user.consultData || { contact: '', age: '', problem: '' };
  consultData.contact = normalized;

  await saveUser(chatId, {
    consultData,
    consultStep: 'age'
  });

  await bot.sendMessage(chatId, MESSAGES[lang].consultAskAge);
});

// ===== message =====
bot.on('message', async (msg) => {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const user = await getUser(chatId);
  const lang = user.language || 'ua';
  const text = (msg.text || '').trim();

  // cancel consult
  if (text === '❌ Скасувати' || text === '❌ Отмена') {
    await saveUser(chatId, { awaitingConsultation: false, consultStep: null, consultData: null });
    await bot.sendMessage(chatId, MESSAGES[lang].consultCancel, getMainKeyboard(lang));
    return;
  }

  // ===== Consultation flow =====
  if (user.awaitingConsultation) {
    if (user.consultStep === 'contact') {
      const contactValue = text;
      if (!contactValue) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
        return;
      }

      const consultData = user.consultData || { contact: '', age: '', problem: '' };
      consultData.contact = contactValue;

      await saveUser(chatId, { consultData, consultStep: 'age' });
      await bot.sendMessage(chatId, MESSAGES[lang].consultAskAge);
      return;
    }

    if (user.consultStep === 'age') {
      const age = text;
      if (!age || age.length > 20) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskAge);
        return;
      }

      const consultData = user.consultData || { contact: '', age: '', problem: '' };
      consultData.age = age;

      await saveUser(chatId, { consultData, consultStep: 'problem' });
      await bot.sendMessage(chatId, MESSAGES[lang].consultAskProblem);
      return;
    }

    if (user.consultStep === 'problem') {
      const problem = text;
      if (!problem) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskProblem);
        return;
      }

      const consultData = user.consultData || { contact: '', age: '', problem: '' };
      consultData.problem = problem;

      await saveUser(chatId, { consultData, consultStep: 'review' });

      await bot.sendMessage(chatId, MESSAGES[lang].consultReview(consultData), {
        parse_mode: 'HTML',
        ...consultReviewKeyboard(lang)
      });
      return;
    }

    if (user.consultStep === 'review') {
      await bot.sendMessage(chatId, lang === 'ua'
        ? 'Натисніть кнопку ✅ Підтвердити або ✏️ Змінити дані.'
        : 'Нажмите кнопку ✅ Подтвердить или ✏️ Изменить данные.'
      );
      return;
    }
  }

  // ===== Instagram username for checklist =====
  if (user.awaitingInstagramForChecklist && text && !text.startsWith('/')) {
    const username = text.replace('@', '').trim();

    if (!validateUsername(username)) {
      await bot.sendMessage(chatId, MESSAGES[lang].invalidUsername);
      return;
    }

    const checklistKey = user.currentChecklist;
    const item = CHECKLISTS[checklistKey];
    const url = getChecklistUrl(checklistKey, lang);

    if (!item || !url) {
      await saveUser(chatId, { awaitingInstagramForChecklist: false, currentChecklist: null });
      await bot.sendMessage(chatId, lang === 'ua' ? 'Помилка: чек-ліст не знайдено' : 'Ошибка: чек-лист не найден');
      return;
    }

    const received = Array.isArray(user.receivedChecklists) ? user.receivedChecklists : [];
    if (!received.includes(checklistKey)) received.push(checklistKey);

    await saveUser(chatId, {
      instagramUsername: username,
      receivedChecklists: received,
      awaitingInstagramForChecklist: false,
      currentChecklist: null
    });

    await checklistEventRef().set({
      userId: String(chatId),
      checklistKey,
      checklistTitle: lang === 'ua' ? item.title_ua : item.title_ru,
      instagramUsername: username,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await bot.sendMessage(chatId, MESSAGES[lang].checking);

    const title = (lang === 'ua' ? item.title_ua : item.title_ru);
    const successMessage = lang === 'ua'
      ? `Дякую! 🎉\n\n📥 Ось ваш чек-ліст "${title}":\n\n${url}\n\nЯкщо буде потреба — напишіть мені в Instagram 💛`
      : `Спасибо! 🎉\n\n📥 Вот ваш чек-лист "${title}":\n\n${url}\n\nЕсли понадобится — напишите мне в Instagram 💛`;

    await bot.sendMessage(chatId, successMessage, getMainKeyboard(lang));
    return;
  }

  // ===== Menu buttons =====
  if (text && !text.startsWith('/')) {
    switch (text) {
      case '✅ Вибрати чек-ліст':
      case '✅ Выбрать чек-лист':
        await bot.sendMessage(chatId, MESSAGES[lang].checklistsList, getChecklistsListKeyboard(lang));
        break;

      case '📚 Вибрати гайд':
      case '📚 Выбрать гайд':
        await bot.sendMessage(chatId, MESSAGES[lang].guidesList, getGuidesListKeyboard(lang));
        break;

      case '👩‍⚕️ Про психолога':
      case '👩‍⚕️ О психологе':
        await bot.sendMessage(chatId, MESSAGES[lang].about);
        break;

      case '📞 Контакти':
      case '📞 Контакты':
        await bot.sendMessage(chatId, MESSAGES[lang].contacts, getInstagramKeyboard());
        break;

      case '🔄 Змінити мову':
      case '🔄 Сменить язык':
        await bot.sendMessage(chatId, 'Выберите язык / Оберіть мову:', languageKeyboard);
        break;

      case '🗓️ Записатися на безкоштовну консультацію':
      case '🗓️ Записаться на бесплатную консультацию':
        await saveUser(chatId, {
          awaitingConsultation: true,
          consultStep: 'contact',
          consultData: { contact: '', age: '', problem: '' }
        });

        await bot.sendMessage(chatId, MESSAGES[lang].consultStart);
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
        break;

      default:
        await bot.sendMessage(
          chatId,
          lang === 'ua'
            ? 'Використовуйте кнопки меню для навігації 😊'
            : 'Используйте кнопки меню для навигации 😊',
          getMainKeyboard(lang)
        );
    }
  }
});

// ===== HTTP server for Render =====
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.json({
    status: 'Telegram Bot is running!',
    uptime: process.uptime(),
    firestore: 'connected'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    firestore: 'connected'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

console.log('🤖 Бот запущен!');
console.log('📱 Instagram: @childpsy_khatsevych');
console.log('✅ Администратор:', ADMIN_ID);
console.log('✅ Firestore: enabled');
