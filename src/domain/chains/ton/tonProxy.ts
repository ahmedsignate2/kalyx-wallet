/**
 * URL du proxy TonAPI de Kalyx (`ton-proxy/`, Worker Cloudflare).
 *
 * Publique, et ce n'est pas un secret : elle n'ouvre que dix routes, avec une
 * limite de débit ; la clé TonAPI reste dans le Worker. Surchargeable par
 * `EXPO_PUBLIC_TON_PROXY_URL` (un autre déploiement, par exemple).
 */
export const TON_PROXY_URL = (process.env.EXPO_PUBLIC_TON_PROXY_URL || 'https://kalyx-ton-proxy.ahamedsignate2.workers.dev').replace(/\/+$/, '');
