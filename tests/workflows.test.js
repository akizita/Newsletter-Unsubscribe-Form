import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

for (const filename of ['newsletter-preferences.workflow.json', 'one-click-unsubscribe.workflow.json', 'error-alert.workflow.json']) {
  test(`${filename} has connected nodes and valid embedded JavaScript`, () => {
    const workflow = JSON.parse(readFileSync(join('automation', filename), 'utf8'));
    const names = new Set(workflow.nodes.map((node) => node.name));
    assert.equal(names.size, workflow.nodes.length);
    for (const [from, outputs] of Object.entries(workflow.connections)) {
      assert.equal(names.has(from), true);
      for (const links of outputs.main) for (const link of links ?? []) assert.equal(names.has(link.node), true);
    }
    for (const node of workflow.nodes) {
      if (node.type === 'n8n-nodes-base.code') new Function('$input', '$', node.parameters.jsCode);
    }
    assert.equal(workflow.active, false);
  });
}
