'use strict';

const fs = require('fs');
const path = require('path');
const { createCliBroker, EXEC_PREFIX } = require('../cliBroker');
const { createEvalWorkspace, buildAllowlistedEnv } = require('./workspace');
const { BIN_PATH, CHECKOUT_ROOT } = require('./paths');

const MAX_TURNS = 6;

function extractDiagnoseResults(commands) {
  const results = [];
  for (const command of commands) {
    const text = command.stdout || '';
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.schemaVersion === 1 && parsed.state) {
        results.push(parsed);
      }
    } catch {
      // ignore non-json stdout
    }
  }
  return results;
}

function buildContinuationPrompt({
  priorMessages,
  userReply,
  retryArgs,
}) {
  const lines = [];
  for (const message of priorMessages) {
    lines.push(`${message.role}: ${message.content}`);
  }
  if (retryArgs?.length) {
    lines.push(`saved_retry_args: ${retryArgs.join(' ')}`);
  }
  lines.push(`user: ${userReply}`);
  return lines.join('\n');
}

async function runConversation(options = {}) {
  const {
    scenario,
    evalPrompt,
    configuration = 'with_skill',
    bridge = true,
    runNumber = 1,
    adapter,
    parentDir,
    brokerOptions = {},
  } = options;

  const skillSource = configuration === 'without_skill' ? 'legacy' : 'canonical';
  const workspaceInfo = createEvalWorkspace({ skillSource, bridge, parentDir });
  const queueDir = path.join(workspaceInfo.parentDir, 'queue');
  const broker = createCliBroker({
    queueDir,
    binPath: BIN_PATH,
    checkoutRoot: CHECKOUT_ROOT,
    allowedEndpoints: scenario.endpoints || [],
    ...brokerOptions,
  });

  const { wrapperHash } = broker.installWrapper(workspaceInfo.workspace);
  broker.startPolling(wrapperHash);

  const env = buildAllowlistedEnv(workspaceInfo, scenario);
  const turns = [];
  const priorMessages = [];
  let retryArgs = null;
  let lastDiagnose = null;
  let totalUsage = { input_tokens: 0, output_tokens: 0 };
  const startedAt = Date.now();

  try {
    const userActions = [...(scenario.userActions || [])];
    let turnIndex = 0;

    while (turnIndex < MAX_TURNS) {
      turnIndex += 1;
      if (typeof scenario.mutate === 'function') {
        await scenario.mutate(turnIndex, broker, scenario);
      }

      const action = userActions.find((item) => item.turn === turnIndex);
      const prompt = turnIndex === 1
        ? evalPrompt
        : buildContinuationPrompt({
          priorMessages,
          userReply: action?.text || '',
          retryArgs,
        });

      priorMessages.push({ role: 'user', content: prompt });

      const turnResult = await adapter.runTurn({
        prompt,
        workspace: workspaceInfo.workspace,
        model: 'gpt-5.5',
        reasoning: 'high',
        env,
        timeoutMs: 180000,
        cliBroker: broker,
        turnNumber: turnIndex,
        scenario,
        configuration,
        runNumber,
      });

      priorMessages.push({ role: 'assistant', content: turnResult.finalMessage || '' });
      turns.push(turnResult);

      if (turnResult.usage) {
        totalUsage.input_tokens += turnResult.usage.input_tokens || 0;
        totalUsage.output_tokens += turnResult.usage.output_tokens || 0;
      }

      const diagnoseResults = extractDiagnoseResults(turnResult.commands || []);
      if (diagnoseResults.length) {
        lastDiagnose = diagnoseResults[diagnoseResults.length - 1];
        const candidate = lastDiagnose.action?.retryArgs || lastDiagnose.selection?.candidates?.[0]?.resumeArgs;
        if (candidate) retryArgs = candidate;
      }

      if (lastDiagnose?.state === 'evidence_ready' || lastDiagnose?.state === 'unavailable') {
        break;
      }
      if (!action && turnIndex > 1) {
        break;
      }
    }

    return {
      turns,
      transcript: turns.flatMap((turn) => turn.events || []),
      finalMessage: turns[turns.length - 1]?.finalMessage || '',
      fixtureTruth: scenario.truth || {},
      userActions: scenario.userActions || [],
      usage: totalUsage,
      durationMs: Date.now() - startedAt,
      lastDiagnose,
      workspaceInfo,
      broker,
      retryArgs,
    };
  } catch (error) {
    error.broker = broker;
    throw error;
  } finally {
    await broker.cleanup();
  }
}

module.exports = {
  MAX_TURNS,
  EXEC_PREFIX,
  runConversation,
  buildContinuationPrompt,
  extractDiagnoseResults,
};
