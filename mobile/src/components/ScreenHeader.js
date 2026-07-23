import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme';

// White top bar shared across screens: back arrow (left), centered title,
// profile icon (right) that jumps to the Account tab.
export default function ScreenHeader({ title, showBack = true, showProfile = true }) {
  const nav = useNavigation();
  const canBack = nav.canGoBack();

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.panel }}>
      <View style={styles.bar}>
        <View style={styles.side}>
          {showBack && canBack ? (
            <TouchableOpacity hitSlop={10} onPress={() => nav.goBack()}>
              <Text style={styles.arrow}>‹</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          {showProfile ? (
            <TouchableOpacity
              hitSlop={10}
              onPress={() => nav.navigate('MainTabs', { screen: 'Account' })}
            >
              <Text style={styles.profile}>👤</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  side: { width: 44, justifyContent: 'center' },
  arrow: { fontSize: 34, color: colors.navy, lineHeight: 36, fontWeight: '400' },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.navy },
  profile: { fontSize: 22 },
});
