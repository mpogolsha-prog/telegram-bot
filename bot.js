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
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;');

const validateUsername = (username) => /^[a-zA-Z0-9._]{1,30}$/.test(username);

// Заглушка: твоя функция проверки Instagram (оставь свою реализацию)
async function checkBasicInstagramConditions(username) {
  return { success: true };
}

// ===== Guides =====
const GUIDES = {
  adaptation: {
    ua: 'https://kids-adaptation.netlify.app',
    ru: 'https://kids-adaptation1.netlify.app',
    title_ua: "Міцний зв'язок в нових обставинах",
    title_ru: "Крепкая связь в новых обстоятельствах",
    description_ua: "Керівництво з м'якої адаптації дітей до садочка або школи",
    description_ru: "Руководство по мягкой адаптации детей к детскому саду или школе",
    emoji: "🌿"
  },

  guide_7_10: {
    ua: "https://childpsy-guide7-10.netlify.app",
    title_ua: "Гайд 7–10 років",
    title_ru: "Гайд 7–10 лет",
    description_ua: "Міні-опитувальник: чи потрібна дитині психологічна підтримка.",
    description_ru: "Мини-опросник: нужна ли ребенку психологическая поддержка.",
    emoji: "🧩"
  },

  guide_11_15: {
    ua: "https://childpsyguide11-15.netlify.app",
    title_ua: "Гайд 11–15 років",
    title_ru: "Гайд 11–15 лет",
    description_ua: "Важкий вік чи тривожний дзвіночок? Чек-лист + результати.",
    description_ru: "Трудный возраст или тревожный сигнал? Чек-лист + результаты.",
    emoji: "🌀"
  },

  guide_16_18: {
    ua: "https://childspyguide16-18.netlify.app",
    title_ua: "Гайд 16–18 років",
    title_ru: "Гайд 16–18 лет",
    description_ua: "Незалежність чи крик про допомогу? Чек-лист + інтерпретація.",
    description_ru: "Независимость или крик о помощи? Чек-лист + интерпретация.",
    emoji: "🔥"
  }
};

// RU → fallback на UA (пока не добавишь ru версии)
const getGuideUrl = (guideKey, lang) => {
  const guide = GUIDES[guideKey];
  if (!guide) return null;
  return lang === 'ru' ? (guide.ru || guide.ua) : guide.ua;
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

const getGuidesListKeyboard = (lang) => {
  const buttons = [];
  for (const [key, guide] of Object.entries(GUIDES)) {
    const title = lang === 'ua' ? guide.title_ua : guide.title_ru;
    buttons.push([{
      text: `${guide.emoji} ${title}`,
      callback_data: `guide:${key}`
    }]);
  }
  buttons.push([{
    text: lang === 'ua' ? '🔙 Назад в меню' : '🔙 Назад в меню',
    callback_data: 'back_to_menu'
  }]);

  return { reply_markup: { inline_keyboard: buttons } };
};

const getGuideKeyboard = (guideKey, lang) => {
  const url = getGuideUrl(guideKey, lang);
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: lang === 'ua' ? '📖 Відкрити гайд' : '📖 Открыть гайд', url }],
        [{ text: lang === 'ua' ? '✅ Я виконав всі умови!' : '✅ Я выполнил все условия!', callback_data: `request:${guideKey}` }],
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

Тут ти можеш отримати мої безкоштовні гайди для батьків.

📚 Натисни "Вибрати гайд" щоб побачити всі доступні матеріали!`,

    guidesList: `📚 Доступні гайди:

Оберіть гайд, який вас цікавить:`,

    guideInfo: (guide) => `${guide.emoji} <b>${escapeHTML(guide.title_ua)}</b>

📝 ${escapeHTML(guide.description_ua)}

Щоб отримати цей гайд:
✅ Підпишись на @childpsy_khatsevych в Instagram
✅ Залиши лайк ❤️ під постом з анонсом гайда
✅ Напиши у коментарях: «Хочу Гайд»

Після виконання умов натисни кнопку "✅ Я виконав всі умови!"`,

    about: `👩‍⚕️ Про мене:

Привіт! Мене звати Юлія Хацевич. Я - дитячий та юнацький психотерапевт в навчанні, психолог і нейрокорекційний спеціаліст.

Я працюю з дітьми, підлітками та батьками, які стикаються з тривогою, агресією, емоційними зривами, труднощами в адаптації, навчанні, самооцінці чи поведінці. І не тільки: тіки, самоушкодження, гіперактивність, дефіцит уваги, затримки психічного розвитку, смоктання пальців, гризіння нігтів, енурези, страхи, булінг, втрати - робота моєї практики.

💛 Моя мета - не «виправити» дитину, а допомогти їй зростати, розуміти себе і мати ресурс бути собою.

Я не граю в коаліції «проти» батьків чи «з дитиною замість мами». Ми - команда. Терапевтична і жива. Бо тільки разом, крок за кроком, ми можемо дати дитині те, що неможливо дати в ізоляції - безпечний простір, емоційну опору, прийняття і стабільність.

🌱 Освіта та кваліфікація:
• Вища психологічна освіта
• 5-річне навчання в методі психодинамічної інтегрованої психотерапії немовлят, дітей, підлітків і молоді в Секції дитячої та юнацької психотерапії УСП
• Додаткова спеціалізована освіта з клінічної психології та психотерапії в психодинамічному підході
• Підвищення кваліфікації з дитячої психопатології
• Підвищення кваліфікації з нейропpsychологічної корекції дітей і дорослих
• Навчання дитячої арт-терапії
• Ведуча психологічної трансформаційної гри «У променях сонця»

✅ Досвід:
• 1500+ консультацій: індивідуальна робота, групи, підтримка батьків
• Робота з дітьми-біженцями і дорослими в Болгарії після повномасштабного вторгнення в Україні

📍 Працюю онлайн з родинами по всьому світу
📍 Мови роботи: українська, російська, англійська

Якщо вам важко. Якщо ви не впізнаєте свою дитину. Якщо відчуваєте втому, провину, безсилля.

Ви не одні. Ви не погані батьки.
Я тут, щоб підтримати вас. І Вашу дитину. 💙💛`,

    contacts: `📞 Мої контакти:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультацій та питань звертайтесь у Direct Instagram або до цього бота.

Буду рада допомогти вашій родині! 🌿`,

    enterUsername: 'Напишіть, будь ласка, ваш Instagram username (без @):',
    invalidUsername: 'Некоректний username. Спробуйте ще раз (без пробілів, без посилань).',
    checking: 'Перевіряю... ⏳',

    consultStart: `🗓️ Запис на першу безкоштовну консультацію

1) Залиште контакт у Telegram (можна натиснути кнопку нижче, або написати @username)
2) Вкажіть вік дитини
3) Опишіть, що саме турбує

Почнемо 👇`,
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

Здесь ты можешь получить мои бесплатные гайды для родителей.

📚 Нажми "Выбрать гайд" чтобы увидеть все доступные материалы!`,

    guidesList: `📚 Доступные гайды:

Выберите гайд, который вас интересует:`,

    guideInfo: (guide) => `${guide.emoji} <b>${escapeHTML(guide.title_ru)}</b>

📝 ${escapeHTML(guide.description_ru)}

Чтобы получить этот гайд:
✅ Подпишись на @childpsy_khatsevych в Instagram
✅ Поставь лайк ❤️ под постом с анонсом гайда
✅ Напиши в комментариях: «Хочу Гайд»

После выполнения условий нажми кнопку "✅ Я выполнил все условия!"`,

    about: `👩‍⚕️ Обо мне:

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
Я здесь, чтобы поддержать вас. И Вашего ребенка. 💙💛`,

    contacts: `📞 Мои контакты:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультаций и вопросов обращайтесь в Direct Instagram или в этот бот.

Буду рада помочь вашей семье! 🌿`,

    enterUsername: 'Напишите ваш Instagram username (без @):',
    invalidUsername: 'Некорректный username. Попробуйте еще раз (без пробелов, без ссылок).',
    checking: 'Проверяю... ⏳',

    consultStart: `🗓️ Запись на первую бесплатную консультацию

1) Оставьте контакт в Telegram (можно нажать кнопку ниже или написать @username)
2) Укажите возраст ребёнка
3) Опишите, что беспокоит

Начнём 👇`,
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
      hasReceivedGuide: false,
      receivedGuides: [],
      joinedAt: new Date(),
      telegramUsername: null,
      firstName: null,
      lastName: null,
      lastActivity: new Date(),
      currentGuide: null,
      awaitingUsername: false,
      instagramUsername: null,

      // консультация
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

    } else if (data === 'show_guides') {
      await bot.editMessageText(MESSAGES[user.language].guidesList, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        ...getGuidesListKeyboard(user.language)
      });

    } else if (data.startsWith('guide:')) {
      const guideKey = data.slice('guide:'.length);
      const guide = GUIDES[guideKey];

      if (guide) {
        user.currentGuide = guideKey;
        await bot.editMessageText(MESSAGES[user.language].guideInfo(guide), {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'HTML',
          ...getGuideKeyboard(guideKey, user.language)
        });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Guide not found', show_alert: true });
      }

    } else if (data.startsWith('request:')) {
      const guideKey = data.slice('request:'.length);
      user.currentGuide = guideKey;
      user.awaitingUsername = true;

      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[user.language].enterUsername);

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

      try {
        await bot.sendMessage(ADMIN_ID, adminMsg);
      } catch (e) {
        console.log('Admin notify error:', e.message);
      }

      user.awaitingConsultation = false;
      user.consultStep = null;
      user.consultData = null;

      await bot.editMessageText(MESSAGES[lang].consultDone, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id
      });
      await bot.sendMessage(chatId, '👇', getMainKeyboard(lang));

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

// ===== message =====
bot.on('message', async (msg) => {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const user = getUser(chatId);
  const lang = user.language;

  // контакт может прийти как msg.contact (даже без текста)
  const text = msg.text || '';
  user.lastActivity = new Date();

  // --- отмена из клавиатуры контакта ---
  if (text === '❌ Скасувати' || text === '❌ Отмена') {
    user.awaitingConsultation = false;
    user.consultStep = null;
    user.consultData = null;
    await bot.sendMessage(chatId, MESSAGES[lang].consultCancel, getMainKeyboard(lang));
    return;
  }

  // --- консультация: шаги ---
  if (user.awaitingConsultation) {
    if (user.consultStep === 'contact') {
      let contactValue = null;

      if (msg.contact && msg.contact.phone_number) {
        contactValue = `+${msg.contact.phone_number}`;
      } else if (text && text.trim()) {
        contactValue = text.trim();
      }

      if (!contactValue) {
        await bot.sendMessage(chatId, MESSAGES[lang].consultAskContact, contactKeyboard(lang));
        return;
      }

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
      if (!problem || problem.length < 5) {
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

    // review шаг — ждём callback кнопок
    if (user.consultStep === 'review') {
      await bot.sendMessage(chatId, lang === 'ua'
        ? 'Натисніть кнопку ✅ Підтвердити або ✏️ Змінити дані.'
        : 'Нажмите кнопку ✅ Подтвердить или ✏️ Изменить данные.'
      );
      return;
    }
  }

  // --- IG username flow ---
  if (user.awaitingUsername && text && !text.startsWith('/')) {
    const username = text.trim().replace('@', '');

    if (!validateUsername(username)) {
      await bot.sendMessage(chatId, MESSAGES[lang].invalidUsername);
      return;
    }

    user.awaitingUsername = false;
    user.instagramUsername = username;

    await bot.sendMessage(chatId, MESSAGES[lang].checking);

    const checkResult = await checkBasicInstagramConditions(username);

    if (checkResult.success) {
      const guideKey = user.currentGuide;
      const guide = GUIDES[guideKey];
      const guideUrl = getGuideUrl(guideKey, lang);

      if (!guide || !guideUrl) {
        await bot.sendMessage(chatId, lang === 'ua' ? 'Помилка: гайд не знайдено' : 'Ошибка: гайд не найден');
        return;
      }

      user.hasReceivedGuide = true;
      if (!user.receivedGuides.includes(guideKey)) user.receivedGuides.push(guideKey);

      const title = (lang === 'ua' ? guide.title_ua : guide.title_ru);

      const successMessage = lang === 'ua'
        ? `Вітаю! 🎉\n\n📥 Ось ваш гайд "${title}":\n\n${guideUrl}\n\nДякую за підписку! 💛`
        : `Поздравляю! 🎉\n\n📥 Вот ваш гайд "${title}":\n\n${guideUrl}\n\nСпасибо за подписку! 💛`;

      await bot.sendMessage(chatId, successMessage, getMainKeyboard(lang));
    } else {
      await bot.sendMessage(chatId, MESSAGES[lang].invalidUsername);
    }
    return;
  }

  // --- menu ---
  if (text && !text.startsWith('/')) {
    switch (text) {
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
        await bot.sendMessage(chatId, MESSAGES[lang].contacts);
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
    guidesGiven: Array.from(users.values()).filter(u => u.hasReceivedGuide).length
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
console.log('📚 Количество гайдов:', Object.keys(GUIDES).length);
console.log('✅ Администратор:', ADMIN_ID);
