import assert from 'node:assert/strict';
import test from 'node:test';
import type { DocumentArtifact, DocumentTemplate } from '../packages/domain/src/types.ts';
import { canonicalJson } from '../packages/documents/src/canonical.ts';
import {
  createSignatureEnvelope,
  renderDocument,
  verifyArtifact,
  verifyEnvelopeArtifact,
} from '../packages/documents/src/render.ts';

const template: DocumentTemplate = {
  id: 'acquisition-v1',
  version: '1.0.0',
  subjectType: 'acquisition',
  mimeType: 'text/plain',
  content: 'Property: {{propertyAddress}}\nPurchase price: {{money:purchasePriceCents}}\nSeller: {{sellerName}}\n',
};

const createdAt = '2026-08-11T17:00:00.000Z';

test('canonicalizes object keys independently of insertion order', () => {
  assert.equal(
    canonicalJson({ z: 3, nested: { b: 2, a: 1 }, a: ['x', true] }),
    canonicalJson({ a: ['x', true], nested: { a: 1, b: 2 }, z: 3 }),
  );
});

test('renders deterministic bytes and hashes with integer-cent money formatting', () => {
  const first = renderDocument(template, {
    subjectId: 'deal-1',
    createdAt,
    inputs: {
      sellerName: 'Owner One',
      purchasePriceCents: 123456,
      propertyAddress: '1 Main St, Boston, MA',
    },
  });
  const reordered = renderDocument(template, {
    subjectId: 'deal-1',
    createdAt,
    inputs: {
      propertyAddress: '1 Main St, Boston, MA',
      purchasePriceCents: 123456,
      sellerName: 'Owner One',
    },
  });

  assert.equal(first.content, 'Property: 1 Main St, Boston, MA\nPurchase price: $1,234.56\nSeller: Owner One\n');
  assert.equal(first.content, reordered.content);
  assert.equal(first.contentHash, reordered.contentHash);
  assert.equal(first.canonicalInputHash, reordered.canonicalInputHash);
  assert.equal(first.byteLength, new TextEncoder().encode(first.content).byteLength);
  assert.equal(first.templateId, 'acquisition-v1');
  assert.equal(first.templateVersion, '1.0.0');
  assert.equal(first.subjectId, 'deal-1');
  assert.equal(first.subjectType, 'acquisition');
  assert.equal(verifyArtifact(first), true);

  const alteredInput = renderDocument(template, {
    subjectId: 'deal-1',
    createdAt,
    inputs: {
      propertyAddress: '1 Main St, Boston, MA',
      purchasePriceCents: 123457,
      sellerName: 'Owner One',
    },
  });
  assert.ok(alteredInput.contentHash !== first.contentHash);

  const alteredTemplate = renderDocument({ ...template, version: '1.0.1', content: `${template.content}Version changed\n` }, {
    subjectId: 'deal-1',
    createdAt,
    inputs: {
      propertyAddress: '1 Main St, Boston, MA',
      purchasePriceCents: 123456,
      sellerName: 'Owner One',
    },
  });
  assert.ok(alteredTemplate.contentHash !== first.contentHash);
  assert.ok(alteredTemplate.id !== first.id);
});

test('rejects missing placeholders and invalid money values', () => {
  assert.throws(
    () => renderDocument(template, {
      subjectId: 'deal-1',
      createdAt,
      inputs: { propertyAddress: '1 Main St', purchasePriceCents: 123456 },
    }),
    /Missing document input: sellerName/,
  );
  assert.throws(
    () => renderDocument(template, {
      subjectId: 'deal-1',
      createdAt,
      inputs: { propertyAddress: '1 Main St', purchasePriceCents: 12.5, sellerName: 'Owner One' },
    }),
    /integer cents/,
  );
});

test('signature envelope binds to the exact immutable artifact content hash', () => {
  const artifact = renderDocument(template, {
    subjectId: 'deal-1',
    createdAt,
    inputs: {
      propertyAddress: '1 Main St, Boston, MA',
      purchasePriceCents: 123456,
      sellerName: 'Owner One',
    },
  });
  const envelope = createSignatureEnvelope(artifact, createdAt);
  assert.equal(envelope.artifactContentHash, artifact.contentHash);
  assert.equal(verifyEnvelopeArtifact(envelope, artifact), true);

  const tampered: DocumentArtifact = { ...artifact, content: `${artifact.content}tampered` };
  assert.equal(verifyArtifact(tampered), false);
  assert.equal(verifyEnvelopeArtifact(envelope, tampered), false);
});
