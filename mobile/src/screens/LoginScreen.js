import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../firebase';
import { firebaseConfigured } from '../firebaseConfig';
import { colors, radius, spacing } from '../theme';
import { Field, Button } from '../components/ui';
import { useI18n } from '../i18n/I18nContext';

const MODE = { EMAIL: 'email', PHONE: 'phone' };

// NOTE: Phone / SMS OTP sign-in is intentionally not wired up in this build.
// A standalone (built) Android app needs a native reCAPTCHA/App-Check verifier
// for Firebase phone auth; the old `expo-firebase-recaptcha` library is
// abandoned and breaks modern native builds. When we enable Phone sign-in we'll
// add it back with a build-compatible approach (e.g. @react-native-firebase).
export default function LoginScreen() {
  const { t } = useI18n();
  const [mode, setMode] = useState(MODE.EMAIL);

  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmail = async () => {
    if (!firebaseConfigured) {
      return Alert.alert(
        'Firebase not configured',
        'Add your Firebase keys in src/firebaseConfig.js first.'
      );
    }
    if (!email.trim() || !password) {
      return Alert.alert(t('login.missingTitle'), t('login.missingBody'));
    }
    setLoading(true);
    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      // AuthContext's onAuthStateChanged handles navigation.
    } catch (e) {
      Alert.alert(t('login.failed'), t(errKey(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.cream }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <Image
            source={require('../../assets/brand-icon.png')}
            style={styles.logoMark}
            resizeMode="contain"
          />
          <Text style={styles.brandTitle}>Deluxe Go</Text>
          <Text style={styles.brandSub}>{t('login.tagline')}</Text>
        </View>

        <View style={styles.sheet}>
          <View style={styles.tabs}>
            <Tab label={t('login.tabEmail')} active={mode === MODE.EMAIL} onPress={() => setMode(MODE.EMAIL)} />
            <Tab label={t('login.tabPhone')} active={mode === MODE.PHONE} onPress={() => setMode(MODE.PHONE)} />
          </View>

          {mode === MODE.EMAIL ? (
            <View>
              <Field
                label={t('login.email')}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={t('login.emailPh')}
              />
              <Field
                label={t('login.password')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />
              <Button
                title={isSignup ? t('login.createAccount') : t('login.signIn')}
                onPress={handleEmail}
                loading={loading}
              />
              <TouchableOpacity onPress={() => setIsSignup((v) => !v)} style={{ marginTop: 14 }}>
                <Text style={styles.switchText}>
                  {isSignup ? t('login.toSignin') : t('login.toSignup')}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonEmoji}>📱</Text>
              <Text style={styles.comingSoonTitle}>{t('login.phoneSoonTitle')}</Text>
              <Text style={styles.comingSoonBody}>{t('login.phoneSoonBody')}</Text>
              <Button
                title={t('login.useEmail')}
                variant="ghost"
                onPress={() => setMode(MODE.EMAIL)}
                style={{ marginTop: 18, alignSelf: 'stretch' }}
              />
            </View>
          )}
        </View>

        {!firebaseConfigured && (
          <Text style={styles.warn}>
            ⚠ Add your Firebase keys in src/firebaseConfig.js to enable sign-in.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function errKey(e) {
  const code = ((e && e.code) || '').replace('auth/', '');
  const known = [
    'invalid-email', 'user-not-found', 'wrong-password', 'invalid-credential',
    'email-already-in-use', 'weak-password', 'too-many-requests', 'operation-not-allowed',
  ];
  return known.includes(code) ? 'err.' + code : 'err.generic';
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: spacing(3), justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing(4) },
  logoMark: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    marginBottom: 14,
  },
  brandTitle: { color: colors.navy, fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  brandSub: { color: colors.gold, fontSize: 14, marginTop: 4 },
  sheet: {
    backgroundColor: colors.panel,
    borderRadius: radius.lg,
    padding: spacing(3),
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.panel2,
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: spacing(3),
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.navy },
  tabText: { fontWeight: '700', color: colors.steel },
  tabTextActive: { color: '#fff' },
  switchText: { color: colors.goldDim, textAlign: 'center', fontWeight: '600' },
  comingSoon: { alignItems: 'center', paddingVertical: spacing(2) },
  comingSoonEmoji: { fontSize: 40, marginBottom: 10 },
  comingSoonTitle: { fontSize: 18, fontWeight: '800', color: colors.navy, marginBottom: 6 },
  comingSoonBody: { fontSize: 14, color: colors.steel, textAlign: 'center', lineHeight: 20 },
  warn: { color: colors.red, textAlign: 'center', marginTop: spacing(3), fontSize: 12 },
});
