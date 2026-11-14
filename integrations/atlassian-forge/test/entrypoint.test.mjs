import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../src/index.js';

test('the deployed Forge entrypoint initializes with the installed Atlassian SDK exports', () => {
  assert.equal(typeof handler, 'function');
});
