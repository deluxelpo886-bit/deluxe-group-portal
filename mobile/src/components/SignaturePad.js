import React, { useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Signature from 'react-native-signature-canvas';
import { colors, radius, spacing } from '../theme';
import { useI18n } from '../i18n/I18nContext';

// Full-screen modal that lets the customer draw a signature. Returns a PNG
// data URL via onSave. Built on react-native-signature-canvas (WebView-based).
const webStyle = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; margin: 0; }
  body, html { height: 100%; margin: 0; background: #fff; }
`;

export default function SignaturePad({ visible, onCancel, onSave }) {
  const ref = useRef(null);
  const { t } = useI18n();

  const handleOK = (signature) => onSave(signature);
  const handleEmpty = () =>
    Alert.alert(t('sig.pleaseTitle'), t('sig.pleaseBody'));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('sig.title')}</Text>
          <Text style={styles.sub}>{t('sig.sub')}</Text>
        </View>

        <View style={styles.canvasWrap}>
          <Signature
            ref={ref}
            onOK={handleOK}
            onEmpty={handleEmpty}
            webStyle={webStyle}
            backgroundColor="#FFFFFF"
            penColor={colors.navy}
            autoClear={false}
            descriptionText=""
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.btn, styles.ghost]}
            onPress={() => ref.current?.clearSignature()}
          >
            <Text style={styles.ghostText}>{t('common.clear')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onCancel}>
            <Text style={styles.ghostText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.save]}
            onPress={() => ref.current?.readSignature()}
          >
            <Text style={styles.saveText}>{t('common.save')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  header: { paddingHorizontal: spacing(2.5), paddingTop: spacing(2), paddingBottom: spacing(1) },
  title: { fontSize: 20, fontWeight: '800', color: colors.navy },
  sub: { fontSize: 14, color: colors.steel, marginTop: 4 },
  canvasWrap: {
    flex: 1,
    margin: spacing(2),
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  footer: { flexDirection: 'row', gap: 10, padding: spacing(2), paddingTop: 0 },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  ghost: { backgroundColor: colors.panel, borderWidth: 1.5, borderColor: colors.line },
  ghostText: { color: colors.navy, fontWeight: '800', fontSize: 15 },
  save: { backgroundColor: colors.gold },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
