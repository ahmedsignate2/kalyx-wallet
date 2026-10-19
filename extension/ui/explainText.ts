/**
 * Phrases de la fenêtre de signature PROPRES à l'extension. Les autres (ex*,
 * gp*) sont celles de l'app, mot pour mot : ui/appText.ts, généré.
 * Wallet Standard peut demander plusieurs transactions Solana d'un coup.
 */
export const EXTRA: Record<string, Record<string, string>> = {
  fr: { exManyTxs: '{n} transactions demandées : seule la première est décrite ici. Refuse si tu ne les attendais pas.' },
  en: { exManyTxs: '{n} transactions requested: only the first one is described here. Refuse if you didn’t expect them.' },
  es: { exManyTxs: '{n} transacciones solicitadas: solo se describe aquí la primera. Rechaza si no las esperabas.' },
  pt: { exManyTxs: '{n} transações solicitadas: apenas a primeira é descrita aqui. Recuse se não as esperava.' },
  de: { exManyTxs: '{n} Transaktionen angefordert: nur die erste wird hier beschrieben. Lehne ab, wenn du sie nicht erwartet hast.' },
  it: { exManyTxs: '{n} transazioni richieste: qui è descritta solo la prima. Rifiuta se non te le aspettavi.' },
  nl: { exManyTxs: '{n} transacties gevraagd: alleen de eerste wordt hier beschreven. Weiger als je ze niet verwachtte.' },
  pl: { exManyTxs: 'Żądane transakcje: {n}. Opisana jest tu tylko pierwsza. Odrzuć, jeśli się ich nie spodziewałeś.' },
  tr: { exManyTxs: '{n} işlem istendi: burada yalnızca ilki açıklanıyor. Beklemiyorsan reddet.' },
  ru: { exManyTxs: 'Запрошено транзакций: {n}. Здесь описана только первая. Отклони, если ты их не ждал.' },
  ar: { exManyTxs: 'طُلبت {n} معاملات: الأولى فقط موصوفة هنا. ارفض إذا لم تكن تتوقعها.' },
  hi: { exManyTxs: '{n} ट्रांज़ैक्शन माँगे गए: यहाँ केवल पहले का विवरण है। अगर आपको इनकी उम्मीद नहीं थी तो अस्वीकार करें।' },
  zh: { exManyTxs: '请求了 {n} 笔交易：这里只描述第一笔。如果你没有预期到，请拒绝。' },
  ja: { exManyTxs: '{n} 件のトランザクションが要求されました：ここでは最初の 1 件のみ説明しています。心当たりがなければ拒否してください。' },
  ko: { exManyTxs: '트랜잭션 {n}개가 요청되었습니다. 여기서는 첫 번째만 설명합니다. 예상하지 못했다면 거부하세요.' },
};
