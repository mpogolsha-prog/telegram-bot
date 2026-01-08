const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ===== ENV =====
const token = process.env.BOT_TOKEN;
if (!token) throw new Error('BOT_TOKEN is not set in environment variables');

const ADMIN_ID = process.env.ADMIN_ID || '137269914';
const INSTAGRAM_PROFILE = 'https://www.instagram.com/childpsy_khatsevych';

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
const users = new Map();

const escapeHTML = (s = '') =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const validateUsername = (username) => /^[a-zA-Z0-9._]{1,30}$/.test(username);

// ===== Checklists (3 age groups) =====
// ✅ Исправлено: у каждого чек-листа СВОЯ ссылка (как было на гайдах 7-10 / 11-15 / 16-18)
// RU версий нет → fallback на UA
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
  // RU fallback на UA, если ru не задан
  return lang === 'ru' ? (item.ru || item.ua) : item.ua;
};

// ===== Guides (separate menu) =====
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
const MESSAGES = {
  ua: {
    welcome: `Привіт! 👋  
Вітаю тебе у моєму боті 🌿  

✅ Тут ти можеш отримати безкоштовні чек-лісти для батьків.
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

    about: `👩‍⚕️ Про мене:

Привіт! Мене звати Юлія Хацевич. Я - дитячий та юнацький психотерапевт в навчанні, психолог і нейрокорекційний спеціаліст.

📍 Працюю онлайн з родинами по всьому світу
📍 Мови роботи: українська, російська, англійська`,

    contacts: `📞 Мої контакти:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультацій та питань звертайтесь у Direct Instagram або до цього бота.

Буду рада допомогти вашій родині! 🌿`,

    enterUsername: 'Напишіть, будь ласка, ваш Instagram username (без @):',
    invalidUsername: 'Некоректний username. Спробуйте ще раз (без пробілів, без посилань).',

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

✅ Здесь ты можешь получить бесплатные чек-листы для родителей.
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

    about: `👩‍⚕️ Обо мне:

Привет! Меня зовут Юлия Хацевич. Я - детский и юношеский психотерапевт в обучении, психолог и нейрокоррекционный специалист.

📍 Работаю онлайн с семьями по всему миру
📍 Языки работы: украинский, русский, английский`,

    contacts: `📞 Мои контакты:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультаций и вопросов обращайтесь в Direct Instagram или в этот бот.

Буду рада помочь вашей семье! 🌿`,

    enterUsername: 'Напишите ваш Instagram username (без @):',
    invalidUsername: 'Некорректный username. Попробуйте еще раз (без пробелов, без ссылок).',

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

// ===== User =====
const getUser = (chatId) => {
  if (!users.has(chatId)) {
    users.set(chatId, {
      id: chatId,
      language: 'ua',

      // checklists tracking
      hasReceivedChecklist: false,
      receivedChecklists: [],
      currentChecklist: null,
      awaitingInstagram: false,
      instagramUsername: null,

      // common
      joinedAt: new Date(),
      telegramUsername: null,
      firstName: null,
      lastName: null,
      lastActivity: new Date(),

      // consultation
      awaitingConsultation: false,
      consultStep: null, // 'contact' | 'age' | 'problem' | 'review'
      consultData: null
    });
  }
  return users.get(chatId);
};

// ===== /start =====
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);

  user.telegramUsername = msg.from.username || null;
  user.firstName = msg.from.first_name || null;
  user.lastName = msg.from.last_name || null;
  user.lastActivity = new Date();

  await bot.sendMessage(chatId, 'Выберите язык / Оберіть мову:', languageKeyboard);
});

// ===== callback_query =====
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const user = getUser(chatId);

  try {
    if (data.startsWith('lang_')) {
      const lang = data.split('_')[1];
      user.language = lang;

      try { await bot.deleteMessage(chatId, callbackQuery.message.message_id); } catch (e) {}
      await bot.sendMessage(chatId, MESSAGES[lang].welcome, getMainKeyboard(lang));

    } else if (data === 'show_checklists') {
      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[user.language].checklistsList, getChecklistsListKeyboard(user.language));

    } else if (data === 'show_guides') {
      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[user.language].guidesList, getGuidesListKeyboard(user.language));

    } else if (data.startsWith('checklist:')) {
      const key = data.slice('checklist:'.length);
      const item = CHECKLISTS[key];
      if (!item) return;

      user.currentChecklist = key;
      user.awaitingInstagram = true;

      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[user.language].checklistInfo(item), { parse_mode: 'HTML' });
      await bot.sendMessage(chatId, MESSAGES[user.language].enterUsername);

    } else if (data.startsWith('guide:')) {
      const key = data.slice('guide:'.length);
      const item = GUIDES[key];
      if (!item) return;

      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[user.language].guideInfo(item), {
        parse_mode: 'HTML',
        ...getGuideKeyboard(key, user.language)
      });

    } else if (data === 'back_to_menu') {
      try { await bot.deleteMessage(chatId, callbackQuery.message.message_id); } catch (e) {}
      await bot.sendMessage(chatId, MESSAGES[user.language].welcome, getMainKeyboard(user.language));

    } else if (data === 'consult_confirm') {
      const lang = user.language;
      const d = user.consultData;
      if (!d) return;

      const adminMsg =
`🆕 Заявка на безкоштовну консультацію

👤 Telegram ID: ${user.id}
👤 TG: ${user.telegramUsername ? '@' + user.telegramUsername : '—'}
👤 Ім’я: ${(user.firstName || '')} ${(user.lastName || '')}

📩 Контакт: ${d.contact}
👶 Вік дитини: ${d.age}
🧠 Запит:
${d.problem}

🌐 Мова: ${lang}`;

      try { await bot.sendMessage(ADMIN_ID, adminMsg); } catch (e) {}

      user.awaitingConsultation = false;
      user.consultStep = null;
      user.consultData = null;

      await bot.editMessageText(MESSAGES[lang].consultDone, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, '💙💛', getMainKeyboard(lang));

    } else if (data === 'consult_edit') {
      const lang = user.language;
      user.awaitingConsultation = true;
      user.consultStep = 'contact';
      user.consultData = { contact: '', age: '', problem: '' };

      await bot.editMessageText(MESSAGES[lang].consultAskContact, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));

    } else if (data === 'consult_cancel') {
      const lang = user.language;
      user.awaitingConsultation = false;
      user.consultStep = null;
      user.consultData = null;

      await bot.editMessageText(MESSAGES[lang].consultCancel, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, '💙💛', getMainKeyboard(lang));
    }
  } catch (error) {
    console.log('Ошибка обработки callback:', error);
  }
});

// ✅ отдельный хендлер контакта
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  const lang = user.language;

  if (!user.awaitingConsultation || user.consultStep !== 'contact') return;

  const phone = msg.contact?.phone_number;
  if (!phone) {
    await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
    return;
  }

  const normalized = phone.startsWith('+') ? phone : `+${phone}`;
  user.consultData = user.consultData || { contact: '', age: '', problem: '' };
  user.consultData.contact = normalized;

  user.consultStep = 'age';
  await bot.sendMessage(chatId, MESSAGES[lang].consultAskAge);
});

// ===== message =====
bot.on('message', async (msg) => {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const user = getUser(chatId);
  const lang = user.language;
  const text = msg.text || '';
  user.lastActivity = new Date();

  if (text === '❌ Скасувати' || text === '❌ Отмена') {
    user.awaitingConsultation = false;
    user.consultStep = null;
    user.consultData = null;
    await bot.sendMessage(chatId, MESSAGES[lang].consultCancel, getMainKeyboard(lang));
    return;
  }

  // консультация
  if (user.awaitingConsultation) {
    if (user.consultStep === 'contact') {
      const contactValue = (text || '').trim();
      if (!contactValue) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
        return;
      }

      user.consultData = user.consultData || { contact: '', age: '', problem: '' };
      user.consultData.contact = contactValue;

      user.consultStep = 'age';
      await bot.sendMessage(chatId, MESSAGES[lang].consultAskAge);
      return;
    }

    if (user.consultStep === 'age') {
      const age = (text || '').trim();
      if (!age || age.length > 20) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskAge);
        return;
      }

      user.consultData.age = age;
      user.consultStep = 'problem';
      await bot.sendMessage(chatId, MESSAGES[lang].consultAskProblem);
      return;
    }

    if (user.consultStep === 'problem') {
      const problem = (text || '').trim();
      if (!problem) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskProblem);
        return;
      }

      user.consultData.problem = problem;
      user.consultStep = 'review';

      await bot.sendMessage(chatId, MESSAGES[lang].consultReview(user.consultData), {
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

  // Instagram username flow for checklist
  if (user.awaitingInstagram && text && !text.startsWith('/')) {
    const username = text.trim().replace(/^@+/, '');

    if (!validateUsername(username)) {
      await bot.sendMessage(chatId, MESSAGES[lang].invalidUsername);
      return;
    }

    user.awaitingInstagram = false;
    user.instagramUsername = username;

    const key = user.currentChecklist;
    const item = CHECKLISTS[key];
    const url = getChecklistUrl(key, lang);

    if (!item || !url) {
      await bot.sendMessage(chatId, lang === 'ua' ? 'Помилка: чек-ліст не знайдено' : 'Ошибка: чек-лист не найден');
      return;
    }

    user.hasReceivedChecklist = true;
    if (!user.receivedChecklists.includes(key)) user.receivedChecklists.push(key);

    const title = (lang === 'ua' ? item.title_ua : item.title_ru);
    const successMessage = lang === 'ua'
      ? `Дякую! 🎉\n\n📥 Ось ваш чек-ліст "${title}":\n\n${url}\n\nБуду вдячна за підписку на Instagram! 👇`
      : `Спасибо! 🎉\n\n📥 Вот ваш чек-лист "${title}":\n\n${url}\n\nБуду благодарна за подписку на Instagram! 👇`;

    await bot.sendMessage(chatId, successMessage, getInstagramKeyboard());
    await bot.sendMessage(chatId, lang === 'ua' ? 'Головне меню:' : 'Главное меню:', getMainKeyboard(lang));
    return;
  }

  // меню
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
        user.awaitingConsultation = true;
        user.consultStep = 'contact';
        user.consultData = { contact: '', age: '', problem: '' };

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
    users: users.size,
    checklistsGiven: Array.from(users.values()).filter(u => u.hasReceivedChecklist).length
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    users: users.size
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

console.log('🤖 Бот запущен!');
console.log('📱 Instagram: @childpsy_khatsevych');
console.log('✅ Количество чек-листов:', Object.keys(CHECKLISTS).length);
console.log('📚 Количество гайдов:', Object.keys(GUIDES).length);
console.log('✅ Администратор:', ADMIN_ID);
