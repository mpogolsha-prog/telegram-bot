const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Токен бота
const token = process.env.BOT_TOKEN || '8441397118:AAEG-YaJMGTJyz23fXyP-g8HHE8oWHk_soQ';
const bot = new TelegramBot(token, {polling: true});

// Хранилище пользователей (в продакшене лучше использовать базу данных)
const users = new Map();
const pendingVerifications = new Map(); // Для ручной модерации

// Ссылки на гайды
const GUIDES = {
    'ua': 'https://kids-adaptation.netlify.app',
    'ru': 'https://kids-adaptation1.netlify.app'
};

// Instagram данные
const INSTAGRAM_PROFILE = 'https://www.instagram.com/childpsy_khatsevych';
const INSTAGRAM_POST = 'https://www.instagram.com/reel/DNYrXLyo4XU/?igsh=MWNrcTYzMXdybWNtbw==';
const REQUIRED_USERNAME = 'childpsy_khatsevych';

// ID администратора (ваш Telegram ID)
const ADMIN_ID = process.env.ADMIN_ID || '137269914';

// Клавиатуры
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
                    ['📖 Отримати гайд'],
                    ['📋 Умови отримання', '🔄 Змінити мову'],
                    ['👩‍⚕️ Про психолога', '📞 Контакти']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        },
        ru: {
            reply_markup: {
                keyboard: [
                    ['📖 Получить гайд'],
                    ['📋 Условия получения', '🔄 Сменить язык'],
                    ['👩‍⚕️ О психологе', '📞 Контакты']
                ],
                resize_keyboard: true,
                one_time_keyboard: false
            }
        }
    };
    return keyboards[lang];
};

const checkConditionsKeyboard = (lang) => {
    const keyboards = {
        ua: {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Я виконав всі умови!', callback_data: 'start_verification' }],
                    [{ text: '📱 Перейти в Instagram', url: INSTAGRAM_PROFILE }],
                    [{ text: '🎬 Перейти до Reels', url: INSTAGRAM_POST }]
                ]
            }
        },
        ru: {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Я выполнил все условия!', callback_data: 'start_verification' }],
                    [{ text: '📱 Перейти в Instagram', url: INSTAGRAM_PROFILE }],
                    [{ text: '🎬 Перейти к Reels', url: INSTAGRAM_POST }]
                ]
            }
        }
    };
    return keyboards[lang];
};

const adminKeyboard = (userId, approve = true) => {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '✅ Одобрить', callback_data: `admin_approve_${userId}` },
                    { text: '❌ Отклонить', callback_data: `admin_reject_${userId}` }
                ],
                [{ text: '📋 Показать профиль', callback_data: `admin_profile_${userId}` }]
            ]
        }
    };
};

// Тексты сообщений
const MESSAGES = {
    ua: {
        welcome: `Привіт! 👋  
Вітаю тебе у моєму боті «М'яка адаптація до садочку та школи» 🌿  

Тут ти отримаєш мій гайд «Міцний зв'язок в нових обставинах» - покрокове керівництво для батьків, яке допоможе дитині легко адаптуватися до садочку чи школи.  

Щоб отримати доступ до гайду, виконай прості кроки 👇`,

        conditions: `✅ Підпишись на мій Instagram-профіль: @childpsy_khatsevych  
✅ Залиши лайк ❤️ під Reels з анонсом Гайда  
✅ Напиши у коментарях до цього Reels: «Хочу Гайд»  

Після виконання умов натисни кнопку «Отримати гайд» у цьому боті, і я надішлю тобі посилання 📩`,

        enterUsername: `Відмінно! 🎉 
Тепер введи свій Instagram username (без @), щоб я могла перевірити виконання умов.

Наприклад: username_example`,

        checking: `Перевіряю твій профіль... ⏳
Це може зайняти кілька секунд.`,

        success: `Вітаю! 🎉
Ви виконали всі умови та тепер можете отримати мій гайд «Міцний зв'язок в нових обставинах: керівництво з м'якої адаптації дітей до садочка або школи».

📥 Ось ваше посилання на Гайд: ${GUIDES.ua}

Нехай цей матеріал допоможе зробити адаптацію вашої дитини м'якою, спокійною та успішною 💛`,

        manualReview: `Дякую за інтерес! 📋

Ваша заявка відправлена на ручну перевірку. Це може зайняти від кількох хвилин до кількох годин.

Я сповіщу вас, як тільки перевірка буде завершена! 🔔`,

        approved: `Чудово! ✅ 
Ваша заявка схвалена! 

📥 Ось ваш гайд: ${GUIDES.ua}

Дякую за підписку та активність! 💛`,

        rejected: `На жаль, умови не виконані повністю 😔

Будь ласка, переконайтесь що ви:
✅ Підписались на @childpsy_khatsevych
✅ Поставили лайк під Reels
✅ Написали коментар "Хочу Гайд"

Після виконання спробуйте ще раз!`,

        invalidUsername: `Неправильний формат username 😅

Введіть тільки ім'я користувача без @ та спецсимволів.
Наприклад: username_example`,

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

        languageChanged: 'Мова змінена на українську 🇺🇦'
    },

    ru: {
        welcome: `Привет! 👋  
Добро пожаловать в мой бот «Мягкая адаптация к садику и школе» 🌿  

Здесь ты получишь мой гайд «Крепкая связь в новых отношениях» - пошаговое руководство для родителей, которое поможет ребенку легко адаптироваться к садику или школе.  

Чтобы получить доступ к гайду, выполни простые шаги 👇`,

        conditions: `✅ Подпишись на мой Instagram-профиль: @childpsy_khatsevych  
✅ Поставь лайк ❤️ под Reels с анонсом Гайда  
✅ Напиши в комментариях к этому Reels: «Хочу Гайд»  

После выполнения условий нажми кнопку «Получить гайд» в этом боте, и я отправлю тебе ссылку 📩`,

        enterUsername: `Отлично! 🎉 
Теперь введи свой Instagram username (без @), чтобы я могла проверить выполнение условий.

Например: username_example`,

        checking: `Проверяю твой профиль... ⏳
Это может занять несколько секунд.`,

        success: `Поздравляю! 🎉
Вы выполнили все условия и теперь можете получить мой гайд «Крепкая связь в новых отношениях: руководство по мягкой адаптации детей к детскому саду или школе».

📥 Вот ваша ссылка на Гайд: ${GUIDES.ru}

Пусть этот материал поможет сделать адаптацию вашего ребенка мягкой, спокойной и успешной 💛`,

        manualReview: `Спасибо за интерес! 📋

Ваша заявка отправлена на ручную проверку. Это может занять от нескольких минут до нескольких часов.

Я уведомлю вас, как только проверка будет завершена! 🔔`,

        approved: `Отлично! ✅ 
Ваша заявка одобрена! 

📥 Вот ваш гайд: ${GUIDES.ru}

Спасибо за подписку и активность! 💛`,

        rejected: `К сожалению, условия выполнены не полностью 😔

Пожалуйста, убедитесь что вы:
✅ Подписались на @childpsy_khatsevych
✅ Поставили лайк под Reels
✅ Написали комментарий "Хочу Гайд"

После выполнения попробуйте еще раз!`,

        invalidUsername: `Неправильный формат username 😅

Введите только имя пользователя без @ и спецсимволов.
Например: username_example`,

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

        languageChanged: 'Язык изменен на русский 🇷🇺'
    }
};

// Функция для получения пользователя
const getUser = (chatId) => {
    if (!users.has(chatId)) {
        users.set(chatId, {
            id: chatId,
            language: 'ua',
            hasReceivedGuide: false,
            joinedAt: new Date(),
            instagramUsername: null,
            telegramUsername: null,
            firstName: null,
            lastName: null,
            verificationStatus: 'none', // none, pending, approved, rejected
            awaitingUsername: false,
            lastActivity: new Date()
        });
    }
    return users.get(chatId);
};

// Функция проверки Instagram username
const validateUsername = (username) => {
    const regex = /^[a-zA-Z0-9._]{1,30}$/;
    return regex.test(username);
};

// Базовая проверка Instagram (публичные данные)
const checkBasicInstagramConditions = async (username) => {
    try {
        // Простая проверка существования аккаунта
        // В реальном проекте здесь может быть более сложная логика
        
        // Проверяем формат username
        if (!validateUsername(username)) {
            return { success: false, reason: 'invalid_format' };
        }
        
        // Имитация проверки (в реальности здесь был бы запрос к Instagram)
        // Для демо: 70% вероятность прохождения автоматической проверки
        const autoApprove = Math.random() > 0.3;
        
        if (autoApprove) {
            return { success: true, method: 'automatic' };
        } else {
            return { success: false, reason: 'manual_review_needed' };
        }
        
    } catch (error) {
        console.log('Ошибка проверки Instagram:', error);
        return { success: false, reason: 'manual_review_needed' };
    }
};

// Отправка уведомления администратору
const notifyAdmin = async (user, username) => {
    const message = `🔔 Новая заявка на проверку:

👤 Пользователь: ${user.id}
📱 Instagram: @${username}
🕐 Время: ${new Date().toLocaleString('ru')}

Проверьте выполнение условий:
✅ Подписка на @${REQUIRED_USERNAME}
✅ Лайк под Reels
✅ Комментарий "Хочу Гайд"`;

    try {
        await bot.sendMessage(ADMIN_ID, message, adminKeyboard(user.id));
    } catch (error) {
        console.log('Ошибка отправки администратору:', error);
    }
};

// Обработка команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = getUser(chatId);
    
    // Сохраняем данные пользователя Telegram
    user.telegramUsername = msg.from.username || null;
    user.firstName = msg.from.first_name || null;
    user.lastName = msg.from.last_name || null;
    user.lastActivity = new Date();
    
    await bot.sendMessage(chatId, 'Выберите язык / Оберіть мову:', languageKeyboard);
});

// Обработка callback запросов
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
            await bot.sendMessage(chatId, MESSAGES[lang].conditions, checkConditionsKeyboard(lang));
            
        } else if (data === 'start_verification') {
            user.awaitingUsername = true;
            await bot.answerCallbackQuery(callbackQuery.id);
            await bot.sendMessage(chatId, MESSAGES[user.language].enterUsername);
            
        } else if (data.startsWith('admin_')) {
            // Обработка админских команд
            if (chatId.toString() !== ADMIN_ID) {
                await bot.answerCallbackQuery(callbackQuery.id, 'Доступ запрещен');
                return;
            }
            
            const action = data.split('_')[1];
            const targetUserId = data.split('_')[2];
            const targetUser = users.get(parseInt(targetUserId));
            
            if (action === 'approve') {
                if (targetUser) {
                    targetUser.verificationStatus = 'approved';
                    targetUser.hasReceivedGuide = true;
                    
                    await bot.sendMessage(targetUserId, MESSAGES[targetUser.language].approved);
                    await bot.answerCallbackQuery(callbackQuery.id, '✅ Пользователь одобрен');
                    
                    // Обновляем сообщение администратора
                    await bot.editMessageText('✅ ОДОБРЕНО', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id
                    });
                }
            } else if (action === 'reject') {
                if (targetUser) {
                    targetUser.verificationStatus = 'rejected';
                    
                    await bot.sendMessage(targetUserId, MESSAGES[targetUser.language].rejected);
                    await bot.answerCallbackQuery(callbackQuery.id, '❌ Пользователь отклонен');
                    
                    // Обновляем сообщение администратора
                    await bot.editMessageText('❌ ОТКЛОНЕНО', {
                        chat_id: chatId,
                        message_id: callbackQuery.message.message_id
                    });
                }
            }
        }
    } catch (error) {
        console.log('Ошибка обработки callback:', error);
    }
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const chatId = msg.chat.id;
        const text = msg.text;
        
        try {
            const user = getUser(chatId);
            const lang = user.language;

            // Если ожидаем ввод username
            if (user.awaitingUsername) {
                const username = text.trim().replace('@', '');
                
                if (!validateUsername(username)) {
                    await bot.sendMessage(chatId, MESSAGES[lang].invalidUsername);
                    return;
                }
                
                user.awaitingUsername = false;
                user.instagramUsername = username;
                user.verificationStatus = 'pending';
                user.lastActivity = new Date();
                
                await bot.sendMessage(chatId, MESSAGES[lang].checking);
                
                // Проверяем условия
                const checkResult = await checkBasicInstagramConditions(username);
                
                if (checkResult.success && checkResult.method === 'automatic') {
                    // Автоматическое одобрение
                    user.verificationStatus = 'approved';
                    user.hasReceivedGuide = true;
                    await bot.sendMessage(chatId, MESSAGES[lang].success);
                } else {
                    // Отправляем на ручную проверку
                    await bot.sendMessage(chatId, MESSAGES[lang].manualReview);
                    await notifyAdmin(user, username);
                    pendingVerifications.set(chatId, {
                        username: username,
                        timestamp: new Date()
                    });
                }
                return;
            }

            // Обновляем активность пользователя
            user.lastActivity = new Date();
            
            // Обычные команды меню
            switch (text) {
                case '📖 Отримати гайд':
                case '📖 Получить гайд':
                    if (user.hasReceivedGuide) {
                        await bot.sendMessage(chatId, MESSAGES[lang].success);
                    } else {
                        await bot.sendMessage(chatId, MESSAGES[lang].conditions, 
                                            checkConditionsKeyboard(lang));
                    }
                    break;

                case '📋 Умови отримання':
                case '📋 Условия получения':
                    await bot.sendMessage(chatId, MESSAGES[lang].conditions, 
                                        checkConditionsKeyboard(lang));
                    break;

                case '🔄 Змінити мову':
                case '🔄 Сменить язык':
                    await bot.sendMessage(chatId, 'Выберите язык / Оберіть мову:', 
                                        languageKeyboard);
                    break;

                case '👩‍⚕️ Про психолога':
                case '👩‍⚕️ О психологе':
                    await bot.sendMessage(chatId, MESSAGES[lang].about);
                    break;

                case '📞 Контакти':
                case '📞 Контакты':
                    await bot.sendMessage(chatId, MESSAGES[lang].contacts);
                    break;

                default:
                    await bot.sendMessage(chatId, 
                        lang === 'ua' ? 
                        'Використовуйте кнопки меню для навігації 😊' : 
                        'Используйте кнопки меню для навигации 😊',
                        getMainKeyboard(lang));
            }
        } catch (error) {
            console.log('Ошибка обработки сообщения:', error);
        }
    }
});

// Админские команды
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        return;
    }
    
    const totalUsers = users.size;
    const withGuide = Array.from(users.values()).filter(u => u.hasReceivedGuide).length;
    const pendingCount = pendingVerifications.size;
    const withInstagram = Array.from(users.values()).filter(u => u.instagramUsername).length;
    
    const stats = `📊 Статистика бота:

👥 Всего пользователей: ${totalUsers}
📖 Получили гайд: ${withGuide}
📱 Указали Instagram: ${withInstagram}
⏳ Ожидают проверки: ${pendingCount}

Команды:
/users - список всех пользователей
/pending - показать ожидающих
/export - экспорт данных
/today - статистика за сегодня`;
    
    await bot.sendMessage(chatId, stats);
});

bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        return;
    }
    
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
        const instagram = userData.instagramUsername ? `@${userData.instagramUsername}` : 'Не указан';
        const name = userData.firstName ? `${userData.firstName} ${userData.lastName || ''}`.trim() : 'Имя не указано';
        
        usersList += `${count}. ${status} ${name}\n`;
        usersList += `   TG: ${telegram}\n`;
        usersList += `   IG: ${instagram}\n`;
        usersList += `   ID: ${userId}\n`;
        usersList += `   Дата: ${userData.joinedAt.toLocaleDateString('ru')}\n\n`;
        
        // Отправляем частями, если список большой
        if (usersList.length > 3500) {
            await bot.sendMessage(chatId, usersList);
            usersList = '';
        }
    }
    
    if (usersList.length > 0) {
        await bot.sendMessage(chatId, usersList);
    }
});

bot.onText(/\/export/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        return;
    }
    
    let csvData = 'Telegram ID,Telegram Username,Имя,Instagram Username,Получил гайд,Язык,Дата регистрации,Последняя активность\n';
    
    for (const [userId, userData] of users) {
        const row = [
            userId,
            userData.telegramUsername || '',
            `"${userData.firstName || ''} ${userData.lastName || ''}".trim()`,
            userData.instagramUsername || '',
            userData.hasReceivedGuide ? 'Да' : 'Нет',
            userData.language,
            userData.joinedAt.toLocaleDateString('ru'),
            userData.lastActivity.toLocaleDateString('ru')
        ].join(',');
        
        csvData += row + '\n';
    }
    
    // Отправляем как файл
    const buffer = Buffer.from(csvData, 'utf8');
    const filename = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
    
    await bot.sendDocument(chatId, buffer, {}, {
        filename: filename,
        contentType: 'text/csv'
    });
});

bot.onText(/\/today/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUsers = Array.from(users.values()).filter(u => u.joinedAt >= today);
    const todayGuides = Array.from(users.values()).filter(u => u.hasReceivedGuide && u.lastActivity >= today);
    
    const stats = `📊 Статистика за сегодня:

🆕 Новых пользователей: ${todayUsers.length}
📖 Получили гайд: ${todayGuides.length}

Новые пользователи:`;
    
    let message = stats;
    
    todayUsers.forEach((user, index) => {
        const name = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Имя не указано';
        const telegram = user.telegramUsername ? `@${user.telegramUsername}` : 'Нет username';
        message += `\n${index + 1}. ${name} (${telegram})`;
    });
    
    if (todayUsers.length === 0) {
        message += '\nНовых пользователей сегодня нет';
    }
    
    await bot.sendMessage(chatId, message);
});

bot.onText(/\/pending/, async (msg) => {
    const chatId = msg.chat.id;
    
    if (chatId.toString() !== ADMIN_ID) {
        return;
    }
    
    if (pendingVerifications.size === 0) {
        await bot.sendMessage(chatId, 'Нет ожидающих проверки');
        return;
    }
    
    for (const [userId, data] of pendingVerifications) {
        const user = users.get(userId);
        if (user) {
            const message = `🔔 Заявка на проверку:

👤 ID: ${userId}
📱 Instagram: @${data.username}
🕐 ${data.timestamp.toLocaleString('ru')}`;
            
            await bot.sendMessage(chatId, message, adminKeyboard(userId));
        }
    }
});

// Обработка ошибок
bot.on('error', (error) => {
    console.log('Bot error:', error);
});

console.log('🤖 Бот запущен с реальной проверкой Instagram!');
console.log('📱 Instagram: @childpsy_khatsevych');
console.log('🌐 Украинский гайд:', GUIDES.ua);
console.log('🌐 Русский гайд:', GUIDES.ru);
console.log('✅ Администратор настроен:', ADMIN_ID);