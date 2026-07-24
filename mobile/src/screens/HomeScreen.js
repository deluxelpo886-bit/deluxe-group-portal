import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { CATEGORIES, servicesForCategory } from '../data/services';
import { SERVICE_IMAGES } from '../data/serviceImages';
import { colors, radius, spacing } from '../theme';

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { t, tCategory, tService } = useI18n();
  const greetingName = displayName(user);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(5) }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>{t('home.welcome')}</Text>
            <Text style={styles.name}>{greetingName}</Text>
          </View>
          <TouchableOpacity onPress={logout} style={styles.logout}>
            <Text style={styles.logoutText}>{t('home.signOut')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.requestsBtn}
          onPress={() => navigation.navigate('Requests')}
          activeOpacity={0.85}
        >
          <Text style={styles.requestsBtnText}>{t('home.myRequests')}</Text>
          <Text style={styles.requestsBtnArrow}>→</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>{t('home.ourServices')}</Text>

        {CATEGORIES.map((cat) => {
          const services = servicesForCategory(cat.id);
          if (services.length === 0) return null;
          return (
            <View key={cat.id} style={styles.catBlock}>
              <Text style={styles.catTitle}>{tCategory(cat.id)}</Text>
              <View style={styles.grid}>
                {services.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() =>
                      navigation.navigate('NewRequest', { categoryId: cat.id, serviceId: s.id })
                    }
                  >
                    <Image source={SERVICE_IMAGES[s.id]} style={styles.cardImg} resizeMode="cover" />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardName} numberOfLines={2}>{tService(s.id)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.cta}
          activeOpacity={0.9}
          onPress={() => navigation.navigate('NewRequest', {})}
        >
          <Text style={styles.ctaText}>+  {t('home.submit')}</Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(2),
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
  requestsBtnText: { color: '#fff', fontWeight: '700', fontSize: 16, flex: 1 },
  requestsBtnArrow: { color: colors.gold, fontSize: 20, fontWeight: '800' },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.navy,
    marginBottom: spacing(1.5),
  },
  catBlock: { marginBottom: spacing(3) },
  catTitle: {
    color: colors.goldDim,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: 8,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48.5%',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardImg: { width: '100%', height: 100, backgroundColor: colors.panel2 },
  cardBody: { paddingHorizontal: 12, paddingVertical: 10 },
  cardName: { fontSize: 13, fontWeight: '800', color: colors.navy, lineHeight: 17 },
  cta: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing(1),
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
