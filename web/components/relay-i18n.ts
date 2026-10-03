'use client';

/**
 * Textes des pages relais (/pay, /wc, /ton-connect, /download), dans les 15
 * langues du site. Ces pages sont hors `[lang]` (le lien doit rester le même
 * pour tous) : la langue se choisit dans le navigateur — choix mémorisé du
 * sélecteur, sinon langues du navigateur. Elles n'existaient qu'en français.
 */
import { useEffect, useState } from 'react';
import { isLocale, pickLocale, STORAGE_KEY, type Locale } from '../i18n/locales';

export interface RelayText {
  opening: string;
  notInstalled: string;
  openInKalyx: string;
  downloadAndroid: string;
  paymentRequest: string;
  /** Unité d'un jeton dont le symbole n'est pas dans le lien. */
  token: string;
  /** Réseau EVM identifié par son seul numéro. */
  evmChain: (id: string) => string;
  iosSoon: string;
  redirecting: string;
  manual: string;
  openStore: (store: string) => string;
  directApk: string;
  noStore: string;
  verify: string;
  releases: string;
  source: string;
}

const T: Record<Locale, RelayText> = {
  fr: { opening: 'Ouverture de Kalyx…', notInstalled: 'Kalyx ne semble pas installée sur cet appareil.', openInKalyx: 'Ouvrir dans Kalyx', downloadAndroid: 'Télécharger Kalyx pour Android', paymentRequest: 'Demande de paiement', token: 'jeton', evmChain: (id) => `réseau EVM n° ${id}`, iosSoon: 'Kalyx arrive bientôt sur iOS.', redirecting: 'Redirection…', manual: 'Le téléchargement ne s’est pas lancé automatiquement — choisis une option :', openStore: (s) => `Ouvrir ${s}`, directApk: 'Télécharger l’APK Android directement', noStore: 'Ton appareil n’a pas encore de store Kalyx détecté — voici l’APK direct en attendant.', verify: 'Vérifie le fichier : l’empreinte SHA-256 et le certificat de signature sont publiés avec chaque version sur', releases: 'GitHub Releases', source: 'code source' },
  en: { opening: 'Opening Kalyx…', notInstalled: 'Kalyx doesn’t seem to be installed on this device.', openInKalyx: 'Open in Kalyx', downloadAndroid: 'Download Kalyx for Android', paymentRequest: 'Payment request', token: 'token', evmChain: (id) => `EVM network #${id}`, iosSoon: 'Kalyx is coming to iOS soon.', redirecting: 'Redirecting…', manual: 'The download didn’t start automatically — pick an option:', openStore: (s) => `Open ${s}`, directApk: 'Download the Android APK directly', noStore: 'No Kalyx store detected for your device yet — here is the direct APK meanwhile.', verify: 'Verify the file: the SHA-256 fingerprint and signing certificate are published with every release on', releases: 'GitHub Releases', source: 'source code' },
  es: { opening: 'Abriendo Kalyx…', notInstalled: 'Kalyx no parece estar instalada en este dispositivo.', openInKalyx: 'Abrir en Kalyx', downloadAndroid: 'Descargar Kalyx para Android', paymentRequest: 'Solicitud de pago', token: 'token', evmChain: (id) => `red EVM n.º ${id}`, iosSoon: 'Kalyx llegará pronto a iOS.', redirecting: 'Redirigiendo…', manual: 'La descarga no empezó automáticamente; elige una opción:', openStore: (s) => `Abrir ${s}`, directApk: 'Descargar el APK de Android directamente', noStore: 'Aún no se detecta ninguna tienda Kalyx para tu dispositivo: aquí tienes el APK directo.', verify: 'Verifica el archivo: la huella SHA-256 y el certificado de firma se publican con cada versión en', releases: 'GitHub Releases', source: 'código fuente' },
  pt: { opening: 'A abrir o Kalyx…', notInstalled: 'O Kalyx não parece estar instalado neste dispositivo.', openInKalyx: 'Abrir no Kalyx', downloadAndroid: 'Transferir o Kalyx para Android', paymentRequest: 'Pedido de pagamento', token: 'token', evmChain: (id) => `rede EVM n.º ${id}`, iosSoon: 'O Kalyx chega em breve ao iOS.', redirecting: 'A redirecionar…', manual: 'A transferência não começou automaticamente — escolhe uma opção:', openStore: (s) => `Abrir ${s}`, directApk: 'Transferir o APK Android diretamente', noStore: 'Ainda não há loja Kalyx detetada para o teu dispositivo — eis o APK direto entretanto.', verify: 'Verifica o ficheiro: a impressão SHA-256 e o certificado de assinatura são publicados com cada versão em', releases: 'GitHub Releases', source: 'código-fonte' },
  de: { opening: 'Kalyx wird geöffnet…', notInstalled: 'Kalyx scheint auf diesem Gerät nicht installiert zu sein.', openInKalyx: 'In Kalyx öffnen', downloadAndroid: 'Kalyx für Android herunterladen', paymentRequest: 'Zahlungsanforderung', token: 'Token', evmChain: (id) => `EVM-Netzwerk Nr. ${id}`, iosSoon: 'Kalyx kommt bald auf iOS.', redirecting: 'Weiterleitung…', manual: 'Der Download hat nicht automatisch begonnen — wähle eine Option:', openStore: (s) => `${s} öffnen`, directApk: 'Android-APK direkt herunterladen', noStore: 'Für dein Gerät wurde noch kein Kalyx-Store erkannt — hier vorerst die direkte APK.', verify: 'Prüfe die Datei: SHA-256-Fingerabdruck und Signaturzertifikat werden mit jeder Version veröffentlicht auf', releases: 'GitHub Releases', source: 'Quellcode' },
  it: { opening: 'Apertura di Kalyx…', notInstalled: 'Kalyx non sembra installata su questo dispositivo.', openInKalyx: 'Apri in Kalyx', downloadAndroid: 'Scarica Kalyx per Android', paymentRequest: 'Richiesta di pagamento', token: 'token', evmChain: (id) => `rete EVM n. ${id}`, iosSoon: 'Kalyx arriva presto su iOS.', redirecting: 'Reindirizzamento…', manual: 'Il download non è partito automaticamente — scegli un’opzione:', openStore: (s) => `Apri ${s}`, directApk: 'Scarica direttamente l’APK Android', noStore: 'Nessuno store Kalyx rilevato per il tuo dispositivo — ecco l’APK diretto nel frattempo.', verify: 'Verifica il file: impronta SHA-256 e certificato di firma sono pubblicati con ogni versione su', releases: 'GitHub Releases', source: 'codice sorgente' },
  nl: { opening: 'Kalyx wordt geopend…', notInstalled: 'Kalyx lijkt niet op dit apparaat geïnstalleerd.', openInKalyx: 'Openen in Kalyx', downloadAndroid: 'Kalyx voor Android downloaden', paymentRequest: 'Betaalverzoek', token: 'token', evmChain: (id) => `EVM-netwerk nr. ${id}`, iosSoon: 'Kalyx komt binnenkort naar iOS.', redirecting: 'Doorsturen…', manual: 'De download startte niet automatisch — kies een optie:', openStore: (s) => `${s} openen`, directApk: 'Android-APK direct downloaden', noStore: 'Nog geen Kalyx-store gevonden voor je apparaat — hier de directe APK in de tussentijd.', verify: 'Controleer het bestand: de SHA-256-vingerafdruk en het ondertekeningscertificaat staan bij elke versie op', releases: 'GitHub Releases', source: 'broncode' },
  pl: { opening: 'Otwieranie Kalyx…', notInstalled: 'Kalyx nie jest chyba zainstalowany na tym urządzeniu.', openInKalyx: 'Otwórz w Kalyx', downloadAndroid: 'Pobierz Kalyx na Androida', paymentRequest: 'Prośba o płatność', token: 'token', evmChain: (id) => `sieć EVM nr ${id}`, iosSoon: 'Kalyx wkrótce na iOS.', redirecting: 'Przekierowanie…', manual: 'Pobieranie nie rozpoczęło się automatycznie — wybierz opcję:', openStore: (s) => `Otwórz ${s}`, directApk: 'Pobierz APK Androida bezpośrednio', noStore: 'Nie wykryto jeszcze sklepu Kalyx dla twojego urządzenia — oto bezpośredni APK.', verify: 'Sprawdź plik: odcisk SHA-256 i certyfikat podpisu są publikowane z każdą wersją na', releases: 'GitHub Releases', source: 'kod źródłowy' },
  tr: { opening: 'Kalyx açılıyor…', notInstalled: 'Kalyx bu cihazda yüklü görünmüyor.', openInKalyx: 'Kalyx’te aç', downloadAndroid: 'Android için Kalyx’i indir', paymentRequest: 'Ödeme talebi', token: 'token', evmChain: (id) => `EVM ağı #${id}`, iosSoon: 'Kalyx yakında iOS’ta.', redirecting: 'Yönlendiriliyor…', manual: 'İndirme otomatik başlamadı — bir seçenek seç:', openStore: (s) => `${s} aç`, directApk: 'Android APK’yı doğrudan indir', noStore: 'Cihazın için henüz Kalyx mağazası bulunamadı — şimdilik doğrudan APK burada.', verify: 'Dosyayı doğrula: SHA-256 parmak izi ve imza sertifikası her sürümle şurada yayımlanır:', releases: 'GitHub Releases', source: 'kaynak kodu' },
  ru: { opening: 'Открываем Kalyx…', notInstalled: 'Похоже, Kalyx не установлен на этом устройстве.', openInKalyx: 'Открыть в Kalyx', downloadAndroid: 'Скачать Kalyx для Android', paymentRequest: 'Запрос на оплату', token: 'токен', evmChain: (id) => `сеть EVM № ${id}`, iosSoon: 'Kalyx скоро появится на iOS.', redirecting: 'Перенаправление…', manual: 'Загрузка не началась автоматически — выберите вариант:', openStore: (s) => `Открыть ${s}`, directApk: 'Скачать APK для Android напрямую', noStore: 'Магазин Kalyx для вашего устройства пока не найден — вот прямой APK.', verify: 'Проверьте файл: отпечаток SHA-256 и сертификат подписи публикуются с каждой версией на', releases: 'GitHub Releases', source: 'исходный код' },
  ar: { opening: 'جارٍ فتح Kalyx…', notInstalled: 'يبدو أن Kalyx غير مثبّت على هذا الجهاز.', openInKalyx: 'فتح في Kalyx', downloadAndroid: 'تنزيل Kalyx لأندرويد', paymentRequest: 'طلب دفع', token: 'رمز', evmChain: (id) => `شبكة EVM رقم ${id}`, iosSoon: 'Kalyx قادم قريبًا إلى iOS.', redirecting: 'جارٍ التحويل…', manual: 'لم يبدأ التنزيل تلقائيًا — اختر خيارًا:', openStore: (s) => `فتح ${s}`, directApk: 'تنزيل ملف APK لأندرويد مباشرة', noStore: 'لم يُكتشف متجر Kalyx لجهازك بعد — إليك ملف APK المباشر مؤقتًا.', verify: 'تحقّق من الملف: بصمة SHA-256 وشهادة التوقيع منشورة مع كل إصدار على', releases: 'GitHub Releases', source: 'الشيفرة المصدرية' },
  hi: { opening: 'Kalyx खुल रहा है…', notInstalled: 'लगता है इस डिवाइस पर Kalyx इंस्टॉल नहीं है।', openInKalyx: 'Kalyx में खोलें', downloadAndroid: 'Android के लिए Kalyx डाउनलोड करें', paymentRequest: 'भुगतान अनुरोध', token: 'टोकन', evmChain: (id) => `EVM नेटवर्क #${id}`, iosSoon: 'Kalyx जल्द ही iOS पर आ रहा है।', redirecting: 'रीडायरेक्ट हो रहा है…', manual: 'डाउनलोड अपने आप शुरू नहीं हुआ — कोई विकल्प चुनें:', openStore: (s) => `${s} खोलें`, directApk: 'Android APK सीधे डाउनलोड करें', noStore: 'आपके डिवाइस के लिए अभी कोई Kalyx स्टोर नहीं मिला — तब तक सीधा APK यह है।', verify: 'फ़ाइल जाँचें: SHA-256 फ़िंगरप्रिंट और साइनिंग सर्टिफ़िकेट हर संस्करण के साथ यहाँ प्रकाशित होते हैं:', releases: 'GitHub Releases', source: 'सोर्स कोड' },
  ja: { opening: 'Kalyx を開いています…', notInstalled: 'このデバイスには Kalyx がインストールされていないようです。', openInKalyx: 'Kalyx で開く', downloadAndroid: 'Android 版 Kalyx をダウンロード', paymentRequest: '支払いリクエスト', token: 'トークン', evmChain: (id) => `EVM ネットワーク #${id}`, iosSoon: 'Kalyx はまもなく iOS に対応します。', redirecting: 'リダイレクト中…', manual: 'ダウンロードが自動で始まりませんでした。オプションを選んでください:', openStore: (s) => `${s} を開く`, directApk: 'Android APK を直接ダウンロード', noStore: 'お使いのデバイス向けの Kalyx ストアはまだ見つかりません。当面は直接 APK をどうぞ。', verify: 'ファイルを確認してください。SHA-256 フィンガープリントと署名証明書は各バージョンとともに次で公開されています:', releases: 'GitHub Releases', source: 'ソースコード' },
  ko: { opening: 'Kalyx 여는 중…', notInstalled: '이 기기에 Kalyx가 설치되어 있지 않은 것 같습니다.', openInKalyx: 'Kalyx에서 열기', downloadAndroid: 'Android용 Kalyx 다운로드', paymentRequest: '결제 요청', token: '토큰', evmChain: (id) => `EVM 네트워크 #${id}`, iosSoon: 'Kalyx가 곧 iOS로 찾아옵니다.', redirecting: '이동 중…', manual: '다운로드가 자동으로 시작되지 않았습니다 — 옵션을 선택하세요:', openStore: (s) => `${s} 열기`, directApk: 'Android APK 직접 다운로드', noStore: '기기에 맞는 Kalyx 스토어를 아직 찾지 못했습니다 — 우선 직접 APK를 이용하세요.', verify: '파일을 확인하세요: SHA-256 지문과 서명 인증서가 버전마다 다음에 게시됩니다:', releases: 'GitHub Releases', source: '소스 코드' },
  zh: { opening: '正在打开 Kalyx…', notInstalled: '此设备似乎未安装 Kalyx。', openInKalyx: '在 Kalyx 中打开', downloadAndroid: '下载 Android 版 Kalyx', paymentRequest: '付款请求', token: '代币', evmChain: (id) => `EVM 网络 #${id}`, iosSoon: 'Kalyx 即将登陆 iOS。', redirecting: '正在跳转…', manual: '下载未自动开始——请选择一个选项：', openStore: (s) => `打开 ${s}`, directApk: '直接下载 Android APK', noStore: '尚未检测到适合你设备的 Kalyx 商店——先使用直接 APK。', verify: '请校验文件：每个版本的 SHA-256 指纹和签名证书都发布在', releases: 'GitHub Releases', source: '源代码' },
};

/** Langue de la page relais : choix mémorisé du sélecteur > navigateur > français. */
function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isLocale(saved)) return saved;
  } catch {
    /* stockage bloqué */
  }
  return pickLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

/** Textes dans la langue du visiteur (français au premier rendu statique, puis la bonne langue). */
export function useRelayText(): RelayText {
  const [locale, setLocale] = useState<Locale>('fr');
  useEffect(() => {
    const l = detectLocale();
    setLocale(l);
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
  }, []);
  return T[locale];
}
