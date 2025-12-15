const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// ⚠️ Токен только из ENV (не хардкодим)
const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is not set in environment variables');
}

const bot = new TelegramBot(token, { polling: true });

// ID администратора
const ADMIN_ID = process.env.ADMIN_ID || '137269914';

// Хранилище пользователей
const users = new Map();

// Instagram данные
const INSTAGRAM_PROFILE = 'https://www.instagram.com/childpsy_khatsevych';

// Ссылки на гайды
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

// ===== Клавиатуры =====
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
      // ✅ фикс: двоеточие вместо underscore (иначе ключи с _ ломаются)
      callback_data: `guide:${key}`
    }]);
  }

  buttons.push([{
    text: lang === 'ua' ? '🔙 Назад в меню' : '🔙 Назад в меню',
    callback_data: 'back_to_menu'
  }]);

  return {
    reply_markup: {
      inline_keyboard: buttons
    }
  };
};

const getGuideKeyboard = (guideKey, lang) => {
  const url = getGuideUrl(guideKey, lang);

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: lang === 'ua' ? '📖 Відкрити гайд' : '📖 Открыть гайд', url }],
        // ✅ фикс: двоеточие вместо underscore
        [{ text: lang === 'ua' ? '✅ Я виконав всі умови!' : '✅ Я выполнил все условия!', callback_data: `request:${guideKey}` }],
        [{ text: '📱 Перейти в Instagram', url: INSTAGRAM_PROFILE }],
        [{ text: lang === 'ua' ? '🔙 Назад до списку' : '🔙 Назад к списку', callback_data: 'show_guides' }]
      ]
    }
  };
};

// ===== Тексты сообщений =====
const MESSAGES = {
  ua: {
    welcome: `Привіт! 👋  
Вітаю тебе у моєму боті 🌿  

Тут ти можеш отримати мої безкоштовні гайди для батьків.

📚 Натисни "Вибрати гайд" щоб побачити всі доступні матеріали!`,

    guidesList: `📚 Доступні гайди:

Оберіть гайд, який вас цікавить:`,

    guideInfo: (guide) => `${guide.emoji} **${guide.title_ua}**

📝 ${guide.description_ua}

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
Я тут, щоб підтримати вас. І Вашу дитину. 💙💛`,

    contacts: `📞 Мої контакти:

Instagram: @childpsy_khatsevych
${INSTAGRAM_PROFILE}

Для консультацій та питань звертайтесь у Direct Instagram або до цього бота.

Буду рада допомогти вашій родині! 🌿`,

    languageChanged: 'Мова змінена на українську 🇺🇦',

    enterUsername: 'Напишіть, будь ласка, ваш Instagram username (без @):',
    invalidUsername: 'Некоректний username. Спробуйте ще раз (без пробілів, без посилань).',
    checking: 'Перевіряю... ⏳'
  },

  ru: {
    welcome: `Привет! 👋  
Добро пожаловать в мой бот 🌿  

Здесь ты можешь получить мои бесплатные гайды для родителей.

📚 Нажми "Выбрать гайд" чтобы увидеть все доступные материалы!`,

    guidesList: `📚 Доступные гайды:

Выберите гайд, который вас интересует:`,

    guideInfo: (guide) => `${guide.emoji} **${guide.title_ru}**

📝 ${guide.description_ru}

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

    languageChanged: 'Язык изменен на русский 🇷🇺',

    enterUsername: 'Напишите ваш Instagram username (без @):',
    invalidUsername: 'Некорректный username. Попробуйте еще раз (без пробелов, без ссылок).',
    checking: 'Проверяю... ⏳'
  }
};

// ===== Пользователь =====
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
      instagramUsername: null
    });
  }
  return users.get(chatId);
};

// Примитивная проверка username (без ссылок/пробелов)
const validateUsername = (username) => /^[a-zA-Z0-9._]{1,30}$/.test(username);

// Заглушка: твоя функция проверки Instagram (оставь свою реализацию)
async function checkBasicInstagramConditions(username) {
  // если у тебя есть реальная проверка — вставь сюда
  return { success: true };
}

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

// ===== callback =====
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const user = getUser(chatId);

  try {
    if (data.startsWith('lang_')) {
      const lang = data.split('_')[1];
      user.language = lang;

      await bot.deleteMessage(chatId, callbackQuery.message.message_id);
      await bot.sendMessage(chatId, MESSAGES[lang].welcome, getMainKeyboard(lang));

    } else if (data === 'show_guides') {
      await bot.editMessageText(MESSAGES[user.language].guidesList, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        ...getGuidesListKeyboard(user.language)
      });

    } else if (data.startsWith('guide:')) {
      // ✅ фикс: получаем ключ полностью
      const guideKey = data.slice('guide:'.length);
      const guide = GUIDES[guideKey];

      if (guide) {
        user.currentGuide = guideKey;

        await bot.editMessageText(MESSAGES[user.language].guideInfo(guide), {
          chat_id: chatId,
          message_id: callbackQuery.message.message_id,
          parse_mode: 'Markdown',
          ...getGuideKeyboard(guideKey, user.language)
        });
      } else {
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Guide not found', show_alert: true });
      }

    } else if (data.startsWith('request:')) {
      // ✅ фикс: получаем ключ полностью
      const guideKey = data.slice('request:'.length);
      user.currentGuide = guideKey;
      user.awaitingUsername = true;

      await bot.answerCallbackQuery(callbackQuery.id);
      await bot.sendMessage(chatId, MESSAGES[user.language].enterUsername);

    } else if (data === 'back_to_menu') {
      await bot.deleteMessage(chatId, callbackQuery.message.message_id);
      await bot.sendMessage(chatId, MESSAGES[user.language].welcome, getMainKeyboard(user.language));
    }
  } catch (error) {
    console.log('Ошибка обработки callback:', error);
  }
});

// ===== messages =====
bot.on('message', async (msg) => {
  if (msg.text && !msg.text.startsWith('/')) {
    const chatId = msg.chat.id;
    const text = msg.text;

    try {
      const user = getUser(chatId);
      const lang = user.language;

      user.lastActivity = new Date();

      // ожидание Instagram username
      if (user.awaitingUsername) {
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

        default:
          await bot.sendMessage(
            chatId,
            lang === 'ua'
              ? 'Використовуйте кнопки меню для навігації 😊'
              : 'Используйте кнопки меню для навигации 😊',
            getMainKeyboard(lang)
          );
      }
    } catch (error) {
      console.log('Ошибка обработки сообщения:', error);
    }
  }
});

// ===== Admin =====
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_ID) return;

  const totalUsers = users.size;
  const withGuide = Array.from(users.values()).filter(u => u.hasReceivedGuide).length;

  const stats = `📊 Статистика бота:

👥 Всего пользователей: ${totalUsers}
📖 Получили гайд: ${withGuide}

Команды:
/users - список всех пользователей
/export - экспорт данных
/today - статистика за сегодня`;

  await bot.sendMessage(chatId, stats);
});

bot.onText(/\/users/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_ID) return;

  if (users.size === 0) {
    await bot.sendMessage(chatId, 'Пользователей нет');
    return;
  }

  let usersList = '👥 Список пользователей:\n\n';
  let count = 0;

  for (const [userId, userData] of users) {
    count++;
    const status = userData.hasReceivedGuide ? '✅' : '⏳';
    const telegram = userData.telegramUsername ? `@${userData.telegramUsername}` : 'Нет username';
    const name = userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : 'Имя не указано';

    usersList += `${count}. ${status} ${name}\n`;
    usersList += `   TG: ${telegram}\n`;
    usersList += `   ID: ${userId}\n`;
    usersList += `   Дата: ${userData.joinedAt.toLocaleDateString('ru')}\n\n`;

    if (usersList.length > 3500) {
      await bot.sendMessage(chatId, usersList);
      usersList = '';
    }
  }

  if (usersList.length > 0) await bot.sendMessage(chatId, usersList);
});

bot.onText(/\/export/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_ID) return;

  let csvData = 'Telegram ID,Telegram Username,Имя,Получил гайд,Язык,Дата регистрации,Последняя активность\n';

  for (const [userId, userData] of users) {
    const row = [
      userId,
      userData.telegramUsername || '',
      `"${((userData.firstName || '') + ' ' + (userData.lastName || '')).trim()}"`,
      userData.hasReceivedGuide ? 'Да' : 'Нет',
      userData.language,
      userData.joinedAt.toLocaleDateString('ru'),
      userData.lastActivity.toLocaleDateString('ru')
    ].join(',');

    csvData += row + '\n';
  }

  const buffer = Buffer.from(csvData, 'utf8');
  const filename = `users_export_${new Date().toISOString().split('T')[0]}.csv`;

  await bot.sendDocument(chatId, buffer, {}, { filename, contentType: 'text/csv' });
});

bot.onText(/\/today/, async (msg) => {
  const chatId = msg.chat.id;
  if (chatId.toString() !== ADMIN_ID) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayUsers = Array.from(users.values()).filter(u => u.joinedAt >= today);
  const todayGuides = Array.from(users.values()).filter(u => u.hasReceivedGuide && u.lastActivity >= today);

  let message = `📊 Статистика за сегодня:

🆕 Новых пользователей: ${todayUsers.length}
📖 Получили гайд: ${todayGuides.length}

Новые пользователи:`;

  if (todayUsers.length === 0) {
    message += '\nНовых пользователей сегодня нет';
  } else {
    todayUsers.forEach((user, index) => {
      const name = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Имя не указано';
      const telegram = user.telegramUsername ? `@${user.telegramUsername}` : 'Нет username';
      message += `\n${index + 1}. ${name} (${telegram})`;
    });
  }

  await bot.sendMessage(chatId, message);
});

// Ошибки
bot.on('error', (error) => {
  console.log('Bot error:', error);
});

console.log('🤖 Бот запущен!');
console.log('📱 Instagram: @childpsy_khatsevych');
console.log('📚 Количество гайдов:', Object.keys(GUIDES).length);
console.log('✅ Администратор:', ADMIN_ID);

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
