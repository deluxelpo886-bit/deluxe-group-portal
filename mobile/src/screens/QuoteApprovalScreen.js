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
import { money, ticketNo } from '../lib/requests';

export default function QuoteApprovalScreen({ route, navigation }) {
  const { id } = route.params || {};
  const [req, setReq] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState('');

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
        <ScreenHeader title="Quote" />
        <View style={styles.center}><Text style={styles.muted}>This request no longer exists.</Text></View>
      </View>
    );
  }
  if (!req) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Quote" />
        <View style={styles.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      </View>
    );
  }

  const quote = req.quote;
  const alreadyDecided = req.status === 'Approved' || req.status === 'Declined';

  const respond = async (approve) => {
    setBusy(approve ? 'approve' : 'decline');
    try {
      await updateDoc(doc(db, 'serviceRequests', id), {
        status: approve ? 'Approved' : 'Declined',
        quoteResponse: {
          decision: approve ? 'approved' : 'declined',
          at: new Date().toISOString(),
        },
        updatedAt: serverTimestamp(),
      });
      Alert.alert(
        approve ? 'Quote approved' : 'Quote declined',
        approve ? 'Thanks — our team will proceed.' : 'You have declined this quote.',
        [{ text: 'OK', onPress: () => navigation.navigate('JobStatus', { id }) }]
      );
    } catch (e) {
      Alert.alert('Something went wrong', e?.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const description =
    serviceName(req.service) + (req.model ? ' — ' + req.model : req.equipmentType ? ' — ' + req.equipmentType : '');

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Quote Ready" />
      <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(4) }}>
        <Image source={imageFor(req)} style={styles.hero} resizeMode="cover" />
        <Text style={styles.ticket}>{ticketNo(req)}</Text>

        {!quote ? (
          <View style={styles.section}>
            <Text style={styles.muted}>No quote has been sent for this request yet.</Text>
          </View>
        ) : (
          <>
            <SectionLabel>Service Description</SectionLabel>
            <Text style={styles.desc}>{description}</Text>

            <SectionLabel>Quote Items</SectionLabel>
            <View style={styles.itemsBox}>
              {(quote.items || []).map((it, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    {it.description || 'Item'}
                    {it.qty && Number(it.qty) !== 1 ? `  ×${it.qty}` : ''}
                  </Text>
                  <Text style={styles.itemAmt}>{money(it.amount ?? (Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.itemRow}>
                <Text style={styles.subLabel}>Subtotal</Text>
                <Text style={styles.subVal}>{money(quote.subtotal)}</Text>
              </View>
              <View style={styles.itemRow}>
                <Text style={styles.subLabel}>VAT ({Math.round((quote.vatRate ?? 0.05) * 100)}%)</Text>
                <Text style={styles.subVal}>{money(quote.vat)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalVal}>{money(quote.total)}  <Text style={styles.incl}>(including VAT)</Text></Text>
              </View>
            </View>

            <SectionLabel>Terms</SectionLabel>
            <View style={styles.termsBox}>
              <TermLine label="Payment Terms" value={quote.paymentTerms || '30 Days'} />
              <TermLine label="Validity" value={quote.validity || '30 Days'} />
              <TermLine label="Remarks" value={quote.remarks || 'Job commences only after approval'} />
            </View>

            {alreadyDecided ? (
              <View style={[styles.banner, req.status === 'Approved'
                ? { backgroundColor: '#eaf6ef', borderColor: '#bfe3cd' }
                : { backgroundColor: '#fdecea', borderColor: '#f5c6c2' }]}>
                <Text style={{ fontWeight: '800', color: req.status === 'Approved' ? colors.green : colors.red }}>
                  You have {req.status === 'Approved' ? 'approved' : 'declined'} this quote.
                </Text>
              </View>
            ) : (
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.btn, styles.declineBtn]} disabled={!!busy} onPress={() => respond(false)}>
                  <Text style={styles.declineText}>{busy === 'decline' ? '…' : 'Decline'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.approveBtn]} disabled={!!busy} onPress={() => respond(true)}>
                  <Text style={styles.approveText}>{busy === 'approve' ? '…' : 'Approve Quote'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionLabel({ children }) {
  return <View style={styles.sectionLabel}><Text style={styles.sectionLabelText}>{children}</Text></View>;
}
function TermLine({ label, value }) {
  return <Text style={styles.termLine}><Text style={{ fontWeight: '700' }}>{label}: </Text>{value}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(4) },
  muted: { color: colors.steel },
  hero: {
    width: '100%', height: 180, borderRadius: 16, marginTop: spacing(1),
    marginBottom: spacing(1), borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel2,
  },
  ticket: { textAlign: 'center', fontSize: 14, fontWeight: '800', color: colors.steel, marginBottom: spacing(1) },
  section: { padding: spacing(2) },
  sectionLabel: { backgroundColor: '#E9EEF3', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: spacing(2) },
  sectionLabelText: { color: colors.navy, fontWeight: '800', fontSize: 14 },
  desc: { fontSize: 15, color: colors.ink, paddingHorizontal: 4, paddingTop: 10 },
  itemsBox: { paddingHorizontal: 4, paddingTop: 8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  itemName: { fontSize: 15, color: colors.ink, flex: 1, marginRight: 12 },
  itemAmt: { fontSize: 15, color: colors.ink, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 6 },
  subLabel: { fontSize: 13, color: colors.steel },
  subVal: { fontSize: 13, color: colors.steel },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  totalLabel: { fontSize: 18, fontWeight: '900', color: colors.navy },
  totalVal: { fontSize: 18, fontWeight: '900', color: colors.navy },
  incl: { fontSize: 12, fontWeight: '600', color: colors.steel },
  termsBox: { paddingHorizontal: 4, paddingTop: 10 },
  termLine: { fontSize: 14, color: colors.ink, lineHeight: 24 },
  actions: { flexDirection: 'row', gap: 12, marginTop: spacing(3) },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  declineBtn: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  declineText: { color: colors.navy, fontWeight: '800', fontSize: 16 },
  approveBtn: { backgroundColor: colors.navy },
  approveText: { color: colors.cream, fontWeight: '800', fontSize: 16 },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: 14, marginTop: spacing(3) },
});
