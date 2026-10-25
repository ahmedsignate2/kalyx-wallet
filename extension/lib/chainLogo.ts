/** Logo d'un réseau : le SVG embarqué de l'app en data URL, sinon l'image distante. Léger : utilisable par l'interface. */
import { chainIconUrl, embeddedChainLogo } from '../../src/domain/chains/icons';

export function chainLogo(id: string): string | undefined {
  const uri = chainIconUrl(id);
  const svg = embeddedChainLogo(uri);
  return svg ? `data:image/svg+xml,${encodeURIComponent(svg)}` : uri;
}
