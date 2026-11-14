import { validate } from '@forge/manifest';

const result = await validate(false, 'manifest.yml');
for (const error of result.errors ?? []) {
  const position = error.line ? `:${error.line}:${error.column ?? 1}` : '';
  process.stderr.write(`${error.level.toUpperCase()}${position}: ${error.message}\n`);
}

if (!result.success) {
  process.exitCode = 1;
} else {
  process.stdout.write('Forge manifest passed Atlassian full manifest validation.\n');
}
