import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  composeHubAddressInput,
  DEFAULT_HUB_PORT,
  hubEndpointHost,
  resolveHubAddressSubmission,
  splitHubAddressFields,
  type HubAddressFields,
} from './hubAddressRecommendations';
import { resolveAndApplyHubEndpoint } from './resolveAndApplyHubEndpoint';
import type { DevConnectV4State } from './types';
import { t, type TranslationKey } from '../../i18n';

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

const STATE_LABEL_KEYS: Record<HubConnectionState, TranslationKey | null> = {
  connecting: 'connect.connecting',
  connected: 'connect.connected',
  paused: 'connect.paused',
  retrying: 'connect.retrying',
  hub_unreachable: 'connect.hubUnreachable',
  hub_not_ready: 'connect.hubStarting',
  storage_full: 'connect.storageFull',
  protocol_mismatch: 'connect.versionMismatch',
  invalid_config: 'connect.notConfigured',
};

export function DevConnectTabV4({ snapshot }: DebugFeatureRenderProps<DevConnectV4State>) {
  const client = snapshot.client;
  const { appId, resolveEndpoint: resolveFromSnapshot, isCurrent: isOwnerCurrent } = snapshot;
  const mounted = useRef(true);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = useCallback(() => mounted.current && (isOwnerCurrent?.() ?? true), [isOwnerCurrent]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(blurTimer.current); };
  }, []);
  const canonicalEndpoint = snapshot.canonicalEndpoint;
  const octetRef = useRef<TextInput>(null);
  const portRef = useRef<TextInput>(null);
  const focusedRef = useRef(false);
  const skipBlurRef = useRef(false);
  const [fields, setFields] = useState<HubAddressFields>(() =>
    splitHubAddressFields(canonicalEndpoint || '', snapshot.subnetPrefix),
  );
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState<HubStatus>(client.getStatus());
  const [syncing, setSyncing] = useState(false);

  const replaceFields = useCallback((next: HubAddressFields) => {
    fieldsRef.current = next;
    setFields(next);
  }, []);

  useEffect(() => {
    if (focusedRef.current) {
      return;
    }
    replaceFields(splitHubAddressFields(
      client.getEffectiveEndpoint() || canonicalEndpoint || '',
      snapshot.subnetPrefix,
    ));
  }, [client, canonicalEndpoint, replaceFields, snapshot.subnetPrefix, status.state]);

  useEffect(() => {
    setStatus(client.getStatus());
    return client.subscribeStatus(setStatus);
  }, [client]);

  const applyRawInput = useCallback(async (raw: string) => {
    if (!current()) { return; }
    const submission = resolveHubAddressSubmission(
      raw,
      snapshot.configuredEndpoint,
      snapshot.subnetPrefix,
    );
    if (submission.kind === 'clear') {
      await removePreference(KEYS.hubEndpoint);
      if (!current()) { return; }
      client.clearRuntimeEndpoint();
      setInputError(null);
      replaceFields(splitHubAddressFields(submission.fallbackEndpoint, snapshot.subnetPrefix));
      return;
    }
    if (submission.kind === 'incomplete') {
      setInputError(null);
      return;
    }
    if (submission.kind === 'invalid') {
      setInputError(t('connect.invalidAddress'));
      return;
    }
    setInputError(null);
    await setPreference(KEYS.hubEndpoint, submission.endpoint);
    if (!current()) { return; }
    client.setRuntimeEndpoint(submission.endpoint);
    replaceFields(splitHubAddressFields(submission.endpoint, snapshot.subnetPrefix));
  }, [client, current, replaceFields, snapshot.configuredEndpoint, snapshot.subnetPrefix]);

  const handleEndpointSubmit = useCallback(() => {
    void applyRawInput(composeHubAddressInput(fieldsRef.current));
  }, [applyRawInput]);

  const handleInputBlur = useCallback(() => {
    focusedRef.current = false;
    clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      if (!current()) { return; }
      if (focusedRef.current) {
        return;
      }
      if (skipBlurRef.current) {
        skipBlurRef.current = false;
        return;
      }
      void applyRawInput(composeHubAddressInput(fieldsRef.current));
    }, 50);
  }, [applyRawInput, current]);

  const handleRecommendationPress = useCallback((
    recommendation: { kind: 'subnet' | 'configured'; value: string },
  ) => {
    skipBlurRef.current = true;
    setInputError(null);
    if (recommendation.kind === 'configured') {
      void applyRawInput(recommendation.value);
      return;
    }
    replaceFields({
      prefix: recommendation.value.replace(/\.$/, ''),
      octet: '',
      port: fieldsRef.current.port || DEFAULT_HUB_PORT,
    });
    octetRef.current?.focus();
  }, [applyRawInput, replaceFields]);

  const handleSyncNow = useCallback(async () => {
    if (!current() || !appId || status.state === 'protocol_mismatch' || status.state === 'invalid_config') return;

    setSyncing(true);
    try {
      if (!client.getEffectiveEndpoint()) {
        const resolved = await (resolveFromSnapshot?.() ?? resolveAndApplyHubEndpoint(canonicalEndpoint || null, { client, isCurrent: current }));
        if (!resolved) return;
      }
      if (!current()) { return; }
      await client.syncNow();
    } finally {
      if (current()) { setSyncing(false); }
    }
  }, [client, current, appId, resolveFromSnapshot, canonicalEndpoint, status.state]);

  const handleTogglePause = useCallback(() => {
    void (async () => {
      if (!current() || !appId) { return; }
      if (client.isSyncPaused() || !client.isActive()) {
        if (!client.getEffectiveEndpoint()) {
          const resolved = await (resolveFromSnapshot?.() ?? resolveAndApplyHubEndpoint(canonicalEndpoint || null, { client, isCurrent: current }));
          if (!resolved) return;
        }
        if (!current()) { return; }
        client.resumeSync();
        return;
      }
      client.pauseSync();
    })();
  }, [client, current, appId, resolveFromSnapshot, canonicalEndpoint]);

  const stateColor = STATE_COLORS[status.state] || Colors.textMuted;
  const isPaused = status.state === 'paused';
  const isConnected = status.state === 'connected' || isPaused;
  const isErrorState = status.state === 'hub_unreachable' || status.state === 'storage_full' || status.state === 'protocol_mismatch';
  const isLoading = status.state === 'connecting' || syncing;
  const recommendations = buildHubAddressRecommendations({
    subnetPrefix: snapshot.subnetPrefix,
    configuredEndpoint: snapshot.configuredEndpoint,
  });

  const updateField = (key: keyof HubAddressFields, value: string) => {
    const next = { ...fieldsRef.current, [key]: value };
    fieldsRef.current = next;
    setFields(next);
    setInputError(null);
  };

  const uploadButtonText = (() => {
    if (syncing) return t('connect.uploading');
    if (isLoading && !syncing) return t('connect.connecting');
    return t('connect.uploadOnce');
  })();

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      <Text style={styles.label}>App: {snapshot.appId || '—'}</Text>
      <Text style={styles.label}>Session: {status.session?.sessionId || '—'}</Text>
      {snapshot.reason ? <Text style={styles.stateHint}>{snapshot.reason}</Text> : null}
      {status.error ? <Text style={styles.stateHint}>{status.error}</Text> : null}
      {/* Hub Endpoint Input */}
      <View style={styles.section}>
        <Text style={styles.label}>{t('connect.hubAddress')}</Text>
        <View style={[styles.inputShell, inputError ? styles.inputError : null]}>
          <Text style={styles.affix}>http://</Text>
          <TextInput
            style={styles.prefixInput}
            value={fields.prefix}
            onChangeText={(prefix) => updateField('prefix', prefix.replace(/[^\d.]/g, ''))}
            placeholder={snapshot.subnetPrefix ? snapshot.subnetPrefix.replace(/\.$/, '') : '192.168.1'}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            returnKeyType="next"
            onFocus={() => { focusedRef.current = true; }}
            onSubmitEditing={() => octetRef.current?.focus()}
            onBlur={handleInputBlur}
          />
          <Text style={styles.affix}>.</Text>
          <TextInput
            ref={octetRef}
            style={styles.octetInput}
            value={fields.octet}
            onChangeText={(octet) => {
              if (octet !== '' && !/^\d{1,3}$/.test(octet)) {
                return;
              }
              if (octet !== '' && Number(octet) > 255) {
                return;
              }
              updateField('octet', octet);
            }}
            placeholder="x"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={3}
            returnKeyType="next"
            onFocus={() => { focusedRef.current = true; }}
            onSubmitEditing={() => portRef.current?.focus()}
            onBlur={handleInputBlur}
          />
          <Text style={styles.affix}>:</Text>
          <TextInput
            ref={portRef}
            style={styles.portInput}
            value={fields.port}
            onChangeText={(port) => {
              if (port !== '' && !/^\d{1,5}$/.test(port)) {
                return;
              }
              if (port !== '' && Number(port) > 65535) {
                return;
              }
              updateField('port', port);
            }}
            placeholder={DEFAULT_HUB_PORT}
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={5}
            returnKeyType="done"
            onFocus={() => { focusedRef.current = true; }}
            onSubmitEditing={handleEndpointSubmit}
            onBlur={handleInputBlur}
          />
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
                  {recommendation.kind === 'subnet' ? t('connect.lan') : t('connect.environment')}
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
          disabled={!snapshot.appId || status.state === 'protocol_mismatch' || status.state === 'invalid_config'}
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
          disabled={!snapshot.appId}
          activeOpacity={0.75}
        >
          <Text style={styles.pauseButtonText}>
            {isPaused || !isConnected ? t('connect.startLiveLogs') : t('connect.stopLiveLogs')}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Connection state hint */}
      {isErrorState ? (
        <Text style={styles.stateHint}>
          {STATE_LABEL_KEYS[status.state] ? t(STATE_LABEL_KEYS[status.state]!) : ''}
          {status.state === 'protocol_mismatch' ? ` ${t('connect.upgrade')}` : ''}
          {status.state === 'storage_full' ? ` ${t('connect.storageFullHint')}` : ''}
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
  prefixInput: {
    flex: 1,
    paddingVertical: Spacing.SM,
    paddingHorizontal: Spacing.XXS,
    fontSize: FontSize.MD,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  octetInput: {
    width: 40,
    paddingVertical: Spacing.SM,
    paddingHorizontal: 0,
    fontSize: FontSize.MD,
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  portInput: {
    width: 52,
    paddingVertical: Spacing.SM,
    paddingHorizontal: 0,
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
