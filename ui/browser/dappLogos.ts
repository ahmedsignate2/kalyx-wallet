/**
 * Logos des dApps du catalogue, EMBARQUÉS dans l'app (96 px).
 *
 * Aucune requête au moment de l'affichage : ni Google, ni un service de
 * favicons n'apprend quels sites l'utilisateur ouvre. Une dApp absente d'ici
 * garde son monogramme coloré (dappCatalog).
 */
import type { ImageSourcePropType } from 'react-native';

export const DAPP_LOGOS: Readonly<Record<string, ImageSourcePropType>> = {
  'app.1inch.io': require('../../assets/dapps/app-1inch-io.png'),
  'app.aave.com': require('../../assets/dapps/app-aave-com.png'),
  'app.across.to': require('../../assets/dapps/app-across-to.png'),
  'app.compound.finance': require('../../assets/dapps/app-compound-finance.png'),
  'app.eigenlayer.xyz': require('../../assets/dapps/app-eigenlayer-xyz.png'),
  'app.morpho.org': require('../../assets/dapps/app-morpho-org.png'),
  'app.ston.fi': require('../../assets/dapps/app-ston-fi.png'),
  'app.uniswap.org': require('../../assets/dapps/app-uniswap-org.png'),
  'blur.io': require('../../assets/dapps/blur-io.png'),
  'curve.fi': require('../../assets/dapps/curve-fi.png'),
  'jup.ag': require('../../assets/dapps/jup-ag.png'),
  'magiceden.io': require('../../assets/dapps/magiceden-io.png'),
  'marinade.finance': require('../../assets/dapps/marinade-finance.png'),
  'opensea.io': require('../../assets/dapps/opensea-io.png'),
  'pancakeswap.finance': require('../../assets/dapps/pancakeswap-finance.png'),
  'stake.lido.fi': require('../../assets/dapps/stake-lido-fi.png'),
  'stake.rocketpool.net': require('../../assets/dapps/stake-rocketpool-net.png'),
  'stargate.finance': require('../../assets/dapps/stargate-finance.png'),
  'www.jito.network': require('../../assets/dapps/www-jito-network.png'),
  // Émetteurs de cartes (avatars officiels de leurs organisations GitHub : gnosispay, holyheld, spritz-finance)
  'app.gnosispay.com': require('../../assets/dapps/app-gnosispay-com.png'),
  'app.holyheld.com': require('../../assets/dapps/app-holyheld-com.png'),
  'app.spritz.finance': require('../../assets/dapps/app-spritz-finance.png'),
};
