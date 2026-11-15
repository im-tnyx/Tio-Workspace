import { router, Tabs } from 'expo-router';
import { PreviewGate } from '@/bootstrap/shell/PreviewGate';
import { View } from 'react-native';
import { ROOT_TABS, ROOT_TAB_HREFS, validateTabs } from '@/bootstrap/shell/tabRegistry';
import { BottomTabBar } from '@/shared/ui/BottomTabBar';
import { RootChromeProvider, RootTopBar } from '@/shared/ui/RootChrome';
import { copy } from '@/shared/i18n/en';

validateTabs(ROOT_TABS);
export default function TabsLayout() {
  return <PreviewGate><RootChromeProvider><View style={{ flex: 1 }}>
    <Tabs screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}
      tabBar={({ state }) => <BottomTabBar
        tabs={ROOT_TABS} selectedRoute={state.routes[state.index]?.name ?? 'home'}
        onSelect={tab => router.navigate(ROOT_TAB_HREFS[tab.routeName])}
      />}>
      {ROOT_TABS.map(tab => <Tabs.Screen key={tab.key}
        name={tab.routeName} options={{ title: copy(tab.labelKey) }} />)}
    </Tabs>
    <RootTopBar />
  </View></RootChromeProvider></PreviewGate>;
}
