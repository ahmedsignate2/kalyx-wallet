import React from 'react';
import { Stack, router } from 'expo-router';
import { LegalScreen } from '../src/screens/LegalScreen';

export default function About() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LegalScreen onBack={() => router.back()} />
    </>
  );
}
