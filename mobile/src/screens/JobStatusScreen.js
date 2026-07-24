import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { serviceName } from '../data/services';
import { imageFor } from '../data/serviceImages';
import { colors, radius, spacing } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Thumbnail from '../components/Thumbnail';
import SignaturePad from '../components/SignaturePad';
import { ticketNo, CUSTOMER_STEPS, statusStep, formatDay } from '../lib/requests';

export default function JobStatusScreen({ route, navigation }) {
  const { id } = route.params || {};
  const [req, setReq] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signVisible, setSignVisible] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'serviceRequests', id), (snap) => {
      if (!snap.exists()) return setNotFound(true);
      setReq({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [id]);

  if (notFound) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Job Status" />
        <View style={styles.center}><Text style={styles.muted}>This request no longer exists.</Text></View>
      </View>
    );
  }
  if (!req) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Job Status" />
        <View style={styles.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      </View>
    );
  }

  const step = statusStep(req.status);
  const declined = step === -1;
  const report = req.serviceReport || {};
  const isCompleted = req.status === 'Completed';

  const saveSignature = async (dataUrl) => {
    setSignVisible(false);
    setSigning(true);
    try {
      await updateDoc(doc(db, 'serviceRequests', id), {
        customerSignedOff: true,
        signedOffAt: serverTimestamp(),
        signature: dataUrl,
      });
      Alert.alert('Thank you', 'Completion signed off.');
    } catch (e) {
      Alert.alert('Could not sign off', e?.message || 'Please try again.');
    } finally {
      setSigning(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Job Status" />
      <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(5) }}>
        <Image source={imageFor(req)} style={styles.hero} resizeMode="cover" />
        <Text style={styles.ticket}>{ticketNo(req)}</Text>
        <Text style={styles.service}>{serviceName(req.service)}</Text>

        {declined ? (
          <View style={[styles.banner, { backgroundColor: '#fdecea', borderColor: '#f5c6c2' }]}>
            <Text style={{ color: colors.red, fontWeight: '700' }}>
              This request was {(req.status || '').toLowerCase()}.
            </Text>
          </View>
        ) : (
          <Stepper current={step} />
        )}

        {req.quote && (req.status === 'Quoted' || req.status === 'Inspection') ? (
          <TouchableOpacity
            style={styles.reviewBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('QuoteApproval', { id: req.id })}
          >
            <Text style={styles.reviewBtnText}>Review quote</Text>
          </TouchableOpacity>
        ) : null}

        {(isCompleted || report.technician || report.workDone) ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Service Report</Text>
            <View style={styles.photoRow}>
              <ReportPhoto label="Before" service={req.service} category={req.category} />
              <ReportPhoto label="After" service={req.service} category={req.category} />
            </View>
            <View style={{ marginTop: 12 }}>
              <ReportLine label="Technician" value={report.technician || req.assignedTechnician || '—'} />
              <ReportLine label="Work Done" value={report.workDone || '—'} />
              <ReportLine label="Completed" value={report.completedAt ? formatDay(report.completedAt) : (isCompleted ? formatDay(req.updatedAt) : '—')} />
            </View>
          </View>
        ) : null}

        {isCompleted ? (
          req.customerSignedOff ? (
            <View style={[styles.banner, { backgroundColor: '#eaf6ef', borderColor: '#bfe3cd' }]}>
              <Text style={{ color: colors.green, fontWeight: '700' }}>✓ You signed off this completion.</Text>
              {req.signature ? (
                <Image source={{ uri: req.signature }} style={styles.signatureImg} resizeMode="contain" />
              ) : null}
            </View>
          ) : (
            <TouchableOpacity style={styles.signBtn} activeOpacity={0.9} onPress={() => setSignVisible(true)} disabled={signing}>
              <Text style={styles.signBtnText}>{signing ? 'Signing…' : 'Sign Off Completion'}</Text>
            </TouchableOpacity>
          )
        ) : null}
      </ScrollView>

      <SignaturePad
        visible={signVisible}
        onCancel={() => setSignVisible(false)}
        onSave={saveSignature}
      />
    </View>
  );
}

function Stepper({ current }) {
  return (
    <View style={styles.stepper}>
      {CUSTOMER_STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={label} style={styles.step}>
            <View style={styles.connectRow}>
              <View style={[styles.line, { backgroundColor: i === 0 ? 'transparent' : (i <= current ? colors.green : colors.line) }]} />
              <View style={[styles.node,
                done && { backgroundColor: colors.green, borderColor: colors.green },
                active && { backgroundColor: colors.navy, borderColor: colors.navy },
              ]}>
                <Text style={styles.nodeText}>{done ? '✓' : active ? '●' : ''}</Text>
              </View>
              <View style={[styles.line, { backgroundColor: i === CUSTOMER_STEPS.length - 1 ? 'transparent' : (i < current ? colors.green : colors.line) }]} />
            </View>
            <Text style={[styles.stepLabel, (done || active) && { color: colors.navy, fontWeight: '700' }]} numberOfLines={2}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ReportPhoto({ label, service, category }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Thumbnail service={service} category={category} size={110} radius={12} style={{ width: '100%' }} />
      <Text style={styles.photoLabel}>{label}</Text>
    </View>
  );
}

function ReportLine({ label, value }) {
  return (
    <Text style={styles.reportLine}>
      <Text style={{ fontWeight: '800', color: colors.navy }}>{label}: </Text>
      <Text style={{ color: colors.ink }}>{value}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(4) },
  muted: { color: colors.steel },
  hero: {
    width: '100%', height: 190, borderRadius: 16, marginTop: spacing(1),
    marginBottom: spacing(2), borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2,
  },
  ticket: { textAlign: 'center', fontSize: 18, fontWeight: '900', color: colors.navy, letterSpacing: 0.5 },
  service: { textAlign: 'center', fontSize: 14, color: colors.steel, marginTop: 2, marginBottom: spacing(2) },
  stepper: { flexDirection: 'row', marginTop: spacing(1), marginBottom: spacing(2) },
  step: { flex: 1, alignItems: 'center' },
  connectRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 3 },
  node: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line,
    backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center',
  },
  nodeText: { color: '#fff', fontSize: 12, fontWeight: '900', lineHeight: 14 },
  stepLabel: { fontSize: 9.5, color: colors.steel, textAlign: 'center', marginTop: 5, paddingHorizontal: 2 },
  reviewBtn: {
    backgroundColor: colors.gold, borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center', marginTop: spacing(1), marginBottom: spacing(1),
  },
  reviewBtnText: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  card: {
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.lg, padding: 16, marginTop: spacing(2),
    borderLeftWidth: 4, borderLeftColor: colors.navy,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.navy, marginBottom: 12 },
  photoRow: { flexDirection: 'row', gap: 12 },
  photoLabel: { fontSize: 12, color: colors.steel, marginTop: 6, fontWeight: '600' },
  reportLine: { fontSize: 14, lineHeight: 22 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: 14, marginTop: spacing(2) },
  signBtn: { backgroundColor: colors.navy, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginTop: spacing(2) },
  signBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  signatureImg: {
    width: '100%', height: 90, marginTop: 10, backgroundColor: '#fff',
    borderRadius: 8, borderWidth: 1, borderColor: colors.line,
  },
});
