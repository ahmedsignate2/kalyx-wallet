-- Schéma D1 du bot Kalyx. UNIQUEMENT des identifiants Telegram et des adresses
-- PUBLIQUES : aucune clé, aucune phrase, aucun jeton d'API utilisateur.

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tracked_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  family TEXT NOT NULL CHECK (family IN ('evm', 'solana', 'bitcoin')),
  address TEXT NOT NULL,          -- normalisée (EVM en minuscules)
  label TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (telegram_id, address)
);
CREATE INDEX IF NOT EXISTS idx_tracked_address ON tracked_wallets(address);

CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  coin TEXT NOT NULL,             -- id CoinGecko : bitcoin, ethereum, solana…
  symbol TEXT NOT NULL,           -- BTC, ETH, SOL (affichage)
  target REAL NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  fiat TEXT NOT NULL DEFAULT 'usd',
  triggered INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON price_alerts(triggered, coin);

-- Dédoublonnage des webhooks Alchemy (rejeu) : un hash notifié une seule fois.
CREATE TABLE IF NOT EXISTS seen_tx (
  hash TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);
