import { mkdir, writeFile } from 'node:fs/promises';
import { runEvaluationCases, type EvaluationCaseResult } from './cases.ts';

export interface EvaluationReport {
  generatedAt: string;
  passed: boolean;
  caseCount: number;
  passedCount: number;
  failedCount: number;
  results: EvaluationCaseResult[];
}

export interface RunEvaluationsOptions {
  writeResults?: boolean;
  outputPath?: string;
}

export async function runEvaluations(options: RunEvaluationsOptions = {}): Promise<EvaluationReport> {
  const results = await runEvaluationCases();
  const passedCount = results.filter((result) => result.passed).length;
  const report: EvaluationReport = {
    generatedAt: new Date().toISOString(),
    passed: passedCount === results.length,
    caseCount: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    results,
  };
  if (options.writeResults ?? true) {
    const outputPath = options.outputPath ?? 'evals/results/latest.json';
    const slash = outputPath.lastIndexOf('/');
    if (slash > 0) await mkdir(outputPath.slice(0, slash), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

if (process.argv[1]?.endsWith('/evals/run.ts')) {
  runEvaluations()
    .then((report) => {
      process.stdout.write(`${JSON.stringify({ passed: report.passed, caseCount: report.caseCount, passedCount: report.passedCount, failedCount: report.failedCount })}\n`);
      if (!report.passed) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
