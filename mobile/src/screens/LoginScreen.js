import React, { useState } from 'react';
import {
  View,
  Text,
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

const MODE = { EMAIL: 'email', PHONE: 'phone' };

// NOTE: Phone / SMS OTP sign-in is intentionally not wired up in this build.
// A standalone (built) Android app needs a native reCAPTCHA/App-Check verifier
// for Firebase phone auth; the old `expo-firebase-recaptcha` library is
// abandoned and breaks modern native builds. When we enable Phone sign-in we'll
// add it back with a build-compatible approach (e.g. @react-native-firebase).
export default function LoginScreen() {
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
      return Alert.alert('Missing details', 'Enter both email and password.');
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
      Alert.alert('Sign-in failed', prettyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.navy }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>D</Text>
          </View>
          <Text style={styles.brandTitle}>Deluxe Go</Text>
          <Text style={styles.brandSub}>Service requests, on the move.</Text>
        </View>

        <View style={styles.sheet}>
          <View style={styles.tabs}>
            <Tab label="Email" active={mode === MODE.EMAIL} onPress={() => setMode(MODE.EMAIL)} />
            <Tab label="Phone" active={mode === MODE.PHONE} onPress={() => setMode(MODE.PHONE)} />
          </View>

          {mode === MODE.EMAIL ? (
            <View>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@company.com"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
              />
              <Button
                title={isSignup ? 'Create account' : 'Sign in'}
                onPress={handleEmail}
                loading={loading}
              />
              <TouchableOpacity onPress={() => setIsSignup((v) => !v)} style={{ marginTop: 14 }}>
                <Text style={styles.switchText}>
                  {isSignup ? 'Have an account? Sign in' : 'New here? Create an account'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.comingSoon}>
              <Text style={styles.comingSoonEmoji}>📱</Text>
              <Text style={styles.comingSoonTitle}>Phone sign-in is coming soon</Text>
              <Text style={styles.comingSoonBody}>
                For now, please sign in with your email and password.
              </Text>
              <Button
                title="Use email instead"
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

function prettyError(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/invalid-email': 'That email address looks invalid.',
    'auth/user-not-found': 'No account with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'That email is already registered.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/operation-not-allowed': 'Enable this sign-in method in the Firebase console.',
  };
  return map[code] || (e && e.message) || 'Something went wrong.';
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: spacing(3), justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing(4) },
  logoMark: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoMarkText: { color: colors.navy, fontSize: 34, fontWeight: '900' },
  brandTitle: { color: colors.cream, fontSize: 30, fontWeight: '800', letterSpacing: 1 },
  brandSub: { color: colors.gold, fontSize: 14, marginTop: 4 },
  sheet: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    padding: spacing(3),
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
  tabTextActive: { color: colors.cream },
  switchText: { color: colors.goldDim, textAlign: 'center', fontWeight: '600' },
  comingSoon: { alignItems: 'center', paddingVertical: spacing(2) },
  comingSoonEmoji: { fontSize: 40, marginBottom: 10 },
  comingSoonTitle: { fontSize: 18, fontWeight: '800', color: colors.navy, marginBottom: 6 },
  comingSoonBody: { fontSize: 14, color: colors.steel, textAlign: 'center', lineHeight: 20 },
  warn: { color: colors.cream, textAlign: 'center', marginTop: spacing(3), fontSize: 12 },
});
