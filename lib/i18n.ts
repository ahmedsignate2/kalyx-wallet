/**
 * Internationalisation (i18n) — dictionnaires + fonction de traduction.
 *
 * Pattern inspiré des wallets open-source (locales JSON + `t()`). Langues
 * majeures couvertes ; l'anglais sert de repli si une clé manque. Les
 * traductions sont assistées et peuvent être affinées par des locuteurs natifs.
 */
export type Lang =
  | 'fr' | 'en' | 'es' | 'pt' | 'de' | 'it' | 'nl' | 'pl'
  | 'tr' | 'ru' | 'ar' | 'hi' | 'zh' | 'ja' | 'ko';

export interface LangMeta {
  code: Lang;
  name: string; // nom natif
  flag: string;
  rtl?: boolean;
}

export const LANGUAGES: LangMeta[] = [
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', rtl: true },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

const en = {
  greeting_morning: 'Good morning',
  greeting_afternoon: 'Hello',
  greeting_evening: 'Good evening',
  greeting_night: 'Good night',
  totalValue: 'Total value',
  variationSoon: 'Live price',
  buy: 'Buy',
  send: 'Send',
  receive: 'Receive',
  convert: 'Convert',
  accounts: 'Accounts',
  viewAll: 'View all',
  addAccount: 'Add account',
  active: 'Active',
  market: 'Market',
  favorites: 'Favorites',
  top: 'Top',
  gainers: 'Gainers',
  losers: 'Losers',
  activity: 'Activity',
  viewHistory: 'History',
  navHome: 'Home',
  navMarket: 'Market',
  navExchange: 'Swap',
  navWallet: 'Wallet',
  navMore: 'More',
  settings: 'Settings',
  profile: 'Profile',
  language: 'Language',
  currency: 'Currency',
  security: 'Security',
  biometrics: 'Biometric unlock',
  changePin: 'Change PIN',
  revealPhrase: 'Show recovery phrase',
  about: 'About',
  resetWallet: 'Reset wallet',
  soon: 'Coming soon',
  cancel: 'Cancel',
  save: 'Save',
  name: 'Name',
  yourName: 'Your name',
  testnet: 'testnet',
  menu: 'More',
  contacts: 'Contacts',
  connectedApps: 'Connected apps',
  networks: 'Networks',
  appearance: 'Appearance',
  notifications: 'Notifications',
  developer: 'Developer',
  extensions: 'Extensions',
  support: 'Support',
  faq: 'FAQ',
  swap: 'Swap',
  bridge: 'Bridge',
  sell: 'Sell',
  historyTab: 'History',
  beginnerMode: 'Beginner mode',
  expertMode: 'Expert mode',
  uiMode: 'Interface mode',
  searchCrypto: 'Search a crypto…',
  general: 'General',
  advanced: 'Advanced',
};

export type Key = keyof typeof en;

/* eslint-disable @typescript-eslint/naming-convention */
const dict: Record<Lang, Partial<Record<Key, string>>> = {
  en,
  fr: {
    greeting_morning: 'Bonjour', greeting_afternoon: 'Bonjour', greeting_evening: 'Bonsoir', greeting_night: 'Bonne nuit',
    totalValue: 'Valeur totale', variationSoon: 'Prix en direct', buy: 'Acheter', send: 'Envoyer', receive: 'Recevoir', convert: 'Convertir',
    accounts: 'Comptes', viewAll: 'Tout voir', addAccount: 'Ajouter un compte', active: 'Actif',
    market: 'Marché', favorites: 'Favoris', top: 'Top', gainers: 'Gagnants', losers: 'Perdants',
    activity: 'Activité', viewHistory: 'Historique', navHome: 'Accueil', navMarket: 'Marché', navExchange: 'Échanger', navWallet: 'Portefeuille', navMore: 'Plus',
    settings: 'Réglages', profile: 'Profil', language: 'Langue', currency: 'Devise', security: 'Sécurité', biometrics: 'Déverrouillage biométrique', changePin: 'Changer le PIN', revealPhrase: 'Afficher la phrase de récupération', about: 'À propos', resetWallet: 'Réinitialiser le wallet',
    soon: 'Bientôt disponible', cancel: 'Annuler', save: 'Enregistrer', name: 'Nom', yourName: 'Ton nom', testnet: 'testnet',
    menu: 'Plus', contacts: 'Contacts', connectedApps: 'dApps connectées', networks: 'Réseaux', appearance: 'Apparence', notifications: 'Notifications', developer: 'Développeur', extensions: 'Extensions', support: 'Support', faq: 'FAQ', swap: 'Échanger', bridge: 'Bridge', sell: 'Vendre', historyTab: 'Historique', beginnerMode: 'Mode débutant', expertMode: 'Mode expert', uiMode: 'Mode d’interface', searchCrypto: 'Rechercher une crypto…', general: 'Général', advanced: 'Avancé',
  },
  es: {
    greeting_morning: 'Buenos días', greeting_afternoon: 'Hola', greeting_evening: 'Buenas noches', greeting_night: 'Buenas noches',
    totalValue: 'Valor total', variationSoon: 'Precio en vivo', buy: 'Comprar', send: 'Enviar', receive: 'Recibir', convert: 'Convertir',
    accounts: 'Cuentas', viewAll: 'Ver todo', addAccount: 'Añadir cuenta', active: 'Activa',
    market: 'Mercado', favorites: 'Favoritos', top: 'Top', gainers: 'Ganadores', losers: 'Perdedores',
    activity: 'Actividad', viewHistory: 'Historial', navHome: 'Inicio', navMarket: 'Mercado', navExchange: 'Cambiar', navWallet: 'Cartera', navMore: 'Más',
    settings: 'Ajustes', profile: 'Perfil', language: 'Idioma', currency: 'Moneda', security: 'Seguridad', biometrics: 'Desbloqueo biométrico', changePin: 'Cambiar PIN', revealPhrase: 'Mostrar frase de recuperación', about: 'Acerca de', resetWallet: 'Restablecer cartera',
    soon: 'Próximamente', cancel: 'Cancelar', save: 'Guardar', name: 'Nombre', yourName: 'Tu nombre', testnet: 'prueba',
  },
  pt: {
    greeting_morning: 'Bom dia', greeting_afternoon: 'Olá', greeting_evening: 'Boa noite', greeting_night: 'Boa noite',
    totalValue: 'Valor total', variationSoon: 'Preço ao vivo', buy: 'Comprar', send: 'Enviar', receive: 'Receber', convert: 'Converter',
    accounts: 'Contas', viewAll: 'Ver tudo', addAccount: 'Adicionar conta', active: 'Ativa',
    market: 'Mercado', favorites: 'Favoritos', top: 'Top', gainers: 'Ganhadores', losers: 'Perdedores',
    activity: 'Atividade', viewHistory: 'Histórico', navHome: 'Início', navMarket: 'Mercado', navExchange: 'Trocar', navWallet: 'Carteira', navMore: 'Mais',
    settings: 'Definições', profile: 'Perfil', language: 'Idioma', currency: 'Moeda', security: 'Segurança', biometrics: 'Desbloqueio biométrico', changePin: 'Alterar PIN', revealPhrase: 'Mostrar frase de recuperação', about: 'Sobre', resetWallet: 'Repor carteira',
    soon: 'Em breve', cancel: 'Cancelar', save: 'Guardar', name: 'Nome', yourName: 'O teu nome', testnet: 'teste',
  },
  de: {
    greeting_morning: 'Guten Morgen', greeting_afternoon: 'Hallo', greeting_evening: 'Guten Abend', greeting_night: 'Gute Nacht',
    totalValue: 'Gesamtwert', variationSoon: 'Live-Preis', buy: 'Kaufen', send: 'Senden', receive: 'Empfangen', convert: 'Umtauschen',
    accounts: 'Konten', viewAll: 'Alle ansehen', addAccount: 'Konto hinzufügen', active: 'Aktiv',
    market: 'Markt', favorites: 'Favoriten', top: 'Top', gainers: 'Gewinner', losers: 'Verlierer',
    activity: 'Aktivität', viewHistory: 'Verlauf', navHome: 'Start', navMarket: 'Markt', navExchange: 'Tauschen', navWallet: 'Wallet', navMore: 'Mehr',
    settings: 'Einstellungen', profile: 'Profil', language: 'Sprache', currency: 'Währung', security: 'Sicherheit', biometrics: 'Biometrische Entsperrung', changePin: 'PIN ändern', revealPhrase: 'Wiederherstellungsphrase anzeigen', about: 'Über', resetWallet: 'Wallet zurücksetzen',
    soon: 'Demnächst', cancel: 'Abbrechen', save: 'Speichern', name: 'Name', yourName: 'Dein Name', testnet: 'Testnetz',
  },
  it: {
    greeting_morning: 'Buongiorno', greeting_afternoon: 'Ciao', greeting_evening: 'Buonasera', greeting_night: 'Buonanotte',
    totalValue: 'Valore totale', variationSoon: 'Prezzo live', buy: 'Compra', send: 'Invia', receive: 'Ricevi', convert: 'Converti',
    accounts: 'Conti', viewAll: 'Vedi tutto', addAccount: 'Aggiungi conto', active: 'Attivo',
    market: 'Mercato', favorites: 'Preferiti', top: 'Top', gainers: 'Migliori', losers: 'Peggiori',
    activity: 'Attività', viewHistory: 'Cronologia', navHome: 'Home', navMarket: 'Mercato', navExchange: 'Scambia', navWallet: 'Portafoglio', navMore: 'Altro',
    settings: 'Impostazioni', profile: 'Profilo', language: 'Lingua', currency: 'Valuta', security: 'Sicurezza', biometrics: 'Sblocco biometrico', changePin: 'Cambia PIN', revealPhrase: 'Mostra frase di recupero', about: 'Info', resetWallet: 'Reimposta wallet',
    soon: 'Presto', cancel: 'Annulla', save: 'Salva', name: 'Nome', yourName: 'Il tuo nome', testnet: 'testnet',
  },
  nl: {
    greeting_morning: 'Goedemorgen', greeting_afternoon: 'Hallo', greeting_evening: 'Goedenavond', greeting_night: 'Goedenacht',
    totalValue: 'Totale waarde', variationSoon: 'Live prijs', buy: 'Kopen', send: 'Verzenden', receive: 'Ontvangen', convert: 'Omwisselen',
    accounts: 'Accounts', viewAll: 'Alles bekijken', addAccount: 'Account toevoegen', active: 'Actief',
    market: 'Markt', favorites: 'Favorieten', top: 'Top', gainers: 'Stijgers', losers: 'Dalers',
    activity: 'Activiteit', viewHistory: 'Geschiedenis', navHome: 'Home', navMarket: 'Markt', navExchange: 'Wisselen', navWallet: 'Portemonnee', navMore: 'Meer',
    settings: 'Instellingen', profile: 'Profiel', language: 'Taal', currency: 'Valuta', security: 'Beveiliging', biometrics: 'Biometrisch ontgrendelen', changePin: 'Pincode wijzigen', revealPhrase: 'Herstelzin tonen', about: 'Over', resetWallet: 'Wallet resetten',
    soon: 'Binnenkort', cancel: 'Annuleren', save: 'Opslaan', name: 'Naam', yourName: 'Je naam', testnet: 'testnet',
  },
  pl: {
    greeting_morning: 'Dzień dobry', greeting_afternoon: 'Cześć', greeting_evening: 'Dobry wieczór', greeting_night: 'Dobranoc',
    totalValue: 'Wartość całkowita', variationSoon: 'Cena na żywo', buy: 'Kup', send: 'Wyślij', receive: 'Odbierz', convert: 'Zamień',
    accounts: 'Konta', viewAll: 'Zobacz wszystko', addAccount: 'Dodaj konto', active: 'Aktywne',
    market: 'Rynek', favorites: 'Ulubione', top: 'Top', gainers: 'Wzrosty', losers: 'Spadki',
    activity: 'Aktywność', viewHistory: 'Historia', navHome: 'Główna', navMarket: 'Rynek', navExchange: 'Wymień', navWallet: 'Portfel', navMore: 'Więcej',
    settings: 'Ustawienia', profile: 'Profil', language: 'Język', currency: 'Waluta', security: 'Bezpieczeństwo', biometrics: 'Odblokowanie biometryczne', changePin: 'Zmień PIN', revealPhrase: 'Pokaż frazę odzyskiwania', about: 'O aplikacji', resetWallet: 'Zresetuj portfel',
    soon: 'Wkrótce', cancel: 'Anuluj', save: 'Zapisz', name: 'Imię', yourName: 'Twoje imię', testnet: 'testnet',
  },
  tr: {
    greeting_morning: 'Günaydın', greeting_afternoon: 'Merhaba', greeting_evening: 'İyi akşamlar', greeting_night: 'İyi geceler',
    totalValue: 'Toplam değer', variationSoon: 'Canlı fiyat', buy: 'Satın al', send: 'Gönder', receive: 'Al', convert: 'Dönüştür',
    accounts: 'Hesaplar', viewAll: 'Tümünü gör', addAccount: 'Hesap ekle', active: 'Aktif',
    market: 'Piyasa', favorites: 'Favoriler', top: 'En iyi', gainers: 'Yükselenler', losers: 'Düşenler',
    activity: 'Etkinlik', viewHistory: 'Geçmiş', navHome: 'Ana sayfa', navMarket: 'Piyasa', navExchange: 'Takas', navWallet: 'Cüzdan', navMore: 'Daha fazla',
    settings: 'Ayarlar', profile: 'Profil', language: 'Dil', currency: 'Para birimi', security: 'Güvenlik', biometrics: 'Biyometrik kilit açma', changePin: 'PIN değiştir', revealPhrase: 'Kurtarma ifadesini göster', about: 'Hakkında', resetWallet: 'Cüzdanı sıfırla',
    soon: 'Yakında', cancel: 'İptal', save: 'Kaydet', name: 'İsim', yourName: 'Adınız', testnet: 'test ağı',
  },
  ru: {
    greeting_morning: 'Доброе утро', greeting_afternoon: 'Здравствуйте', greeting_evening: 'Добрый вечер', greeting_night: 'Спокойной ночи',
    totalValue: 'Общая стоимость', variationSoon: 'Цена в реальном времени', buy: 'Купить', send: 'Отправить', receive: 'Получить', convert: 'Обменять',
    accounts: 'Счета', viewAll: 'Показать все', addAccount: 'Добавить счёт', active: 'Активен',
    market: 'Рынок', favorites: 'Избранное', top: 'Топ', gainers: 'Лидеры роста', losers: 'Лидеры падения',
    activity: 'Активность', viewHistory: 'История', navHome: 'Главная', navMarket: 'Рынок', navExchange: 'Обмен', navWallet: 'Кошелёк', navMore: 'Ещё',
    settings: 'Настройки', profile: 'Профиль', language: 'Язык', currency: 'Валюта', security: 'Безопасность', biometrics: 'Разблокировка по биометрии', changePin: 'Изменить PIN', revealPhrase: 'Показать фразу восстановления', about: 'О приложении', resetWallet: 'Сбросить кошелёк',
    soon: 'Скоро', cancel: 'Отмена', save: 'Сохранить', name: 'Имя', yourName: 'Ваше имя', testnet: 'тестовая сеть',
  },
  ar: {
    greeting_morning: 'صباح الخير', greeting_afternoon: 'مرحبا', greeting_evening: 'مساء الخير', greeting_night: 'تصبح على خير',
    totalValue: 'القيمة الإجمالية', variationSoon: 'السعر المباشر', buy: 'شراء', send: 'إرسال', receive: 'استلام', convert: 'تحويل',
    accounts: 'الحسابات', viewAll: 'عرض الكل', addAccount: 'إضافة حساب', active: 'نشط',
    market: 'السوق', favorites: 'المفضلة', top: 'الأعلى', gainers: 'الرابحون', losers: 'الخاسرون',
    activity: 'النشاط', viewHistory: 'السجل', navHome: 'الرئيسية', navMarket: 'السوق', navExchange: 'تبادل', navWallet: 'المحفظة', navMore: 'المزيد',
    settings: 'الإعدادات', profile: 'الملف الشخصي', language: 'اللغة', currency: 'العملة', security: 'الأمان', biometrics: 'فتح بالبصمة', changePin: 'تغيير الرمز', revealPhrase: 'إظهار عبارة الاسترداد', about: 'حول', resetWallet: 'إعادة تعيين المحفظة',
    soon: 'قريبا', cancel: 'إلغاء', save: 'حفظ', name: 'الاسم', yourName: 'اسمك', testnet: 'شبكة اختبار',
  },
  hi: {
    greeting_morning: 'सुप्रभात', greeting_afternoon: 'नमस्ते', greeting_evening: 'शुभ संध्या', greeting_night: 'शुभ रात्रि',
    totalValue: 'कुल मूल्य', variationSoon: 'लाइव मूल्य', buy: 'खरीदें', send: 'भेजें', receive: 'प्राप्त करें', convert: 'बदलें',
    accounts: 'खाते', viewAll: 'सभी देखें', addAccount: 'खाता जोड़ें', active: 'सक्रिय',
    market: 'बाज़ार', favorites: 'पसंदीदा', top: 'टॉप', gainers: 'बढ़त', losers: 'गिरावट',
    activity: 'गतिविधि', viewHistory: 'इतिहास', navHome: 'होम', navMarket: 'बाज़ार', navExchange: 'बदलें', navWallet: 'वॉलेट', navMore: 'और',
    settings: 'सेटिंग्स', profile: 'प्रोफ़ाइल', language: 'भाषा', currency: 'मुद्रा', security: 'सुरक्षा', biometrics: 'बायोमेट्रिक अनलॉक', changePin: 'पिन बदलें', revealPhrase: 'रिकवरी वाक्यांश दिखाएं', about: 'बारे में', resetWallet: 'वॉलेट रीसेट करें',
    soon: 'जल्द आ रहा है', cancel: 'रद्द करें', save: 'सहेजें', name: 'नाम', yourName: 'आपका नाम', testnet: 'टेस्टनेट',
  },
  zh: {
    greeting_morning: '早上好', greeting_afternoon: '你好', greeting_evening: '晚上好', greeting_night: '晚安',
    totalValue: '总价值', variationSoon: '实时价格', buy: '购买', send: '发送', receive: '接收', convert: '兑换',
    accounts: '账户', viewAll: '查看全部', addAccount: '添加账户', active: '当前',
    market: '市场', favorites: '收藏', top: '热门', gainers: '涨幅榜', losers: '跌幅榜',
    activity: '活动', viewHistory: '历史', navHome: '首页', navMarket: '市场', navExchange: '兑换', navWallet: '钱包', navMore: '更多',
    settings: '设置', profile: '个人资料', language: '语言', currency: '货币', security: '安全', biometrics: '生物识别解锁', changePin: '修改 PIN', revealPhrase: '显示助记词', about: '关于', resetWallet: '重置钱包',
    soon: '即将推出', cancel: '取消', save: '保存', name: '名称', yourName: '你的名字', testnet: '测试网',
  },
  ja: {
    greeting_morning: 'おはようございます', greeting_afternoon: 'こんにちは', greeting_evening: 'こんばんは', greeting_night: 'おやすみなさい',
    totalValue: '合計評価額', variationSoon: 'リアルタイム価格', buy: '購入', send: '送金', receive: '受取', convert: '交換',
    accounts: 'アカウント', viewAll: 'すべて表示', addAccount: 'アカウントを追加', active: '有効',
    market: '相場', favorites: 'お気に入り', top: 'トップ', gainers: '値上がり', losers: '値下がり',
    activity: 'アクティビティ', viewHistory: '履歴', navHome: 'ホーム', navMarket: '相場', navExchange: '交換', navWallet: 'ウォレット', navMore: 'その他',
    settings: '設定', profile: 'プロフィール', language: '言語', currency: '通貨', security: 'セキュリティ', biometrics: '生体認証ロック解除', changePin: 'PINを変更', revealPhrase: '復元フレーズを表示', about: 'アプリについて', resetWallet: 'ウォレットをリセット',
    soon: '近日公開', cancel: 'キャンセル', save: '保存', name: '名前', yourName: 'あなたの名前', testnet: 'テストネット',
  },
  ko: {
    greeting_morning: '좋은 아침', greeting_afternoon: '안녕하세요', greeting_evening: '좋은 저녁', greeting_night: '안녕히 주무세요',
    totalValue: '총 가치', variationSoon: '실시간 가격', buy: '구매', send: '보내기', receive: '받기', convert: '전환',
    accounts: '계정', viewAll: '전체 보기', addAccount: '계정 추가', active: '활성',
    market: '시장', favorites: '즐겨찾기', top: '상위', gainers: '상승', losers: '하락',
    activity: '활동', viewHistory: '기록', navHome: '홈', navMarket: '시장', navExchange: '스왑', navWallet: '지갑', navMore: '더보기',
    settings: '설정', profile: '프로필', language: '언어', currency: '통화', security: '보안', biometrics: '생체 인식 잠금 해제', changePin: 'PIN 변경', revealPhrase: '복구 문구 표시', about: '정보', resetWallet: '지갑 초기화',
    soon: '곧 제공', cancel: '취소', save: '저장', name: '이름', yourName: '이름', testnet: '테스트넷',
  },
};
/* eslint-enable @typescript-eslint/naming-convention */

/** Traduit une clé pour une langue, avec repli anglais. */
export function translate(lang: Lang, key: Key): string {
  return dict[lang]?.[key] ?? en[key];
}

export function isRtl(lang: Lang): boolean {
  return LANGUAGES.find((l) => l.code === lang)?.rtl ?? false;
}
