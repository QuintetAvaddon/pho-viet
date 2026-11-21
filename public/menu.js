/* Меню ресторана Phở Việt.
   Источник: страница ресторана на Яндекс.Еде (ноябрь 2026).
   Чтобы добавить фото блюда, укажите поле img: "images/pho-bo.jpg". */

window.SITE_CONFIG = {
  name: "Phở Việt",
  phone: "+7 (925) 700-56-78",
  address: "Москва",
  hours: "Ежедневно 10:00–22:00 · Китай-город до 00:00",
  // Рестораны сети. name — название точки, address — адрес (город для маршрута подставится сам),
  // hours в формате «10:00–22:00» — по нему сайт показывает «Открыто до…» по московскому времени
  // и принимает заказы только с открытия до закрытия минус orderCutoffMin минут.
  // orderHours — свои часы приёма заказов на сайте, если они отличаются (у Китай-города — до 21:30, хотя открыт до 00:00).
  // Заказы уходят в чат своей точки: переменные TELEGRAM_CHAT_ID_P1 … _P5 на Render.
  locations: [
    { id: "p1", name: "Место встречи «Патриот»", address: "ул. Саляма Адиля, 4", phone: "+7 (925) 700-56-78", hours: "10:00–22:00" },
    { id: "p2", name: "Место встречи «Орбита»", address: "просп. Андропова, 27", phone: "+7 (925) 700-56-78", hours: "10:00–22:00" },
    { id: "p3", name: "Место встречи «Среда»", address: "Элеваторная ул., 1", phone: "+7 (925) 700-56-78", hours: "10:00–22:00" },
    { id: "p4", name: "Место встречи «Янтарь»", address: "Открытое ш., 4, стр. 1", phone: "+7 (925) 700-56-78", hours: "10:00–22:00" },
    { id: "p5", name: "м. Китай-город", address: "ул. Маросейка, 4/2, стр. 1", phone: "+7 (925) 700-56-78", hours: "10:00–00:00", orderHours: "10:00–21:30" }
  ],
  orderCutoffMin: 30,                  // за сколько минут до закрытия перестаём принимать заказы
  freeDeliveryFrom: 600,               // бесплатная доставка от суммы, ₽
  deliveryFee: 199,                    // стоимость доставки ниже порога, ₽ (TODO: уточнить)
  minOrder: 0,
  // Куда отправлять заказ. server.js принимает его и пересылает в Telegram.
  // Пустая строка — демо-режим: заказ никуда не уходит, только показывается подтверждение.
  orderEndpoint: "/api/order"
};

window.CATEGORIES = [
  { id: "popular", name: "Хиты", icon: "star" },
  { id: "soups", name: "Супы", icon: "bowl" },
  { id: "lunch", name: "Ланчи и жареный рис", icon: "rice" },
  { id: "hot", name: "Горячие блюда", icon: "wok" },
  { id: "snacks", name: "Закуски", icon: "roll" },
  { id: "special", name: "Специальная еда", icon: "star" },
  { id: "salads", name: "Салаты", icon: "salad" },
  { id: "veg", name: "Вегетарианское", icon: "leaf" },
  { id: "sides", name: "Соусы и гарнир", icon: "sauce" },
  { id: "drinks", name: "Напитки", icon: "drink" }
];

/* tags: veg — вегетарианское, spicy — острое, hit — хит продаж */
window.MENU = [
  // Супы
  { id: "pho-bo", cat: "soups", name: "Суп Фо Бо", weight: "900 г", price: 710, rating: 91, votes: 120, tags: ["hit"], icon: "bowl",
    desc: "Классический ханойский фо: насыщенный говяжий бульон, томлённый много часов, рисовая лапша, тонко нарезанная говядина, свежая зелень и лайм." },
  { id: "tom-yam", cat: "soups", name: "Суп Том ям", weight: "600 г", price: 750, rating: 78, votes: 46, tags: ["hit"], icon: "bowl",
    desc: "Кисло-сладкий суп с креветками, грибами, лемонграссом и листьями лайма." },
  { id: "pho-bo-tai-lan", cat: "soups", name: "Фо Бо Тай Лан", weight: "900 г", price: 750, rating: 92, votes: 15, tags: [], icon: "bowl",
    desc: "Фо с говядиной, обжаренной с чесноком перед подачей, — более яркий и ароматный вкус бульона." },
  { id: "bun-hai-san", cat: "soups", name: "Бун хай шан", weight: "900 г", price: 740, rating: 87, votes: 11, tags: [], icon: "bowl",
    desc: "Суп с круглой рисовой лапшой бун и морепродуктами в лёгком бульоне." },
  { id: "pho-ga", cat: "soups", name: "Суп Фо Га", weight: "900 г", price: 680, rating: 88, votes: 10, tags: [], icon: "bowl",
    desc: "Фо на курином бульоне с нежным куриным мясом, рисовой лапшой и зеленью." },
  { id: "combo-soup", cat: "soups", name: "Комбо: суп и напиток из Вьетнама", weight: "900 г", price: 880, tags: [], icon: "bowl", badge: "Комбо",
    desc: "Фирменный суп и вьетнамский напиток по специальной цене." },

  // Горячие блюда
  { id: "mi-sao-bo", cat: "hot", name: "Ми сао бо", weight: "400 г", price: 720, rating: 100, votes: 8, tags: [], icon: "wok",
    desc: "Пшеничная лапша, обжаренная с говядиной и овощами." },
  { id: "pho-sao-bo", cat: "hot", name: "Фо сао бо", weight: "400 г", price: 720, rating: 87, votes: 5, tags: [], icon: "wok",
    desc: "Широкая рисовая лапша фо, обжаренная с говядиной и овощами." },
  { id: "mien-sao-bo", cat: "hot", name: "Миен сао бо", weight: "400 г", price: 720, tags: [], icon: "wok",
    desc: "Стеклянная лапша миен, обжаренная с говядиной и овощами." },
  { id: "pho-sao-hai-san", cat: "hot", name: "Фо сао хай шан", weight: "400 г", price: 770, rating: 100, votes: 3, tags: [], icon: "wok",
    desc: "Рисовая лапша фо, обжаренная с морепродуктами и овощами." },
  { id: "mien-sao-hai-san", cat: "hot", name: "Миен сао хай шан", weight: "400 г", price: 770, tags: [], icon: "wok",
    desc: "Стеклянная лапша, обжаренная с морепродуктами и овощами." },
  { id: "mi-sao-hai-san", cat: "hot", name: "Ми сао хай шан", weight: "400 г", price: 750, tags: [], icon: "wok",
    desc: "Пшеничная лапша, обжаренная с морепродуктами и овощами." },
  { id: "bun-bo-nam-bo", cat: "special", name: "Бун Бо Нам Бо", weight: "400 г", price: 700, tags: [], icon: "salad",
    desc: "Южновьетнамское блюдо: рисовая лапша бун с говядиной, свежими травами, арахисом и соусом." },
  { id: "bo-sot-tieu", cat: "special", name: "Бо сот тиеу и бань бао", weight: "400 г", price: 720, rating: 100, votes: 7, tags: [], icon: "bao",
    desc: "Говядина в перечном соусе, подаётся с паровыми булочками бань бао." },
  { id: "pho-sao-ga", cat: "hot", name: "Фо сао га", weight: "400 г", price: 720, tags: [], icon: "wok",
    desc: "Рисовая лапша фо, обжаренная с курицей и овощами." },
  { id: "mi-sao-ga", cat: "hot", name: "Ми сао га", weight: "400 г", price: 720, tags: [], icon: "wok",
    desc: "Пшеничная лапша, обжаренная с курицей и овощами." },
  { id: "mien-sao-ga", cat: "hot", name: "Миен сао га", weight: "400 г", price: 720, tags: [], icon: "wok",
    desc: "Стеклянная лапша, обжаренная с курицей и овощами." },

  // Ланч
  { id: "com-ga", cat: "lunch", name: "Ком Га (рис с курицей)", weight: "500 г", price: 670, rating: 93, votes: 32, tags: ["hit"], icon: "rice",
    desc: "Рис с курицей, овощами и фирменным соусом." },
  { id: "com-bo", cat: "lunch", name: "Ком Бо Лук Лак (рис с говядиной)", weight: "500 г", price: 700, rating: 100, votes: 11, tags: [], icon: "rice",
    desc: "Рис с кубиками обжаренной говядины лук лак, овощами и соусом." },
  { id: "com-tom", cat: "lunch", name: "Ком Том (рис с креветками)", weight: "500 г", price: 720, rating: 100, votes: 5, tags: [], icon: "rice",
    desc: "Рис с креветками, овощами и соусом." },
  { id: "com-thit-lon", cat: "lunch", name: "Ком Тхит Лен (рис со свининой)", weight: "500 г", price: 690, rating: 100, votes: 5, tags: [], icon: "rice",
    desc: "Рис со свининой, овощами и соусом." },
  { id: "com-nem", cat: "lunch", name: "Ком нем", weight: "500 г", price: 680, tags: [], icon: "rice",
    desc: "Рис с жареными спринг-роллами нем и овощами." },
  { id: "rice-seafood", cat: "lunch", name: "Жареный рис с морепродуктами", weight: "500 г", price: 720, rating: 84, votes: 5, tags: [], icon: "rice",
    desc: "Рис, обжаренный в воке с креветками, кальмаром, яйцом и овощами." },
  { id: "rice-chicken", cat: "lunch", name: "Жареный рис с курицей", weight: "500 г", price: 700, tags: [], icon: "rice",
    desc: "Рис, обжаренный в воке с курицей, яйцом и овощами." },
  { id: "rice-beef", cat: "lunch", name: "Жареный рис с говядиной", weight: "500 г", price: 700, rating: 100, votes: 4, tags: [], icon: "rice",
    desc: "Рис, обжаренный в воке с говядиной, яйцом и овощами." },

  // Закуски
  { id: "nem-cuon", cat: "snacks", name: "Нем Куон", weight: "210 г", price: 720, rating: 96, votes: 27, tags: ["hit"], icon: "roll",
    desc: "Свежие роллы в рисовой бумаге с креветками, лапшой, салатом и травами, с соусом." },
  { id: "shrimp-tempura", cat: "snacks", name: "Креветки в кляре", weight: "150 г", price: 650, rating: 96, votes: 27, tags: ["hit"], icon: "roll",
    desc: "Хрустящие креветки в лёгком кляре с соусом." },
  { id: "nem-ran", cat: "snacks", name: "Жареный нем", weight: "180 г", price: 550, rating: 97, votes: 18, tags: ["hit"], icon: "roll",
    desc: "Золотистые жареные спринг-роллы с мясной начинкой и соусом нуок чам." },
  { id: "banh-bao", cat: "snacks", name: "Бань бао", weight: "200 г", price: 330, rating: 91, votes: 34, tags: [], icon: "bao",
    desc: "Пышные паровые булочки с начинкой." },
  { id: "nem-tom", cat: "snacks", name: "Жареный нем том", weight: "180 г", price: 590, rating: 100, votes: 14, tags: [], icon: "roll",
    desc: "Жареные спринг-роллы с креветками." },
  { id: "rice-chips", cat: "snacks", name: "Рисовые чипсы", weight: "60 г", price: 310, rating: 100, votes: 4, tags: [], icon: "roll",
    desc: "Лёгкие хрустящие чипсы из рисовой бумаги." },

  // Салаты
  { id: "caesar-tom", cat: "salads", name: "Салат Цезарь с креветками", weight: "220 г", price: 580, tags: [], icon: "salad",
    desc: "Салат романо, креветки, сухарики, пармезан и соус цезарь." },
  { id: "mango-shrimp", cat: "salads", name: "Салат манго и креветки", weight: "220 г", price: 600, tags: [], icon: "salad",
    desc: "Спелое манго, креветки, свежие травы и кисло-сладкая заправка." },
  { id: "caesar-ga", cat: "salads", name: "Салат Цезарь с курицей", weight: "220 г", price: 540, tags: [], icon: "salad",
    desc: "Салат романо, курица, сухарики, пармезан и соус цезарь." },

  // Вегетарианское
  { id: "com-rang-chay", cat: "veg", name: "Ком Ранг Чай", weight: "320 г", price: 620, rating: 81, votes: 7, tags: ["veg"], icon: "rice",
    desc: "Вегетарианский жареный рис с овощами и тофу." },
  { id: "mi-sao-chay", cat: "veg", name: "Ми Сао Чай", weight: "400 г", price: 620, tags: ["veg"], icon: "wok",
    desc: "Пшеничная лапша, обжаренная с овощами и тофу." },
  { id: "mien-sao-chay", cat: "veg", name: "Миен Сао Чай", weight: "400 г", price: 620, tags: ["veg"], icon: "wok",
    desc: "Стеклянная лапша, обжаренная с овощами и тофу." },
  { id: "pho-sao-chay", cat: "veg", name: "Фо Сао Чай", weight: "400 г", price: 620, tags: ["veg"], icon: "wok",
    desc: "Рисовая лапша фо, обжаренная с овощами и тофу." },

  // Соусы и гарнир
  { id: "chili", cat: "sides", name: "Острый соус чили", weight: "30 мл", price: 50, tags: ["spicy", "veg"], icon: "sauce", desc: "Острый соус к любому блюду." },
  { id: "rice", cat: "sides", name: "Паровой рис", weight: "150 г", price: 150, rating: 78, votes: 5, tags: ["veg"], icon: "rice", desc: "Отварной жасминовый рис." },
  { id: "vinegar", cat: "sides", name: "Уксусный соус", weight: "30 мл", price: 50, tags: ["veg"], icon: "sauce", desc: "Кисло-сладкий соус на рисовом уксусе." },
  { id: "soy", cat: "sides", name: "Соевый соус", weight: "30 мл", price: 50, tags: ["veg"], icon: "sauce", desc: "Классический соевый соус." },

  // Напитки
  { id: "mango-shake", cat: "drinks", name: "Манго шейк", weight: "400 мл", price: 600, rating: 92, votes: 7, tags: [], icon: "drink", desc: "Густой коктейль из спелого манго." },
  { id: "vinut", cat: "drinks", name: "Vinut", weight: "330 мл", price: 280, rating: 83, votes: 6, tags: [], icon: "can", desc: "Вьетнамский фруктовый напиток." },
  { id: "dragon-shake", cat: "drinks", name: "Шейк из драконьего фрукта", weight: "400 мл", price: 590, tags: [], icon: "drink", desc: "Яркий коктейль из питахайи." },
  { id: "passion-fresh", cat: "drinks", name: "Фреш маракуйя", weight: "500 мл", price: 600, tags: [], icon: "drink", desc: "Освежающий напиток из маракуйи." },
  { id: "mojito-watermelon", cat: "drinks", name: "Мохито арбузный", weight: "500 мл", price: 500, tags: [], icon: "drink", desc: "Безалкогольный мохито с арбузом, мятой и лаймом." },
  { id: "coca-cola", cat: "drinks", name: "Coca-Cola", weight: "330 мл", price: 180, tags: [], icon: "can", desc: "Газированный напиток." },
  { id: "pepsi", cat: "drinks", name: "Pepsi", weight: "330 мл", price: 180, tags: [], icon: "can", desc: "Газированный напиток." },
  { id: "sprite", cat: "drinks", name: "Sprite", weight: "300 мл", price: 180, tags: [], icon: "can", desc: "Газированный напиток." },
  { id: "fanta", cat: "drinks", name: "Fanta", weight: "300 мл", price: 180, tags: [], icon: "can", desc: "Газированный напиток." }
];

window.POPULAR = ["pho-bo", "com-ga", "banh-bao", "tom-yam", "shrimp-tempura", "nem-cuon", "nem-ran", "pho-bo-tai-lan"];

/* Фото блюд: images/<id>.jpg (взяты со страницы ресторана на Яндекс.Еде).
   Чтобы заменить фото — положите свой файл с тем же именем или укажите блюду поле img. */
window.MENU.forEach(d => { if (!d.img) d.img = "images/" + d.id + ".jpg"; });
