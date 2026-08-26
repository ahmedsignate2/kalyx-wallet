import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTheme, spacing, fonts } from './theme';
import { Icon } from './icon';

export function OfflineBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const { colors } = useTheme();

  useEffect(() => {
    let Network;
    try {
      Network = require('expo-network');
    } catch (e) {
      // Native module not found (e.g., in Dev Client before rebuild)
      return;
    }

    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        setIsConnected(state.isConnected ?? true);
      } catch (e) {
        // Fallback silently if native module fails
      }
    };
    checkNetwork();
    const interval = setInterval(checkNetwork, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isConnected) return null;

  return (
    <View style={{
      backgroundColor: colors.danger,
      padding: spacing(1),
      paddingTop: spacing(5),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing(1)
    }}>
      <Icon name="warning" size={14} color="#fff" />
      <Text style={{ color: '#fff', fontFamily: fonts.medium, fontSize: 12 }}>
        Vous êtes hors-ligne. Connexion réseau requise.
      </Text>
    </View>
  );
}
