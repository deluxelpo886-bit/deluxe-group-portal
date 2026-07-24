import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  doc, getDoc, collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import { colors, radius, spacing } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import { nameFromEmail } from '../lib/requests';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const [profile, setProfile] = useState(null);
  const [fallbackPhone, setFallbackPhone] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      if (!user?.uid) return;
      try {
        const snap = await getDoc(doc(db, 'customers', user.uid));
        if (active && snap.exists()) setProfile(snap.data());
      } catch (e) { /* self-read only; ignore */ }
      try {
        const q = query(collection(db, 'serviceRequests'), where('uid', '==', user.uid));
        const rs = await getDocs(q);
        if (active && !rs.empty) {
          const latest = rs.docs
            .map((d) => d.data())
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
          setFallbackPhone(latest.contactPhone || latest.userPhone || '');
        }
      } catch (e) { /* ignore */ }
    }
    load();
    return () => { active = false; };
  }, [user?.uid]);

  const name = profile?.name || user?.displayName || nameFromEmail(user?.email);
  const isCompany = profile?.type === 'company';
  const accountType = isCompany ? t('acc.company') : t('acc.individual');
  const email = user?.email || '—';
  const phone = profile?.phone || user?.phoneNumber || fallbackPhone || '—';
  const company = profile?.companyName || '—';
  const trn = profile?.vatNo || '—';
  const verified = !!profile?.verified;

  const chooseLang = async (next) => {
    if (next === lang) return;
    const { needsRestart } = await setLang(next);
    if (needsRestart) {
      Alert.alert(t('acc.restartTitle'), t('acc.restartBody'));
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={t('acc.title')} showProfile={false} />
      <ScrollView contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(5) }}>
        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>👤</Text></View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.accountType}>{accountType} {t('acc.accountSuffix')}</Text>
        </View>

        <View style={styles.card}>
          <Row label={t('acc.email')} value={email} />
          <Row label={t('acc.phone')} value={phone} />
          <Row label={t('acc.companyLabel')} value={company} last />
        </View>

        <View style={styles.card}>
          <Row label={t('acc.accountType')} value={accountType} />
          <Row label={t('acc.trn')} value={trn} last={!verified} />
          {verified ? (
            <View style={{ marginTop: 10 }}>
              <View style={styles.verified}><Text style={styles.verifiedText}>{t('acc.verified')}</Text></View>
            </View>
          ) : null}
        </View>

        {/* Language toggle */}
        <View style={styles.card}>
          <Text style={styles.langLabel}>{t('acc.language')}</Text>
          <View style={styles.langRow}>
            <LangBtn label="English" active={lang === 'en'} onPress={() => chooseLang('en')} />
            <LangBtn label="العربية" active={lang === 'ar'} onPress={() => chooseLang('ar')} />
          </View>
        </View>

        <TouchableOpacity style={styles.logout} activeOpacity={0.85} onPress={logout}>
          <Text style={styles.logoutText}>{t('acc.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Row({ label, value, last }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function LangBtn({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.langBtn, active && styles.langBtnActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.langBtnText, active && styles.langBtnTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  profile: { alignItems: 'center', marginTop: spacing(2), marginBottom: spacing(3) },
  avatar: {
    width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: colors.navy,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12, backgroundColor: colors.panel,
  },
  avatarText: { fontSize: 44 },
  name: { fontSize: 22, fontWeight: '900', color: colors.navy },
  accountType: { fontSize: 14, color: colors.steel, marginTop: 2 },
  card: {
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginBottom: spacing(2),
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12, marginBottom: 12,
  },
  rowLabel: { fontSize: 14, color: colors.steel, fontWeight: '600' },
  rowValue: { fontSize: 15, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  verified: {
    alignSelf: 'flex-start', backgroundColor: '#eaf6ef', borderWidth: 1, borderColor: '#bfe3cd',
    borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 4,
  },
  verifiedText: { color: colors.green, fontWeight: '800', fontSize: 13 },
  langLabel: {
    fontSize: 12, fontWeight: '700', color: colors.steel, marginBottom: 10,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  langRow: { flexDirection: 'row', gap: 10 },
  langBtn: {
    flex: 1, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md,
    paddingVertical: 12, alignItems: 'center', backgroundColor: colors.panel,
  },
  langBtnActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  langBtnText: { fontSize: 15, fontWeight: '800', color: colors.navy },
  langBtnTextActive: { color: '#fff' },
  logout: {
    borderWidth: 1.5, borderColor: colors.red, borderRadius: radius.md,
    paddingVertical: 15, alignItems: 'center', marginTop: spacing(1),
  },
  logoutText: { color: colors.red, fontWeight: '800', fontSize: 16 },
});
