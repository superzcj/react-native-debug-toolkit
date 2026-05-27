import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Colors } from '../../ui/theme/colors';
import {
  getScannerModule,
  type CameraKitReadCodeEvent,
  type ExpoCameraScanResult,
} from './cameraKit';
import { parseMetroQrPayload } from './devConnectUtils';

interface DevConnectQrScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanHost: (host: string) => void;
}

export function DevConnectQrScanner({ visible, onClose, onScanHost }: DevConnectQrScannerProps) {
  const scannedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const scanner = getScannerModule();

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setError(null);
    }
  }, [visible]);

  const handleScanned = useCallback((rawValue: string) => {
    if (scannedRef.current) return;
    if (typeof rawValue !== 'string') return;

    const parsed = parseMetroQrPayload(rawValue);
    if (!parsed) {
      setError('QR code does not contain a supported Metro URL.');
      return;
    }

    scannedRef.current = true;
    setError(null);
    onScanHost(parsed.computerHost);
    onClose();
  }, [onClose, onScanHost]);

  const handleCameraKitRead = useCallback((event: CameraKitReadCodeEvent) => {
    handleScanned(event.nativeEvent?.codeStringValue ?? '');
  }, [handleScanned]);

  const handleExpoScanned = useCallback((result: ExpoCameraScanResult) => {
    handleScanned(result.value ?? '');
  }, [handleScanned]);

  if (!visible || !scanner) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {scanner.kind === 'camera-kit' && scanner.CameraKit ? (
          <scanner.CameraKit.Camera
            style={styles.camera}
            cameraType={scanner.CameraKit.CameraType?.Back}
            scanBarcode
            onReadCode={handleCameraKitRead}
            showFrame
            laserColor={Colors.primary}
            frameColor={Colors.primary}
            allowedBarcodeTypes={['qr']}
          />
        ) : scanner.kind === 'expo-camera' && scanner.ExpoCamera ? (
          <scanner.ExpoCamera.Camera
            style={styles.camera}
            onBarCodeScanned={handleExpoScanned}
            barCodeScannerSettings={{ barCodeTypes: ['qr'] }}
          />
        ) : null}
        <View style={styles.footer}>
          {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.hint}>Scan a Metro QR code.</Text>}
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
        <Pressable style={styles.topClose} onPress={onClose}>
          <Text style={styles.topCloseText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  footer: { padding: 16, backgroundColor: Colors.surface },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  error: { fontSize: 13, color: Colors.error, marginBottom: 12 },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: Colors.primary,
  },
  closeButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  topClose: {
    position: 'absolute',
    top: 48,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topCloseText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
