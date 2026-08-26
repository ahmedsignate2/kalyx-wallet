import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
// @ts-ignore
import * as Network from 'expo-network';
import { useTheme, spacing, fonts } from './theme';
import { Icon } from './icon';

export function OfflineBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const { colors } = useTheme();

  useEffect(() => {
    const checkNetwork = async () => {
      const state = await Network.getNetworkStateAsync();
      setIsConnected(state.isConnected ?? true);
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
      paddingTop: spacing(5), // SafeArea substitute for top
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
