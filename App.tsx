import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider } from '@/context/SettingsContext';
import { SettingsProvider as CfbSettingsProvider } from '@/cfb/context/SettingsContext';
import { TeamsProvider } from '@/context/TeamsContext';
import { TeamsProvider as CfbTeamsProvider } from '@/cfb/context/TeamsContext';
import { LeagueProvider } from '@/league/LeagueContext';
import { EntitlementsProvider } from '@/context/EntitlementsContext';
import { EngagementProvider } from '@/context/EngagementContext';
import { SocialProvider } from '@/social/SocialContext';
import { LiveProvider } from '@/live/LiveContext';
import { PrefsProvider } from '@/context/PrefsContext';
import { SplashGate } from '@/components/SplashGate';
import { RootNavigator } from '@/navigation/RootNavigator';

/**
 * Both leagues are mounted at once. The NFL dataset ships in the bundle; the
 * college one streams in behind it. That costs a little memory and buys an
 * instant league switch, plus a card and a paywall that can read both seasons
 * as one record.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <PrefsProvider>
       <SettingsProvider>
        <CfbSettingsProvider>
          <TeamsProvider>
            <CfbTeamsProvider>
              <LeagueProvider>
                <LiveProvider>
                  <EntitlementsProvider>
                    <EngagementProvider>
                      <SocialProvider>
                        <StatusBar style="light" />
                        <SplashGate>
                          <RootNavigator />
                        </SplashGate>
                      </SocialProvider>
                    </EngagementProvider>
                  </EntitlementsProvider>
                </LiveProvider>
              </LeagueProvider>
            </CfbTeamsProvider>
          </TeamsProvider>
        </CfbSettingsProvider>
       </SettingsProvider>
      </PrefsProvider>
    </SafeAreaProvider>
  );
}
