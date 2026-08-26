import React, { useEffect, useState, useRef } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, Linking } from 'react-native';

import { Icon } from './icon';
import { fonts, spacing, radii, useTheme } from './theme';
import { useT } from '../lib/settingsStore';
import { getAdapter } from '../src';
import { NovaRing } from './NovaRing';

interface BridgeTrackerModalProps {
  visible: boolean;
  hash?: string;
  summary?: string;
  fromChainId?: string;
  toChainId?: string;
  onClose: () => void;
}

export function BridgeTrackerModal({ visible, hash, summary, fromChainId, toChainId, onClose }: BridgeTrackerModalProps) {
  const { colors, typography } = useTheme();
  const t = useT();
  const [status, setStatus] = useState<'PENDING' | 'DONE' | 'FAILED' | 'NOT_FOUND'>('NOT_FOUND');
  const [substatus, setSubstatus] = useState<string>('WAITING');
  const [destinationHash, setDestinationHash] = useState<string | null>(null);
  
  const fromChain = fromChainId ? getAdapter(fromChainId).config : null;
  const toChain = toChainId ? getAdapter(toChainId).config : null;

  const pollInterval = useRef<any>(null);

  useEffect(() => {
    if (!visible || !hash || !fromChain || !toChain) {
      setStatus('NOT_FOUND');
      setSubstatus('WAITING');
      setDestinationHash(null);
      return;
    }

    setStatus('PENDING');
    setSubstatus('WAITING_PAYLOAD');

    const checkStatus = async () => {
      try {
        const fromEvmId = fromChain.evmChainId || fromChain.lifiKey;
        const toEvmId = toChain.evmChainId || toChain.lifiKey;
        
        const url = `https://li.quest/v1/status?txHash=${hash}&fromChain=${fromEvmId}&toChain=${toEvmId}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status) {
          setStatus(data.status);
          if (data.substatus) setSubstatus(data.substatus);
          if (data.receiving?.txHash) {
            setDestinationHash(data.receiving.txHash);
          }

          if (data.status === 'DONE' || data.status === 'FAILED') {
            if (pollInterval.current) clearInterval(pollInterval.current);
          }
        }
      } catch (e) {
        console.warn('Bridge status poll error:', e);
      }
    };

    // Check every 10 seconds
    pollInterval.current = setInterval(checkStatus, 10000);
    checkStatus();

    return () => {
      if (pollInterval.current) clearInterval(pollInterval.current);
    };
  }, [visible, hash, fromChainId, toChainId]);

  if (!visible) return null;

  const isDone = status === 'DONE';
  const isFailed = status === 'FAILED';

  const getSubstatusText = () => {
    switch (substatus) {
      case 'WAITING_PAYLOAD': return 'Attente de validation réseau...';
      case 'PENDING': return 'Traitement par les validateurs...';
      case 'DELIVERED': return 'Fonds en cours de libération...';
      case 'COMPLETED': return 'Bridge terminé avec succès !';
      default: return 'Transfert inter-chaînes en cours...';
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing(2) }}>
        <View style={{
          backgroundColor: colors.bg,
          borderRadius: radii.xl,
          padding: spacing(3),
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.glassBorder,
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
        }}>
          {isDone ? (
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success + '20', justifyContent: 'center', alignItems: 'center', marginBottom: spacing(2) }}>
              <Icon name="check" size={32} color={colors.success} />
            </View>
          ) : isFailed ? (
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.danger + '20', justifyContent: 'center', alignItems: 'center', marginBottom: spacing(2) }}>
              <Icon name="close" size={32} color={colors.danger} />
            </View>
          ) : (
            <View style={{ marginBottom: spacing(2) }}>
              <NovaRing size={64} color={colors.accent} />
            </View>
          )}

          <Text style={[typography.title, { marginBottom: spacing(0.5) }]}>
            {isDone ? 'Fonds Reçus !' : isFailed ? 'Échec du Bridge' : 'Bridge en cours'}
          </Text>
          <Text style={[typography.muted, { textAlign: 'center', marginBottom: spacing(3) }]}>
            {summary}
          </Text>

          {/* Stepper */}
          <View style={{ width: '100%', gap: spacing(2), backgroundColor: colors.glass, padding: spacing(2), borderRadius: radii.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              <Icon name="check" size={16} color={colors.success} />
              <Text style={typography.bodyStrong}>
                Tx Source ({fromChain?.name})
              </Text>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              {isDone ? (
                <Icon name="check" size={16} color={colors.success} />
              ) : isFailed ? (
                <Icon name="close" size={16} color={colors.danger} />
              ) : (
                <ActivityIndicator size="small" color={colors.accent} />
              )}
              <View>
                <Text style={typography.bodyStrong}>
                  Relais inter-chaînes
                </Text>
                <Text style={{ fontSize: 12, color: colors.textFaint }}>
                  {isDone ? 'Complété' : getSubstatusText()}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
              {isDone ? (
                <Icon name="check" size={16} color={colors.success} />
              ) : (
                <Icon name="refresh" size={16} color={colors.textFaint} />
              )}
              <Text style={{ ...typography.bodyStrong, color: isDone ? colors.text : colors.textMuted }}>
                Fonds cibles ({toChain?.name})
              </Text>
            </View>
          </View>

          {destinationHash && toChain?.explorerUrl && (
            <Pressable 
              onPress={() => Linking.openURL(`${toChain.explorerUrl}/tx/${destinationHash}`)}
              style={{ marginTop: spacing(2), flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text style={{ color: colors.accent, fontFamily: fonts.medium, fontSize: 13 }}>
                Voir la tx de réception
              </Text>
              <Icon name="forward" size={12} color={colors.accent} />
            </Pressable>
          )}

          <Pressable
            onPress={onClose}
            style={{
              marginTop: spacing(3),
              width: '100%',
              paddingVertical: spacing(1.5),
              backgroundColor: isDone ? colors.success : colors.glass,
              borderRadius: radii.md,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: isDone ? '#fff' : colors.text, fontFamily: fonts.bold }}>
              {isDone || isFailed ? 'Fermer' : 'Réduire (en arrière-plan)'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
