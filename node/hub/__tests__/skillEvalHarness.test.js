'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCliBroker, EXEC_PREFIX } = require('../evals/runtime-diagnostics/cliBroker');
const { runConversation, buildContinuationPrompt } = require('../evals/runtime-diagnostics/lib/conversation');
const { createFakeAdapter } = require('../evals/runtime-diagnostics/codexAdapter');
const { createEvalWorkspace } = require('../evals/runtime-diagnostics/lib/workspace');
const { scoreConversation, assertFailingTranscript } = require('../evals/runtime-diagnostics/score');
const { mean, stddev, summarizeRuns } = require('../evals/runtime-diagnostics/lib/stats');
const { loadBehaviorEvals, scenarioForEvalId } = require('../evals/runtime-diagnostics/lib/datasets');
const { startScenario, AT_1032_ISO } = require('../evals/runtime-diagnostics/fixtures/scenarios');
const { preflight, validateGrading } = require('../evals/runtime-diagnostics/run');
const { BIN_PATH, CHECKOUT_ROOT } = require('../evals/runtime-diagnostics/lib/paths');

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  delete env.JEST_WORKER_ID;
  return env;
}

describe('runtime diagnostics eval harness', () => {
  describe('cli broker', () => {
    let parentDir;
    let broker;
    let fixture;

    beforeEach(async () => {
      parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-broker-'));
      fixture = await startScenario('single_login_401');
      broker = createCliBroker({
        queueDir: path.join(parentDir, 'queue'),
        binPath: BIN_PATH,
        checkoutRoot: CHECKOUT_ROOT,
        allowedEndpoints: fixture.endpoints,
      });
    });

    afterEach(async () => {
      await broker.cleanup();
      await fixture.stop();
      fs.rmSync(parentDir, { recursive: true, force: true });
    });

    it('journals exact argv and forwards allowed diagnose', async () => {
      const argv = [...EXEC_PREFIX, 'diagnose', '--at', AT_1032_ISO, '--json'];
      const result = await broker.executeArgv(argv, childEnv({
        DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: fixture.localEndpoint,
      }));
      expect(result.status).toBe(0);
      expect(broker.journal[0].argv).toEqual(argv);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.state).toBe('evidence_ready');
    });

    it('rejects an unowned endpoint', async () => {
      const argv = [...EXEC_PREFIX, 'diagnose', '--hub', 'http://127.0.0.1:3800', '--json'];
      const result = await broker.executeArgv(argv, childEnv());
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('endpoint not allowed');
    });

    it('rejects unknown subcommands', () => {
      const validation = broker.validateArgv([...EXEC_PREFIX, 'rm', '-rf', '/']);
      expect(validation.ok).toBe(false);
    });

    it('preserves malicious target text as one argv element through the wrapper', async () => {
      const workspace = path.join(parentDir, 'ws');
      fs.mkdirSync(workspace, { recursive: true });
      const malicious = 'iPhone 15 $(touch should-not-exist);';
      const { wrapperHash } = broker.installWrapper(workspace);
      broker.startPolling(wrapperHash);
      const result = await broker.invokeThroughWrapper(
        workspace,
        [...EXEC_PREFIX, 'diagnose', '--target-match', malicious, '--json'],
        childEnv({ DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: fixture.localEndpoint }),
      );
      const matchEntry = broker.journal.find((entry) => entry.argv.includes('--target-match'));
      expect(matchEntry).toBeDefined();
      expect(matchEntry.argv[matchEntry.argv.indexOf('--target-match') + 1]).toBe(malicious);
      expect(result.status).toBeDefined();
      const sentinel = path.join(parentDir, 'should-not-exist');
      expect(fs.existsSync(sentinel)).toBe(false);
    });

    it('cleans up owned hub processes and closes the port', async () => {
      const dataDir = path.join(parentDir, 'hub-data');
      fs.mkdirSync(dataDir, { recursive: true });
      const port = 39000 + Math.floor(Math.random() * 1000);
      const localEndpoint = `http://127.0.0.1:${port}`;
      broker.setAllowedEndpoints([...fixture.endpoints, localEndpoint]);
      const argv = [...EXEC_PREFIX, 'hub', 'dev'];
      const start = await broker.executeArgv(argv, childEnv({
        DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT: localEndpoint,
        DEBUG_TOOLKIT_EVAL_HUB_DATA_DIR: dataDir,
      }));
      expect(start.status).toBe(0);
      expect(broker.getOwnedProcesses().length).toBe(1);
      await broker.cleanup();
      expect(await broker.isPortClosed(port)).toBe(true);
      expect(broker.getOwnedProcesses().length).toBe(0);
    });
  });

  describe('conversation harness', () => {
    it('uses a fresh workspace per run and forwards gpt-5.5/high in adapter results', async () => {
      const fixture = await startScenario('single_login_401');
      const parentA = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-convo-a-'));
      const parentB = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-convo-b-'));
      const adapter = createFakeAdapter({
        commands: [[...EXEC_PREFIX, 'diagnose', '--at', AT_1032_ISO, '--json']],
      });
      try {
        const runA = await runConversation({
          scenario: fixture,
          evalPrompt: '看一下刚才登录为什么失败',
          runNumber: 1,
          parentDir: parentA,
          adapter,
        });
        const runB = await runConversation({
          scenario: fixture,
          evalPrompt: '看一下刚才登录为什么失败',
          runNumber: 2,
          parentDir: parentB,
          adapter,
        });
        expect(runA.workspaceInfo.workspace).not.toBe(runB.workspaceInfo.workspace);
        expect(runA.turns[0].model).toBe('gpt-5.5');
        expect(runA.turns[0].reasoning).toBe('high');
      } finally {
        await fixture.stop();
        fs.rmSync(parentA, { recursive: true, force: true });
        fs.rmSync(parentB, { recursive: true, force: true });
      }
    });

    it('includes cumulative retry args in continuation prompts', () => {
      const prompt = buildContinuationPrompt({
        priorMessages: [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'choose' }],
        userReply: 'iPhone 15',
        retryArgs: ['npx', '--no-install', 'debug-toolkit', 'diagnose', '--resume-token', 'opaque'],
      });
      expect(prompt).toContain('saved_retry_args');
      expect(prompt).toContain('iPhone 15');
      expect(prompt).toContain('first');
    });

    it('installs bridge/no-bridge skill copies', () => {
      const withBridge = createEvalWorkspace({ bridge: true });
      const withoutBridge = createEvalWorkspace({ bridge: false });
      expect(fs.existsSync(path.join(withBridge.workspace, 'AGENTS.md'))).toBe(true);
      expect(fs.existsSync(path.join(withoutBridge.workspace, 'AGENTS.md'))).toBe(false);
      fs.rmSync(withBridge.parentDir, { recursive: true, force: true });
      fs.rmSync(withoutBridge.parentDir, { recursive: true, force: true });
    });
  });

  describe('scoring', () => {
    it('fails transcripts that ask for discoverable identifiers', () => {
      const conversation = {
        turns: [{ finalMessage: 'Please provide the appId and Hub URL?' }],
        transcript: [],
      };
      expect(assertFailingTranscript(
        'no_discoverable_hub_app_session_questions',
        conversation,
        {},
      )).toBe(true);
    });

    it('scores a successful single-login fixture conversation', async () => {
      const fixture = await startScenario('single_login_401');
      const conversation = {
        turns: [{
          finalMessage: 'conclusion unknown evidence coverage nextStep',
          commands: [{
            stdout: JSON.stringify({
              schemaVersion: 1,
              state: 'evidence_ready',
              code: null,
              target: {
                control: {
                  contentTrust: 'trusted-control',
                  endpoint: fixture.localEndpoint,
                  appId: fixture.truth.appId,
                  sessionId: fixture.truth.sessionId,
                },
              },
              session: { connectionState: 'active', syncState: 'live', warnings: [] },
              window: { since: '2026-08-17T02:30:00.000Z', until: '2026-08-17T02:40:00.000Z', timeBasis: 'event' },
              context: { contentTrust: 'untrusted', events: [] },
              completeness: {
                matched: 0,
                selected: 0,
                omitted: 0,
                previewed: 0,
                observedTypes: [],
                totalByType: {},
                syncState: 'live',
                connectionState: 'active',
                warnings: [],
                ranges: { event: null, received: null },
              },
            }),
          }],
        }],
        transcript: [],
        durationMs: 10,
      };
      const evalItem = loadBehaviorEvals().evals[0];
      const grading = scoreConversation({
        conversation,
        expectations: ['coverage_fields_present', 'target_truth'],
        fixture,
        evalItem,
      });
      validateGrading(grading);
      expect(grading.summary.pass_rate).toBeGreaterThan(0);
      await fixture.stop();
    });
  });

  describe('stats and datasets', () => {
    it('computes mean and standard deviation', () => {
      expect(mean([1, 2, 3, 4, 5])).toBe(3);
      expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(1.4142, 3);
      const summary = summarizeRuns([
        { result: { summary: { pass_rate: 1 } } },
        { result: { summary: { pass_rate: 0.8 } } },
      ]);
      expect(summary.count).toBe(2);
      expect(summary.meanPassRate).toBeCloseTo(0.9);
    });

    it('maps eval ids to scenario fixtures', () => {
      expect(scenarioForEvalId('1')).toBe('single_login_401');
      expect(scenarioForEvalId('9')).toBe('twenty_one_targets');
    });
  });

  describe('preflight', () => {
    it('broker preflight returns evidence_ready against an owned fixture', async () => {
      const result = await preflight({ model: 'gpt-5.5', reasoning: 'high' });
      expect(result.ok).toBe(true);
      expect(result.state).toBe('evidence_ready');
    });
  });
});
