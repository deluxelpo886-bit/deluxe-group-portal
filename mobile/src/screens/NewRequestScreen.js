import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  CATEGORIES,
  SERVICES,
  servicesForCategory,
  URGENCY,
} from '../data/services';
import { colors, radius, spacing } from '../theme';
import { Field, Button } from '../components/ui';
import ScreenHeader from '../components/ScreenHeader';

export default function NewRequestScreen({ route, navigation }) {
  const { user } = useAuth();
  const initialCategory = route.params?.categoryId || CATEGORIES[0].id;

  const [categoryId, setCategoryId] = useState(initialCategory);

  // When arriving from a Home category tile (tab already mounted), sync selection.
  useEffect(() => {
    if (route.params?.categoryId) {
      setCategoryId(route.params.categoryId);
      const first = servicesForCategory(route.params.categoryId)[0];
      setServiceId(first ? first.id : undefined);
    }
  }, [route.params?.categoryId]);

  const services = useMemo(() => servicesForCategory(categoryId), [categoryId]);
  const [serviceId, setServiceId] = useState(services[0]?.id);

  const [form, setForm] = useState({
    equipmentType: '',
    model: '',
    serial: '',
    siteLocation: '',
    preferredDate: '',
    urgency: 'Normal',
    contactPhone: user?.phoneNumber || '',
    description: '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const onSelectCategory = (id) => {
    setCategoryId(id);
    const first = servicesForCategory(id)[0];
    setServiceId(first ? first.id : undefined);
  };

  const submit = async () => {
    if (!serviceId) return Alert.alert('Pick a service', 'Choose a service to continue.');
    if (!form.equipmentType.trim() && !form.description.trim()) {
      return Alert.alert(
        'Add some detail',
        'Tell us the equipment type or describe the problem.'
      );
    }
    setSaving(true);
    try {
      await addDoc(collection(db, 'serviceRequests'), {
        ...form,
        category: categoryId,
        service: serviceId,
        status: 'New',
        uid: user?.uid || null,
        userEmail: user?.email || null,
        userPhone: user?.phoneNumber || null,
        createdAt: serverTimestamp(),
      });
      Alert.alert('Request submitted', "We're reviewing it and will be in touch.", [
        { text: 'OK', onPress: () => navigation.navigate('Requests') },
      ]);
    } catch (e) {
      Alert.alert('Could not submit', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <ScreenHeader title="New Request" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={{ padding: spacing(2.5), paddingBottom: spacing(6) }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {CATEGORIES.map((c) => (
            <Chip
              key={c.id}
              label={`${c.icon}  ${c.name}`}
              active={c.id === categoryId}
              onPress={() => onSelectCategory(c.id)}
            />
          ))}
        </ScrollView>

        <Text style={styles.label}>Service</Text>
        <View style={{ marginBottom: 16 }}>
          {services.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.serviceRow, s.id === serviceId && styles.serviceRowActive]}
              onPress={() => setServiceId(s.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.radio, s.id === serviceId && styles.radioActive]} />
              <Text style={[styles.serviceText, s.id === serviceId && { color: colors.navy }]}>
                {s.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field
          label="Equipment type"
          value={form.equipmentType}
          onChangeText={set('equipmentType')}
          placeholder="e.g. Diesel Generator"
        />
        <Field label="Model" value={form.model} onChangeText={set('model')} placeholder="Model" />
        <Field
          label="Serial number"
          value={form.serial}
          onChangeText={set('serial')}
          placeholder="Serial"
        />
        <Field
          label="Site / location"
          value={form.siteLocation}
          onChangeText={set('siteLocation')}
          placeholder="Where is the equipment?"
        />
        <Field
          label="Preferred date"
          value={form.preferredDate}
          onChangeText={set('preferredDate')}
          placeholder="e.g. 2026-07-30"
        />

        <Text style={styles.label}>Urgency</Text>
        <View style={styles.urgencyRow}>
          {URGENCY.map((u) => (
            <Chip
              key={u}
              label={u}
              active={form.urgency === u}
              onPress={() => set('urgency')(u)}
              style={{ flex: 1 }}
            />
          ))}
        </View>

        <Field
          label="Contact phone"
          value={form.contactPhone}
          onChangeText={set('contactPhone')}
          keyboardType="phone-pad"
          placeholder="+971 5xx xxx xxx"
        />
        <Field
          label="Description"
          value={form.description}
          onChangeText={set('description')}
          placeholder="What's happening with the equipment?"
          multiline
          numberOfLines={4}
          style={{ height: 110, textAlignVertical: 'top' }}
        />

        <Button title="Submit request" onPress={submit} loading={saving} />
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Chip({ label, active, onPress, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.chip, active && styles.chipActive, style]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.steel,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    marginRight: 8,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipText: { color: colors.steel, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.cream },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
    marginBottom: 8,
  },
  serviceRowActive: { borderColor: colors.gold, backgroundColor: '#FFF9EE' },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.line,
    marginRight: 12,
  },
  radioActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  serviceText: { fontSize: 15, color: colors.steel, flex: 1, fontWeight: '600' },
  urgencyRow: { flexDirection: 'row', marginBottom: 16, gap: 8 },
});
