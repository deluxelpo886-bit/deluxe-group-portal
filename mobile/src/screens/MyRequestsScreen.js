import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { serviceName } from '../data/services';
import { colors, radius, spacing } from '../theme';

const STATUS_COLORS = {
  New: colors.blue,
  'Inspection Fee Sent': colors.orange,
  'Inspection Approved': colors.orange,
  Approved: colors.green,
  Declined: colors.red,
  Cancelled: colors.gray,
  Completed: colors.green,
};

export default function MyRequestsScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'serviceRequests'), where('uid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setRequests(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user?.uid]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.gold} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <FlatList
        data={requests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing(2.5), flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No requests yet</Text>
            <Text style={styles.emptySub}>
              Submit a service request from the home screen and it'll show up here.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status] || colors.steel;
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.service}>{serviceName(item.service)}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor }]}>
                  <Text style={styles.badgeText}>{item.status || 'New'}</Text>
                </View>
              </View>
              {!!item.equipmentType && (
                <Text style={styles.meta}>{item.equipmentType}</Text>
              )}
              {!!item.description && (
                <Text style={styles.desc} numberOfLines={2}>
                  {item.description}
                </Text>
              )}
              <View style={styles.cardFoot}>
                {!!item.urgency && <Text style={styles.foot}>Urgency: {item.urgency}</Text>}
                {!!item.siteLocation && <Text style={styles.foot}>📍 {item.siteLocation}</Text>}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(4) },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.navy, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.steel, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: spacing(2),
    marginBottom: spacing(1.5),
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  service: { fontSize: 16, fontWeight: '800', color: colors.navy, flex: 1, marginRight: 8 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  meta: { fontSize: 14, color: colors.ink, marginTop: 6, fontWeight: '600' },
  desc: { fontSize: 13, color: colors.steel, marginTop: 4, lineHeight: 18 },
  cardFoot: { flexDirection: 'row', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  foot: { fontSize: 12, color: colors.steel },
});
