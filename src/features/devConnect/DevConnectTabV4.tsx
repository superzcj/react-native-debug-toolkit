import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  type HubConnectionState,
  type HubStatus,
} from '../../utils/HubClient';
import {
  KEYS,
  removePreference,
  setPreference,
} from '../../utils/debugPreferences';
import {
  buildHubAddressRecommendations,
  hubEndpointHost,
  resolveHubAddressSubmission,
  splitLanHost,
} from './hubAddressRecommendations';
import { resolveAndApplyHubEndpoint } from './resolveAndApplyHubEndpoint';
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
  const inputRef = useRef<TextInput>(null);
  const focusedRef = useRef(false);
  const skipBlurRef = useRef(false);
  const endpointInputRef = useRef(canonicalEndpoint);
  const [endpointInput, setEndpointInput] = useState(
    hubEndpointHost(canonicalEndpoint || ''),
  );
  endpointInputRef.current = endpointInput;
  const [editFullHost, setEditFullHost] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<HubStatus>(hubClient.getStatus());
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    setEndpointInput(
      hubEndpointHost(hubClient.getEffectiveEndpoint() || canonicalEndpoint || ''),
    );
  }, [canonicalEndpoint, status.state]);

  useEffect(() => {
    hubClient.setOnStatusChange(setStatus);
    return () => hubClient.setOnStatusChange(undefined);
  }, []);

  const applyRawInput = useCallback(async (raw: string) => {
    const submission = resolveHubAddressSubmission(
      raw,
      snapshot.configuredEndpoint,
      snapshot.subnetPrefix,
    );
    if (submission.kind === 'clear') {
      await removePreference(KEYS.hubEndpoint);
      hubClient.clearRuntimeEndpoint();
      setInputError(null);
      setEndpointInput(hubEndpointHost(submission.fallbackEndpoint));
      return;
    }
    if (submission.kind === 'incomplete') {
      setInputError(null);
      return;
    }
    if (submission.kind === 'invalid') {
      setInputError('Invalid Hub address');
      return;
    }
    setInputError(null);
    await setPreference(KEYS.hubEndpoint, submission.endpoint);
    hubClient.setRuntimeEndpoint(submission.endpoint);
    setEndpointInput(hubEndpointHost(submission.endpoint));
  }, [snapshot.configuredEndpoint, snapshot.subnetPrefix]);

  const handleEndpointSubmit = useCallback(() => {
    void applyRawInput(endpointInput);
  }, [applyRawInput, endpointInput]);

  const handleInputBlur = useCallback(() => {
    focusedRef.current = false;
    setTimeout(() => {
      if (skipBlurRef.current) {
        skipBlurRef.current = false;
        return;
      }
      void applyRawInput(endpointInputRef.current);
    }, 50);
  }, [applyRawInput]);

  const handleRecommendationPress = useCallback((
    recommendation: { kind: 'subnet' | 'configured'; value: string },
  ) => {
    skipBlurRef.current = true;
    setInputError(null);
    if (recommendation.kind === 'configured') {
      setEditFullHost(false);
      void applyRawInput(recommendation.value);
      return;
    }
    setEditFullHost(false);
    setEndpointInput(recommendation.value);
    inputRef.current?.focus();
  }, [applyRawInput]);

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
      if (!hubClient.getEffectiveEndpoint()) {
        const resolved = await resolveAndApplyHubEndpoint(canonicalEndpoint || null);
        if (!resolved) return;
      }
      await hubClient.syncNow();
    } finally {
      setSyncing(false);
    }
  }, [canonicalEndpoint, status.state]);

  const handleTogglePause = useCallback(() => {
    void (async () => {
      if (hubClient.isSyncPaused() || !hubClient.isActive()) {
        if (!hubClient.getEffectiveEndpoint()) {
          const resolved = await resolveAndApplyHubEndpoint(canonicalEndpoint || null);
          if (!resolved) return;
        }
        hubClient.resumeSync();
        return;
      }
      hubClient.pauseSync();
    })();
  }, [canonicalEndpoint]);

  const stateColor = STATE_COLORS[status.state] || Colors.textMuted;
  const isPaused = status.state === 'paused';
  const isConnected = status.state === 'connected' || isPaused;
  const isErrorState = status.state === 'hub_unreachable' || status.state === 'storage_full' || status.state === 'protocol_mismatch';
  const isLoading = status.state === 'connecting' || syncing;
  const recommendations = buildHubAddressRecommendations({
    subnetPrefix: snapshot.subnetPrefix,
    configuredEndpoint: snapshot.configuredEndpoint,
  });
  const host = hubEndpointHost(endpointInput);
  const lan = splitLanHost(host, snapshot.subnetPrefix);
  const octetMode = !editFullHost && lan.prefix != null;

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
        <View style={[styles.inputShell, inputError ? styles.inputError : null]}>
          <Text style={styles.affix}>http://</Text>
          {octetMode ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  skipBlurRef.current = true;
                  setEditFullHost(true);
                  setEndpointInput(lan.prefix ? `${lan.prefix}${lan.octet}` : host);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.prefix}>{lan.prefix}</Text>
              </TouchableOpacity>
              <TextInput
                ref={inputRef}
                style={styles.octetInput}
                value={lan.octet}
                onChangeText={(octet) => {
                  if (octet !== '' && !/^\d{1,3}$/.test(octet)) {
                    return;
                  }
                  if (octet !== '' && Number(octet) > 255) {
                    return;
                  }
                  setEndpointInput(`${lan.prefix}${octet}`);
                  setInputError(null);
                }}
                placeholder="x"
                placeholderTextColor={Colors.textMuted}
                keyboardType="number-pad"
                maxLength={3}
                returnKeyType="done"
                onFocus={() => { focusedRef.current = true; }}
                onSubmitEditing={handleEndpointSubmit}
                onBlur={handleInputBlur}
              />
            </>
          ) : (
            <TextInput
              ref={inputRef}
              style={styles.hostInput}
              value={host}
              onChangeText={(value) => {
                setEndpointInput(value);
                setInputError(null);
              }}
              placeholder={snapshot.subnetPrefix ? `${snapshot.subnetPrefix}x` : '192.168.1.10'}
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              onFocus={() => { focusedRef.current = true; }}
              onSubmitEditing={handleEndpointSubmit}
              onBlur={handleInputBlur}
            />
          )}
          <Text style={styles.affix}>:3800</Text>
        </View>
        {inputError ? <Text style={styles.errorText}>{inputError}</Text> : null}
        {recommendations.length > 0 ? (
          <View style={styles.recommendations}>
            {recommendations.map((recommendation) => (
              <TouchableOpacity
                key={`${recommendation.kind}:${recommendation.value}`}
                style={styles.recommendation}
                onPressIn={() => { skipBlurRef.current = true; }}
                onPress={() => handleRecommendationPress(recommendation)}
                activeOpacity={0.7}
              >
                <Text style={styles.recommendationLabel}>
                  {recommendation.kind === 'subnet' ? 'LAN' : 'Env'}
                </Text>
                <Text style={styles.recommendationText}>
                  {recommendation.kind === 'subnet'
                    ? recommendation.value
                    : hubEndpointHost(recommendation.value)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
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

        <TouchableOpacity
          style={styles.pauseButton}
          onPress={handleTogglePause}
          activeOpacity={0.75}
        >
          <Text style={styles.pauseButtonText}>
            {isPaused || !isConnected ? 'Start Live Logs' : 'Stop Live Logs'}
          </Text>
        </TouchableOpacity>
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
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.MD,
    paddingHorizontal: Spacing.SM,
    minHeight: 40,
  },
  inputError: {
    borderColor: Colors.error,
  },
  affix: {
    color: Colors.textMuted,
    fontSize: FontSize.MD,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  prefix: {
    color: Colors.text,
    fontSize: FontSize.MD,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  octetInput: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 40,
    maxWidth: 52,
    paddingVertical: Spacing.SM,
    paddingHorizontal: 0,
    fontSize: FontSize.MD,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  hostInput: {
    flex: 1,
    paddingVertical: Spacing.SM,
    paddingHorizontal: Spacing.XXS,
    fontSize: FontSize.MD,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  errorText: {
    fontSize: FontSize.XS,
    color: Colors.error,
    marginTop: Spacing.XXS,
  },
  recommendations: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.XS,
    marginTop: Spacing.SM,
  },
  recommendation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.XS,
    paddingHorizontal: Spacing.SM,
    paddingVertical: Spacing.XS,
    borderRadius: Radius.Pill,
    backgroundColor: Colors.primaryGhost,
    borderWidth: 1,
    borderColor: Colors.primaryDim,
  },
  recommendationLabel: {
    color: Colors.primaryLight,
    fontSize: FontSize.XXS,
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  recommendationText: {
    color: Colors.primary,
    fontSize: FontSize.SM,
    fontWeight: FontWeight.medium,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
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
