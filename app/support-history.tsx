import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ScreenHeader } from '../ui/kit';
import { PremiumScreen, GlassCard } from '../ui/premium';
import { Icon } from '../ui/icon';
import { fonts, spacing, radii, useTheme } from '../ui/theme';
import { useT } from '../lib/settingsStore';
import { toast } from '../lib/toast';
import { haptic } from '../lib/haptics';
import { useTicketHistoryStore, type StoredTicket } from '../lib/ticketHistoryStore';
import { exportDiagnosticReport } from '../src/services/support/diagnosticService';

export default function SupportHistoryScreen() {
  const { colors, typography } = useTheme();
  const t = useT();

  const tickets = useTicketHistoryStore((s) => s.tickets);
  const clearTickets = useTicketHistoryStore((s) => s.clearTickets);

  const [isExporting, setIsExporting] = useState(false);
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  const handleCopyId = async (id: string) => {
    try {
      await Clipboard.setStringAsync(id);
      haptic.selection();
      setCopiedTicketId(id);
      toast.success(t('supportHistoryCopied'), id);
      setTimeout(() => setCopiedTicketId(null), 2500);
    } catch {
      // Ignorer l'erreur presse-papier
    }
  };

  const handleExportDiagnostic = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportDiagnosticReport();
      if (result.success) {
        haptic.success();
        const subtitle = result.method === 'clipboard' ? t('supportDiagnosticCopied') : undefined;
        toast.success(t('diagnosticSuccess'), subtitle);
      } else {
        toast.error(t('diagnosticError'), result.error);
      }
    } catch (err: any) {
      toast.error(t('diagnosticError'), err?.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      t('supportHistoryClear'),
      t('supportHistoryEmpty'),
      [
        { text: t('cancelButton'), style: 'cancel' },
        {
          text: t('supportHistoryClear'),
          style: 'destructive',
          onPress: () => {
            clearTickets();
            haptic.success();
          },
        },
      ]
    );
  };

  const formatTicketDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp);
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return '';
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <PremiumScreen>
        <ScreenHeader title={t('supportHistoryTitle')} />

        <ScrollView
          contentContainerStyle={{ gap: spacing(1.5), paddingBottom: spacing(6) }}
          showsVerticalScrollIndicator={false}
        >
          {/* Action : Export Diagnostic Système */}
          <GlassCard style={{ padding: spacing(2), gap: spacing(1) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1.25), flex: 1 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.glassStrong,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="share" size={20} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontFamily: fonts.bold }}>
                    {t('diagnosticExportButton')}
                  </Text>
                  <Text style={[typography.micro, { color: colors.textSecondary }]}>
                    {t('supportDiagnosticSubtitle')}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={handleExportDiagnostic}
                disabled={isExporting}
                style={({ pressed }) => ({
                  backgroundColor: colors.accent,
                  paddingHorizontal: spacing(2),
                  paddingVertical: spacing(1),
                  borderRadius: radii.md,
                  opacity: pressed || isExporting ? 0.7 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing(0.75),
                })}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Icon name="share" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 13 }}>
                      {t('diagnosticExportButton')}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </GlassCard>

          {/* Liste des tickets ou État vide */}
          {tickets.length === 0 ? (
            <GlassCard style={{ padding: spacing(3), alignItems: 'center', gap: spacing(1) }}>
              <Icon name="support" size={32} color={colors.textSecondary} />
              <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                {t('supportHistoryEmpty')}
              </Text>
            </GlassCard>
          ) : (
            <View style={{ gap: spacing(1.5) }}>
              {tickets.map((ticket: StoredTicket) => {
                const isCopied = copiedTicketId === ticket.id;
                const isExpanded = expandedTicketId === ticket.id;

                return (
                  <GlassCard
                    key={ticket.id}
                    style={{
                      padding: spacing(1.75),
                      gap: spacing(1),
                      borderColor: isCopied ? colors.accent : colors.glassBorder,
                      borderWidth: 1,
                    }}
                  >
                    {/* Header Ticket : ID + Date + Bouton Copier */}
                    <Pressable
                      onPress={() => handleCopyId(ticket.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1), flex: 1 }}>
                        <View
                          style={{
                            paddingHorizontal: spacing(1),
                            paddingVertical: 2,
                            borderRadius: radii.sm,
                            backgroundColor: colors.glassStrong,
                          }}
                        >
                          <Text style={{ color: colors.accent, fontFamily: fonts.bold, fontSize: 13 }}>
                            {ticket.id}
                          </Text>
                        </View>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: fonts.regular }}>
                          {formatTicketDate(ticket.createdAt)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(0.5) }}>
                        <Icon name={isCopied ? 'check' : 'copy'} size={16} color={isCopied ? colors.success : colors.accent} />
                        <Text
                          style={{
                            color: isCopied ? colors.success : colors.accent,
                            fontSize: 12,
                            fontFamily: fonts.semibold,
                          }}
                        >
                          {isCopied ? t('supportHistoryCopied') : t('aiSupportCopy')}
                        </Text>
                      </View>
                    </Pressable>

                    {/* Ligne Problème */}
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium }}>
                        {t('supportHistoryProblem')}
                      </Text>
                      <Text style={{ color: colors.text, fontSize: 14, fontFamily: fonts.semibold }} numberOfLines={isExpanded ? undefined : 2}>
                        {ticket.problem}
                      </Text>
                    </View>

                    {/* Ligne Réseau */}
                    {ticket.network ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(1) }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontFamily: fonts.medium }}>
                          {t('supportHistoryNetwork')}
                        </Text>
                        <View
                          style={{
                            paddingHorizontal: spacing(0.75),
                            paddingVertical: 1,
                            borderRadius: radii.sm,
                            backgroundColor: colors.glassStrong,
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 12, fontFamily: fonts.medium }}>
                            {ticket.network}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Ligne Erreur détectée */}
                    {ticket.detectedError && !/^(?:Non déterminée|Inconnue|N\/A|\.\.\.)$/i.test(ticket.detectedError) ? (
                      <View style={{ gap: 2 }}>
                        <Text style={{ color: colors.danger, fontSize: 12, fontFamily: fonts.medium }}>
                          {t('supportHistoryDetectedError')}
                        </Text>
                        <Text style={{ color: colors.danger, fontSize: 13, fontFamily: fonts.medium }} numberOfLines={isExpanded ? undefined : 2}>
                          {ticket.detectedError}
                        </Text>
                      </View>
                    ) : null}

                    {/* Logs ou contenu détaillé si déplié */}
                    {isExpanded && ticket.content ? (
                      <View
                        style={{
                          marginTop: spacing(0.5),
                          padding: spacing(1.25),
                          backgroundColor: colors.glassStrong,
                          borderRadius: radii.sm,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.textSecondary,
                            fontSize: 11,
                            fontFamily: fonts.regular,
                            lineHeight: 16,
                          }}
                        >
                          {ticket.content}
                        </Text>
                      </View>
                    ) : null}

                    {/* Bouton pour plier/déplier les détails */}
                    <Pressable
                      onPress={() => setExpandedTicketId(isExpanded ? null : ticket.id)}
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: spacing(0.25),
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: colors.accent, fontSize: 12, fontFamily: fonts.medium }}>
                        {isExpanded ? t('supportHistoryHideDetails') : t('supportHistoryDetails')}
                      </Text>
                    </Pressable>
                  </GlassCard>
                );
              })}

              {/* Bouton Effacer l'historique */}
              <Pressable
                onPress={handleClearHistory}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing(0.75),
                  paddingVertical: spacing(1.5),
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Icon name="broom" size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: fonts.medium }}>
                  {t('supportHistoryClear')}
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </PremiumScreen>
    </>
  );
}
