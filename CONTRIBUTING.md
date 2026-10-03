# Contributing to Kalyx Wallet

Suggestions, bug reports, feature requests, translations, and technical
feedback are welcome.

For general suggestions or improvements:

**Contact:** Telegram [@kalyxntw](https://t.me/kalyxntw) or X [@kalyxntw](https://x.com/kalyxntw)

Please never include:

- Recovery phrases
- Private keys
- Passwords
- API keys
- Authentication tokens
- Other sensitive wallet information

## Beta feedback

Kalyx is in **open beta**. The most useful reports say what you did, what you
expected, what happened, the app version (Menu → About) and the network. Send
them from the app (Support), on Telegram [@kalyxntw](https://t.me/kalyxntw), or
as a GitHub Issue — **security issues privately only**, see [SECURITY.md](SECURITY.md).

## Development

See [MOBILE_SETUP.md](MOBILE_SETUP.md) to run the app locally and
[ANDROID_GUIDE.md](ANDROID_GUIDE.md) for builds and releases. Before pushing:

```bash
npm run typecheck
npm test
node scripts/check-repo-files.mjs
node scripts/check-address-usage.mjs
```

Every user-facing string goes through `lib/i18n.ts` (15 languages) — never
hard-coded text.

## Pull Requests

Before submitting a Pull Request:

1. Explain clearly what was changed.
2. Test your changes.
3. Make sure no secrets are included.
4. Explain any security-sensitive changes.
