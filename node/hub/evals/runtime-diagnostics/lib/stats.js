'use strict';

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function summarizeRuns(runs) {
  const passRates = runs.map((run) => (run.result?.summary?.pass_rate ?? 0));
  return {
    count: runs.length,
    meanPassRate: mean(passRates),
    stddevPassRate: stddev(passRates),
  };
}

module.exports = {
  mean,
  stddev,
  summarizeRuns,
};
