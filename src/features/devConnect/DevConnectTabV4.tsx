import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { DebugFeatureRenderProps } from '../../types';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import {
  hubClient,
  normalizeHubEndpoint,
  type HubConnectionState,
  type HubStatus,
} from '../../utils/HubClient';
import type { DevConnectV4State } from './types';

const STATE_COLORS: Record<HubConnectionState, string> = {
  connecting: Colors.warning,
  connected: Colors.success,
  paused: Colors.textSecondary,
  retrying: Colors.warning,
  hub_unreachable: Colors.error,
  hub_not_ready: Colors.warning,
  storage_full: Colors.error,
  protocol_mismatch: Colors.error,
  invalid_config: Colors.textMuted,
};

const STATE_LABELS: Record<HubConnectionState, string> = {
  connecting: 'Connecting...',
  connected: 'Connected',
  paused: 'Paused',
  retrying: 'Retrying...',
  hub_unreachable: 'Hub unreachable',
  hub_not_ready: 'Hub starting...',
  storage_full: 'Storage full',
  protocol_mismatch: 'Version mismatch',
  invalid_config: 'Not configured',
};

export function DevConnectTabV4({ snapshot }: DebugFeatureRenderProps<DevConnectV4State>) {
  const canonicalEndpoint = snapshot.canonicalEndpoint;
  const [endpointInput, setEndpointInput] = useState(canonicalEndpoint);
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<HubStatus>(hubClient.getStatus());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setEndpointInput(hubClient.getEffectiveEndpoint() || canonicalEndpoint);
  }, [canonicalEndpoint]);

  useEffect(() => {
    hubClient.setOnStatusChange(setStatus);
    return () => hubClient.setOnStatusChange(undefined);
  }, []);

  const handleEndpointSubmit = useCallback(() => {
    const trimmed = endpointInput.trim();
    if (!trimmed) {
      hubClient.clearRuntimeEndpoint();
      setEndpointInput(canonicalEndpoint);
      setInputError(null);
      return;
    }
    const normalized = normalizeHubEndpoint(trimmed);
    if (!normalized) {
      setInputError('Invalid Hub address');
      return;
    }
    setInputError(null);
    hubClient.setRuntimeEndpoint(normalized);
  }, [canonicalEndpoint, endpointInput]);

  const handleSyncNow = useCallback(async () => {
    if (status.state === 'protocol_mismatch' || status.state === 'invalid_config') return;

    if (status.state === 'hub_unreachable' || status.state === 'hub_not_ready') {
      // If iOS Local Network permission denied, open Settings
      if (Platform.OS === 'ios') {
        try { await Linking.openSettings(); } catch {}
        return;
      }
    }

    setSyncing(true);
    try {
      await hubClient.syncNow();
    } finally {
      setSyncing(false);
    }
  }, [status.state]);

  const handleTogglePause = useCallback(() => {
    if (hubClient.isSyncPaused()) {
      hubClient.resumeSync();
    } else {
      hubClient.pauseSync();
    }
  }, []);

  const stateColor = STATE_COLORS[status.state] || Colors.textMuted;
  const isPaused = status.state === 'paused';
  const isConnected = status.state === 'connected' || isPaused;
  const isErrorState = status.state === 'hub_unreachable' || status.state === 'storage_full' || status.state === 'protocol_mismatch';
  const isLoading = status.state === 'connecting' || syncing;

  const uploadButtonText = (() => {
    if (syncing) return 'Uploading...';
    if (isLoading && !syncing) return 'Connecting...';
    return 'Upload Once';
  })();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {/* Hub Endpoint Input */}
      <View style={styles.section}>
        <Text style={styles.label}>Hub Address</Text>
        <TextInput
          style={[
            styles.input,
            inputError ? styles.inputError : null,
          ]}
          value={endpointInput}
          onChangeText={(v) => { setEndpointInput(v); setInputError(null); }}
          placeholder={canonicalEndpoint || 'http://10.20.4.10:3799'}
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={handleEndpointSubmit}
          onBlur={handleEndpointSubmit}
        />
        {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
      </View>

      {/* Upload Once + Live Logs toggle */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.syncButton,
            isErrorState && styles.syncButtonError,
            isLoading && styles.syncButtonLoading,
          ]}
          onPress={handleSyncNow}
          disabled={status.state === 'protocol_mismatch' || status.state === 'invalid_config'}
          activeOpacity={0.75}
        >
          <View style={styles.syncButtonContent}>
            <View style={[styles.statusDot, { backgroundColor: stateColor }]} />
            <Text style={[
              styles.syncButtonText,
              isErrorState && styles.syncButtonTextError,
            ]}>
              {uploadButtonText}
            </Text>
          </View>
        </TouchableOpacity>

        {isConnected || isPaused ? (
          <TouchableOpacity
            style={styles.pauseButton}
            onPress={handleTogglePause}
            activeOpacity={0.75}
          >
            <Text style={styles.pauseButtonText}>
              {isPaused ? 'Start Live Logs' : 'Stop Live Logs'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Connection state hint */}
      {isErrorState ? (
        <Text style={styles.stateHint}>
          {STATE_LABELS[status.state]}
          {status.state === 'protocol_mismatch' ? '. Upgrade the App or Hub.' : ''}
          {status.state === 'storage_full' ? '. Hub storage is full.' : ''}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.LG,
    paddingTop: Spacing.MD,
    paddingBottom: Spacing.XXL,
  },
  section: { marginBottom: Spacing.MD },
  label: {
    fontSize: FontSize.SM,
    fontWeight: FontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: Spacing.XXS,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.MD,
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.SM,
    fontSize: FontSize.MD,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  inputError: {
    borderColor: Colors.error,
  },
  errorText: {
    fontSize: FontSize.XS,
    color: Colors.error,
    marginTop: Spacing.XXS,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.SM,
    marginBottom: Spacing.MD,
  },
  syncButton: {
    flex: 1,
    paddingVertical: Spacing.SM + 1,
    borderRadius: Radius.LG,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonError: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  syncButtonLoading: {
    opacity: 0.7,
  },
  syncButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  syncButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.MD,
    fontWeight: FontWeight.semibold,
  },
  syncButtonTextError: {
    color: Colors.error,
  },
  pauseButton: {
    paddingVertical: Spacing.SM + 1,
    paddingHorizontal: Spacing.MD,
    borderRadius: Radius.LG,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButtonText: {
    color: Colors.primary,
    fontSize: FontSize.MD,
    fontWeight: FontWeight.semibold,
  },
  stateHint: {
    fontSize: FontSize.XS,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
});
