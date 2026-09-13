import { useT } from "../lib/settingsStore";
/**
 * ErrorBoundary global : capture les erreurs de rendu React et les affiche à
 * l'écran (message + stack en dev) au lieu de laisser l'app se fermer.
 * Purement UI — ne touche pas au moteur crypto.
 */
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { fonts } from './theme';

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Visible dans logcat / la console Metro.
    console.error('[Kalyx] ErrorBoundary a capturé :', error?.message);
    if (error?.stack) console.error('[Kalyx] stack :', error.stack);
    if (info?.componentStack) console.error('[Kalyx] componentStack :', info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <ErrorScreen error={error} onRetry={this.reset} />;
  }
}

export function ErrorScreen({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const t = useT();
  // Couleurs volontairement EN DUR (pas de useTheme) : l'écran de crash doit
  // s'afficher même si le système de thème/le store est la cause du crash.
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#07090F' }}
      contentContainerStyle={{ padding: 24, paddingTop: 72 }}
    >
      <Text style={{ color: '#FF5C5C', fontSize: 22, fontFamily: fonts.extrabold, marginBottom: 12 }}>
        Kalyx a rencontré une erreur
      </Text>
      <Text style={{ color: '#F5F7FA', fontSize: 15, marginBottom: 16 }}>
        {error?.message || String(error)}
      </Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={{
            alignSelf: 'flex-start',
            backgroundColor: '#7C5CFF',
            borderRadius: 999,
            paddingVertical: 10,
            paddingHorizontal: 20,
            marginBottom: 20,
          }}
        >
          <Text style={{ color: '#fff', fontFamily: fonts.bold }}>{t("retry")}</Text>
        </Pressable>
      ) : null}
      {__DEV__ && error?.stack ? (
        <Text selectable style={{ color: '#8A93A6', fontSize: 12, fontFamily: 'monospace' }}>
          {error.stack}
        </Text>
      ) : null}
    </ScrollView>
  );
}
