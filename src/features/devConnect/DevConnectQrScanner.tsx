import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
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
import { parseMetroQrPayload, type ParsedComputerTarget } from './devConnectUtils';

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
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

// ─── QR Scanner ─────────────────────────────────────────────

interface DevConnectQrScannerProps {
  visible: boolean;
  onClose: () => void;
  onScanTarget: (target: ParsedComputerTarget) => void;
}

export function DevConnectQrScanner({ visible, onClose, onScanTarget }: DevConnectQrScannerProps) {
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
    if (scannedRef.current) {
      return;
    }
    if (typeof rawValue !== 'string') {
      return;
    }

    const parsed = parseMetroQrPayload(rawValue);
    if (!parsed) {
      setError('QR code does not contain a supported Metro URL.');
      return;
    }

    scannedRef.current = true;
    setError(null);
    onScanTarget({
      computerHost: parsed.computerHost,
      metroPort: parsed.metroPort,
    });
    onClose();
  }, [onClose, onScanTarget]);

  const handleCameraKitRead = useCallback((event: CameraKitReadCodeEvent) => {
    handleScanned(event.nativeEvent?.codeStringValue ?? '');
  }, [handleScanned]);

  const handleExpoScanned = useCallback((result: ExpoCameraScanResult) => {
    handleScanned(result.value ?? '');
  }, [handleScanned]);

  const handleCameraError = useCallback((_msg: string) => {
    setCameraFailed(true);
  }, []);

  if (!visible || !scanner) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.previewLayer}>
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
        </View>

        <View style={styles.topBar}>
          <View style={styles.titleGroup}>
            <Text style={styles.title}>Scan Metro QR</Text>
            <Text style={styles.subtitle}>Expo or Metro URL</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.75}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.statusPill, error && styles.statusPillError]}>
          <Text style={[styles.statusText, error && styles.statusTextError]}>
            {error ?? 'Point the camera at exp:// or http:// Metro URL.'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  previewLayer: { ...StyleSheet.absoluteFillObject },
  camera: { ...StyleSheet.absoluteFillObject },
  cameraFallback: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', padding: 24 },
  cameraFallbackText: { fontSize: 16, color: '#fff', fontWeight: '600', marginBottom: 8 },
  cameraFallbackHint: { fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  topBar: {
    position: 'absolute',
    top: 44,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  titleGroup: { flex: 1, paddingRight: 10 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 11, marginTop: 2 },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  closeButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  statusPill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 30,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  statusPillError: {
    backgroundColor: `${Colors.error}22`,
    borderWidth: 1,
    borderColor: `${Colors.error}66`,
  },
  statusText: { color: '#fff', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  statusTextError: { color: '#fff' },
});
