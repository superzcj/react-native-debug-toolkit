'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function createFakeAdapter(script = {}) {
  let turn = 0;
  return {
    async runTurn(options) {
      turn += 1;
      const {
        prompt,
        workspace,
        env,
        cliBroker,
        scenario,
      } = options;

      const planned = typeof script.plan === 'function'
        ? script.plan({ turn, prompt, scenario })
        : (script.commands?.[turn - 1] || script.defaultCommand);

      const commands = [];
      const events = [{ type: 'turn.start', turn, promptLength: prompt.length }];
      let finalMessage = script.finalMessages?.[turn - 1] || 'done';
      const skillReads = [];

      if (script.readSkill) {
        const skillPath = path.join(workspace, '.agents/skills/react-native-debug-toolkit/SKILL.md');
        if (fs.existsSync(skillPath)) {
          skillReads.push(skillPath);
          events.push({ type: 'skill.read', path: skillPath });
        }
      }

      if (planned) {
        const argv = planned.argv || planned;
        const result = await cliBroker.invokeThroughWrapper(workspace, argv, env);
        const commandEvent = {
          type: 'command.exec',
          argv: argv.slice(),
          stdout: result.stdout,
          stderr: result.stderr,
          status: result.status,
        };
        commands.push(commandEvent);
        events.push(commandEvent);
        if (script.finalFromStdout && result.stdout.trim()) {
          finalMessage = result.stdout.trim().slice(0, 500);
        }
      }

      if (script.throwOnTurn === turn) {
        throw new Error('adapter forced error');
      }

      return {
        events,
        finalMessage,
        commands,
        brokerInvocations: cliBroker.journal.slice(),
        skillReads,
        usage: { input_tokens: 10, output_tokens: 20 },
        durationMs: 5,
        exitCode: 0,
        model: options.model,
        reasoning: options.reasoning,
      };
    },
  };
}

function runTurnReal(options) {
  const {
    prompt,
    workspace,
    model,
    reasoning,
    env,
    timeoutMs,
  } = options;

  const args = [
    'exec', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check',
    '--model', model,
    '-c', `model_reasoning_effort="${reasoning}"`,
    '-c', 'sandbox_workspace_write.network_access=false',
    '-c', 'shell_environment_policy.inherit="none"',
    '--sandbox', 'workspace-write', '--json', '--cd', workspace, '-',
  ];

  return new Promise((resolve, reject) => {
    const child = spawn('codex', args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const events = [];
    let stdout = '';
    let stderr = '';
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      for (const line of chunk.toString().split('\n')) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line));
        } catch {
          events.push({ type: 'stdout.line', text: line });
        }
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      finished = true;
      clearTimeout(timer);
      resolve({
        events,
        finalMessage: stdout.split('\n').filter(Boolean).slice(-1)[0] || '',
        commands: events.filter((event) => event.type === 'command.exec' || event.command),
        brokerInvocations: [],
        skillReads: events.filter((event) => event.type === 'skill.read').map((event) => event.path),
        usage: {},
        durationMs: 0,
        exitCode: code ?? 1,
        stderr,
      });
    });

    child.stdin.write(`${prompt}\n`);
    child.stdin.end();
  });
}

module.exports = {
  createFakeAdapter,
  runTurn: runTurnReal,
};
