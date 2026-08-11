import type {
  DocumentArtifact,
  DocumentInputValue,
  DocumentTemplate,
  SignatureEnvelope,
} from '../../domain/src/types.ts';
import { canonicalJson, sha256Hex } from './canonical.ts';

export interface RenderDocumentOptions {
  subjectId: string;
  createdAt: string;
  inputs: Record<string, DocumentInputValue>;
}

function formatMoney(cents: DocumentInputValue, name: string): string {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents)) {
    throw new Error(`Document input ${name} must be integer cents`);
  }
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = String(absolute % 100).padStart(2, '0');
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${grouped}.${remainder}`;
}

function renderValue(name: string, formatter: string | undefined, inputs: Record<string, DocumentInputValue>): string {
  if (!Object.prototype.hasOwnProperty.call(inputs, name)) throw new Error(`Missing document input: ${name}`);
  const value = inputs[name];
  if (formatter === 'money') return formatMoney(value as DocumentInputValue, name);
  if (formatter !== undefined) throw new Error(`Unsupported document formatter: ${formatter}`);
  return String(value);
}

function artifactId(
  template: DocumentTemplate,
  subjectId: string,
  canonicalInputs: string,
  contentHash: string,
): string {
  const metadata = canonicalJson({
    templateId: template.id,
    templateVersion: template.version,
    subjectId,
    subjectType: template.subjectType,
    canonicalInputs,
    contentHash,
  });
  return `artifact-${sha256Hex(metadata).slice(0, 24)}`;
}

export function renderDocument(template: DocumentTemplate, options: RenderDocumentOptions): DocumentArtifact {
  if (!template.id || !template.version || !template.content) throw new Error('Document template is incomplete');
  if (!options.subjectId) throw new Error('Document subject ID is required');
  const canonicalInputs = canonicalJson(options.inputs);
  const content = template.content.replace(/{{(?:(\w+):)?([A-Za-z][A-Za-z0-9_]*)}}/g, (_match, formatter: string | undefined, name: string) => (
    renderValue(name, formatter, options.inputs)
  ));
  const unresolved = content.match(/{{[^}]+}}/);
  if (unresolved) throw new Error(`Unresolved document placeholder: ${unresolved[0]}`);
  const contentHash = sha256Hex(content);
  return {
    id: artifactId(template, options.subjectId, canonicalInputs, contentHash),
    schemaVersion: '1',
    createdAt: options.createdAt,
    templateId: template.id,
    templateVersion: template.version,
    subjectId: options.subjectId,
    subjectType: template.subjectType,
    canonicalInputs,
    canonicalInputHash: sha256Hex(canonicalInputs),
    contentHash,
    mimeType: template.mimeType,
    byteLength: new TextEncoder().encode(content).byteLength,
    content,
  };
}

export function verifyArtifact(artifact: DocumentArtifact): boolean {
  try {
    const parsedInputs: unknown = JSON.parse(artifact.canonicalInputs);
    if (canonicalJson(parsedInputs) !== artifact.canonicalInputs) return false;
    if (sha256Hex(artifact.canonicalInputs) !== artifact.canonicalInputHash) return false;
    if (sha256Hex(artifact.content) !== artifact.contentHash) return false;
    if (new TextEncoder().encode(artifact.content).byteLength !== artifact.byteLength) return false;
    const expectedId = artifactId({
      id: artifact.templateId,
      version: artifact.templateVersion,
      subjectType: artifact.subjectType,
      mimeType: artifact.mimeType,
      content: artifact.content,
    }, artifact.subjectId, artifact.canonicalInputs, artifact.contentHash);
    return expectedId === artifact.id;
  } catch {
    return false;
  }
}

export function createSignatureEnvelope(artifact: DocumentArtifact, createdAt: string): SignatureEnvelope {
  if (!verifyArtifact(artifact)) throw new Error('Cannot create an envelope for an invalid artifact');
  const identity = canonicalJson({
    artifactId: artifact.id,
    artifactContentHash: artifact.contentHash,
    subjectId: artifact.subjectId,
    subjectType: artifact.subjectType,
  });
  return {
    id: `envelope-${sha256Hex(identity).slice(0, 24)}`,
    schemaVersion: '1',
    createdAt,
    artifactId: artifact.id,
    artifactContentHash: artifact.contentHash,
    subjectId: artifact.subjectId,
    subjectType: artifact.subjectType,
    status: 'draft',
  };
}

export function verifyEnvelopeArtifact(envelope: SignatureEnvelope, artifact: DocumentArtifact): boolean {
  return verifyArtifact(artifact)
    && envelope.artifactId === artifact.id
    && envelope.artifactContentHash === artifact.contentHash
    && envelope.subjectId === artifact.subjectId
    && envelope.subjectType === artifact.subjectType;
}
