import React, { useRef, useState } from 'react';
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
import { FirebaseRecaptchaVerifierModal } from 'expo-firebase-recaptcha';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  PhoneAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { auth, app } from '../firebase';
import { firebaseConfig, firebaseConfigured } from '../firebaseConfig';
import { colors, radius, spacing } from '../theme';
import { Field, Button } from '../components/ui';

const MODE = { EMAIL: 'email', PHONE: 'phone' };

export default function LoginScreen() {
  const [mode, setMode] = useState(MODE.EMAIL);
  const recaptchaRef = useRef(null);

  // Email/password state
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Phone/OTP state
  const [phone, setPhone] = useState('+971');
  const [verificationId, setVerificationId] = useState(null);
  const [code, setCode] = useState('');

  const [loading, setLoading] = useState(false);

  const guard = () => {
    if (!firebaseConfigured) {
      Alert.alert(
        'Firebase not configured',
        'Add your apiKey, appId and messagingSenderId in src/firebaseConfig.js first.'
      );
      return false;
    }
    return true;
  };

  const handleEmail = async () => {
    if (!guard()) return;
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

  const sendOtp = async () => {
    if (!guard()) return;
    if (!/^\+\d{8,15}$/.test(phone.trim())) {
      return Alert.alert('Invalid number', 'Use full international format, e.g. +9715xxxxxxxx.');
    }
    setLoading(true);
    try {
      const provider = new PhoneAuthProvider(auth);
      const id = await provider.verifyPhoneNumber(phone.trim(), recaptchaRef.current);
      setVerificationId(id);
      Alert.alert('Code sent', `We texted a 6-digit code to ${phone.trim()}.`);
    } catch (e) {
      Alert.alert('Could not send code', prettyError(e));
    } finally {
      setLoading(false);
    }
  };

  const confirmOtp = async () => {
    if (!verificationId) return;
    if (code.trim().length < 6) {
      return Alert.alert('Enter the code', 'Type the 6-digit code from the SMS.');
    }
    setLoading(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, code.trim());
      await signInWithCredential(auth, credential);
    } catch (e) {
      Alert.alert('Wrong code', prettyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.navy }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <FirebaseRecaptchaVerifierModal
        ref={recaptchaRef}
        firebaseConfig={firebaseConfig}
        attemptInvisibleVerification
      />
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
            <View>
              {!verificationId ? (
                <>
                  <Field
                    label="Phone number"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    placeholder="+971 5xx xxx xxx"
                  />
                  <Button title="Send code" onPress={sendOtp} loading={loading} />
                </>
              ) : (
                <>
                  <Field
                    label="6-digit code"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                  />
                  <Button title="Verify & sign in" onPress={confirmOtp} loading={loading} />
                  <TouchableOpacity
                    onPress={() => {
                      setVerificationId(null);
                      setCode('');
                    }}
                    style={{ marginTop: 14 }}
                  >
                    <Text style={styles.switchText}>Use a different number</Text>
                  </TouchableOpacity>
                </>
              )}
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
    'auth/invalid-verification-code': 'That code is not correct.',
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
  warn: { color: colors.cream, textAlign: 'center', marginTop: spacing(3), fontSize: 12 },
});
