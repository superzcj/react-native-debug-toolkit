import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
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

// ─── Camera Error Boundary ─────────────────────────────────

interface CameraBoundaryProps {
  children: React.ReactNode;
  onCameraError: (msg: string) => void;
}

interface CameraBoundaryState {
  hasError: boolean;
}

class CameraErrorBoundary extends Component<CameraBoundaryProps, CameraBoundaryState> {
  state: CameraBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CameraBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[DevConnect] Camera error:', error.message);
    this.props.onCameraError(error.message || 'Camera failed to initialize.');
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ─── QR Scanner ─────────────────────────────────────────────

interface DevConnectQrScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanHost: (host: string) => void;
}

export function DevConnectQrScanner({ visible, onClose, onScanHost }: DevConnectQrScannerProps) {
  const scannedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const scanner = getScannerModule();

  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
      setError(null);
      setCameraFailed(false);
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

  const handleCameraError = useCallback((_msg: string) => {
    setCameraFailed(true);
  }, []);

  if (!visible || !scanner) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!cameraFailed && (
          <CameraErrorBoundary onCameraError={handleCameraError}>
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
          </CameraErrorBoundary>
        )}
        {cameraFailed && (
          <View style={styles.cameraFallback}>
            <Text style={styles.cameraFallbackText}>Camera unavailable.</Text>
            <Text style={styles.cameraFallbackHint}>Please enter computer IP manually.</Text>
          </View>
        )}
        <View style={styles.footer}>
          {!cameraFailed && !error && <Text style={styles.hint}>Scan a Metro QR code.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
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
  cameraFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  cameraFallbackText: { fontSize: 16, color: '#fff', fontWeight: '600', marginBottom: 8 },
  cameraFallbackHint: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
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
