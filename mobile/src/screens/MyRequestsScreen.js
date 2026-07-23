import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { serviceName } from '../data/services';
import { colors, radius, spacing } from '../theme';
import ScreenHeader from '../components/ScreenHeader';
import Thumbnail from '../components/Thumbnail';
import { ticketNo, statusBadge, urgencyBadge } from '../lib/requests';

export default function MyRequestsScreen({ navigation }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
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

  const openRequest = (r) => {
    // A pending quote opens the quote approval screen; otherwise job status.
    if ((r.status === 'Quoted' || r.status === 'Inspection') && r.quote) {
      navigation.navigate('QuoteApproval', { id: r.id });
    } else {
      navigation.navigate('JobStatus', { id: r.id });
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Requests" />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.gold} size="large" /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing(2), flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No requests yet</Text>
              <Text style={styles.emptySub}>Submit a service request and it'll show up here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const sb = statusBadge(item.status);
            const ub = urgencyBadge(item.urgency);
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openRequest(item)}>
                <Thumbnail category={item.category} size={62} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.ticket}>{ticketNo(item)}</Text>
                  <Text style={styles.service} numberOfLines={1}>{serviceName(item.service)}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{item.equipmentType || '—'}</Text>
                  <View style={styles.badges}>
                    {ub ? <Badge label={ub.label} color={ub.color} /> : null}
                    <Badge label={sb.label} color={sb.color} />
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function Badge({ label, color }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(4) },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.navy, marginBottom: 6 },
  emptySub: { fontSize: 14, color: colors.steel, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: 12,
    marginBottom: 12,
  },
  ticket: { fontSize: 11, color: colors.steel, fontWeight: '700', letterSpacing: 0.3 },
  service: { fontSize: 16, fontWeight: '800', color: colors.navy, marginTop: 1 },
  sub: { fontSize: 13, color: colors.steel, marginTop: 1 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 10, letterSpacing: 0.3 },
});
