import { Stack } from 'expo-router';
import { LegalScreen } from '../src/screens/LegalScreen';
import { goBack } from '../lib/nav';

export default function About() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LegalScreen onBack={() => goBack()} />
    </>
  );
}
