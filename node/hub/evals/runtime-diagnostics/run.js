'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { runConversation } = require('./lib/conversation');
const { createFakeAdapter, runTurn } = require('./codexAdapter');
const { scoreConversation } = require('./score');
const { summarizeRuns } = require('./lib/stats');
const {
  loadBehaviorEvals,
  loadTriggerEvals,
  scenarioForEvalId,
  EVAL_NAMES,
} = require('./lib/datasets');
const { startScenario, AT_1032_ISO } = require('./fixtures/scenarios');
const { EVAL_ROOT } = require('./lib/paths');

function parseArgs(argv) {
  const args = {
    model: 'gpt-5.5',
    reasoning: 'high',
    runs: 5,
    bridge: true,
    configuration: 'with_skill',
    preflight: false,
    scenario: null,
    trigger: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--preflight') args.preflight = true;
    else if (token === '--trigger') args.trigger = true;
    else if (token === '--model') args.model = argv[++i];
    else if (token === '--reasoning') args.reasoning = argv[++i];
    else if (token === '--runs') args.runs = Number(argv[++i]);
    else if (token === '--bridge') args.bridge = argv[++i] === 'true';
    else if (token === '--configuration') args.configuration = argv[++i];
    else if (token === '--scenario') args.scenario = argv[++i];
    else if (token === '--output') args.output = argv[++i];
  }
  return args;
}

function validateGrading(grading) {
  const required = ['expectations', 'summary', 'execution_metrics', 'timing', 'claims', 'user_notes_summary'];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(grading, key)) {
      throw new Error(`grading missing ${key}`);
    }
  }
}

async function preflight(options) {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-preflight-'));
  const fixture = await startScenario('single_login_401');
  const evals = loadBehaviorEvals();
  const evalItem = evals.evals[0];
  try {
    const conversation = await runConversation({
      scenario: fixture,
      evalPrompt: evalItem.prompt,
      configuration: 'with_skill',
      bridge: true,
      runNumber: 1,
      parentDir,
      adapter: createFakeAdapter({
        readSkill: true,
        commands: [{
          argv: ['npx', '--no-install', 'debug-toolkit', 'diagnose', '--at', AT_1032_ISO, '--json'],
        }],
      }),
    });
    if (!conversation.lastDiagnose) {
      throw new Error('preflight missing diagnose result');
    }
    return { ok: true, state: conversation.lastDiagnose.state };
  } finally {
    await fixture.stop();
    fs.rmSync(parentDir, { recursive: true, force: true });
  }
}

async function runBehaviorScenario(options) {
  const evalId = String(options.scenario);
  const scenarioId = scenarioForEvalId(evalId);
  if (!scenarioId) throw new Error(`unknown scenario id ${evalId}`);
  const evals = loadBehaviorEvals();
  const evalItem = evals.evals.find((item) => item.id === evalId);
  if (!evalItem) throw new Error(`missing eval item ${evalId}`);

  const outputRoot = options.output || path.join(EVAL_ROOT, 'artifacts', `${Date.now()}`);
  fs.mkdirSync(outputRoot, { recursive: true });

  const runs = [];
  for (let runNumber = 1; runNumber <= options.runs; runNumber += 1) {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), `eval-run-${evalId}-${runNumber}-`));
    const fixture = await startScenario(scenarioId, { parentDir });
    try {
      const adapter = createFakeAdapter({
        readSkill: true,
        plan: ({ turn }) => {
          if (scenarioId === 'two_active_devices' && turn === 1) {
            return ['npx', '--no-install', 'debug-toolkit', 'diagnose', '--at', AT_1032_ISO, '--json'];
          }
          if (scenarioId === 'two_active_devices' && turn === 2) {
            const resume = fixture.truth?.sessionIds?.[0];
            return ['npx', '--no-install', 'debug-toolkit', 'diagnose', '--session', resume, '--json'];
          }
          return ['npx', '--no-install', 'debug-toolkit', 'diagnose', '--at', AT_1032_ISO, '--json'];
        },
        finalMessages: ['evidence report with conclusion evidence coverage nextStep'],
      });

      const conversation = await runConversation({
        scenario: fixture,
        evalPrompt: evalItem.prompt,
        configuration: options.configuration,
        bridge: options.bridge,
        runNumber,
        parentDir,
        adapter,
      });
      conversation.configuration = options.configuration;

      const grading = scoreConversation({
        conversation,
        expectations: evalItem.expectations,
        fixture,
        evalItem,
      });
      validateGrading(grading);

      const runDir = path.join(outputRoot, `run-${runNumber}`);
      fs.mkdirSync(runDir, { recursive: true });
      fs.mkdirSync(path.join(runDir, 'outputs'), { recursive: true });
      fs.writeFileSync(path.join(runDir, 'grading.json'), JSON.stringify(grading, null, 2));
      fs.writeFileSync(path.join(runDir, 'timing.json'), JSON.stringify(grading.timing, null, 2));
      fs.writeFileSync(path.join(runDir, 'outputs/metrics.json'), JSON.stringify(grading.execution_metrics, null, 2));

      runs.push({
        eval_id: evalId,
        eval_name: EVAL_NAMES[evalId] || evalItem.prompt,
        configuration: options.configuration,
        run_number: runNumber,
        result: grading,
        notes: {
          bridge: options.bridge,
          configurationSource: options.configuration === 'without_skill' ? 'legacy-baseline' : 'canonical',
        },
      });
    } finally {
      await fixture.stop();
      fs.rmSync(parentDir, { recursive: true, force: true });
    }
  }

  const benchmark = {
    metadata: {
      model: options.model,
      reasoning: options.reasoning,
      bridge: options.bridge,
      configuration: options.configuration,
      scenario: evalId,
    },
    runs,
    run_summary: {
      [options.configuration]: summarizeRuns(runs),
      delta: {},
    },
    notes: [],
  };
  fs.writeFileSync(path.join(outputRoot, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
  return benchmark;
}

async function main(argv = process.argv) {
  const options = parseArgs(argv);
  if (options.preflight) {
    const result = await preflight(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (!options.scenario) {
    throw new Error('Specify --scenario <id> or use npm run eval:runtime-skill after extending runner');
  }
  const benchmark = await runBehaviorScenario(options);
  process.stdout.write(`${JSON.stringify({ ok: true, runs: benchmark.runs.length })}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
  preflight,
  runBehaviorScenario,
  validateGrading,
  loadBehaviorEvals,
  loadTriggerEvals,
  runTurn,
};
