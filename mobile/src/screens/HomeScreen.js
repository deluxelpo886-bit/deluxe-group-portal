import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { CATEGORIES, servicesForCategory } from '../data/services';
import { colors, radius, spacing } from '../theme';

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const greetingName = displayName(user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(5) }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Welcome,</Text>
            <Text style={styles.name}>{greetingName}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logout}>
            <Text style={styles.logoutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.requestsBtn}
          onPress={() => navigation.navigate('Requests')}
          activeOpacity={0.85}
        >
          <Text style={styles.requestsBtnText}>My service requests</Text>
          <Text style={styles.requestsBtnArrow}>→</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Our Services</Text>

        <View style={styles.grid}>
          {CATEGORIES.map((cat) => {
            const count = servicesForCategory(cat.id).length;
            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.tile}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('NewRequest', { categoryId: cat.id })}
              >
                <Text style={styles.tileIcon}>{cat.icon}</Text>
                <Text style={styles.tileName}>{cat.name}</Text>
                <Text style={styles.tileMeta}>
                  {count} {count === 1 ? 'service' : 'services'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('NewRequest', {})}
        >
          <Text style={styles.ctaText}>+  Submit a service request</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function displayName(user) {
  if (!user) return 'there';
  if (user.displayName) return user.displayName.split(' ')[0];
  if (user.email) return user.email.split('@')[0];
  if (user.phoneNumber) return user.phoneNumber;
  return 'there';
}

const TILE_GAP = spacing(1.5);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(2.5),
    marginTop: spacing(1),
  },
  hello: { color: colors.steel, fontSize: 15 },
  name: { color: colors.navy, fontSize: 26, fontWeight: '800' },
  logout: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logoutText: { color: colors.steel, fontWeight: '700', fontSize: 13 },
  requestsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: spacing(3),
  },
  requestsBtnText: { color: colors.cream, fontWeight: '700', fontSize: 16, flex: 1 },
  requestsBtnArrow: { color: colors.gold, fontSize: 20, fontWeight: '800' },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    marginBottom: spacing(2),
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing(2),
    marginBottom: TILE_GAP,
    minHeight: 128,
    justifyContent: 'space-between',
  },
  tileIcon: { fontSize: 30 },
  tileName: { fontSize: 15, fontWeight: '700', color: colors.navy, marginTop: 8 },
  tileMeta: { fontSize: 12, color: colors.steel, marginTop: 4 },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing(2),
  },
  ctaText: { color: colors.navy, fontWeight: '800', fontSize: 16 },
});
