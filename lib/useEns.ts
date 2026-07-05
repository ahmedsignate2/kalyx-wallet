/**
 * Hooks React pour l'ENS (reverse + avatar), destinés à l'affichage.
 *
 * `useEnsName(address)` résout l'adresse → nom ENS primaire (mainnet), avec
 * cache partagé (voir `resolveEnsName`/`lookupEnsName` côté moteur) et
 * annulation propre si le composant se démonte ou si l'adresse change. Ne
 * s'active que pour une adresse EVM `0x…` ; renvoie `null` sinon (BTC/Solana).
 * Best-effort : n'affiche rien tant que non résolu, ne casse jamais le rendu.
 */
import { useEffect, useState } from 'react';
import { lookupEnsName, resolveEnsAvatar } from '../src';

const isEvmAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a.trim());

/** Adresse → nom ENS primaire, ou null. */
export function useEnsName(address: string | undefined | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    if (!address || !isEvmAddr(address)) {
      setName(null);
      return;
    }
    let cancelled = false;
    lookupEnsName(address)
      .then((n) => !cancelled && setName(n))
      .catch(() => !cancelled && setName(null));
    return () => {
      cancelled = true;
    };
  }, [address]);
  return name;
}

/** Nom ENS → URL d'avatar, ou null. */
export function useEnsAvatar(name: string | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!name) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    resolveEnsAvatar(name)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
    };
  }, [name]);
  return url;
}
