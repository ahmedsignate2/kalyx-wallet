/**
 * Lien de téléchargement de l'APK. Par défaut, le fichier est servi par le site
 * (`web/public/kalyx-wallet.apk`) ; sur un hébergeur qui limite la taille des
 * fichiers (Cloudflare Pages : 25 Mo, Vercel : 100 Mo), pointer vers une
 * GitHub Release : NEXT_PUBLIC_APK_URL=https://github.com/<user>/<repo>/releases/latest/download/kalyx-wallet.apk
 */
export const APK_URL = process.env.NEXT_PUBLIC_APK_URL?.trim() || '/kalyx-wallet.apk';
