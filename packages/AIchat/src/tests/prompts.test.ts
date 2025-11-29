import { describe, expect, it } from 'vitest';
import { shouldIncludeFullRadiomics, buildGeneralPrompt, buildPrompt, selectRadiomicHighlights } from '../backend/utils/prompts.js';

describe('prompts utils', () => {
  it('flags radiomic heavy questions', () => {
    expect(shouldIncludeFullRadiomics('Tell me about radiomic metrics')).toBe(true);
    expect(shouldIncludeFullRadiomics('How big is the tumour?')).toBe(false);
  });

  it('builds general prompt with context', () => {
    const prompt = buildGeneralPrompt('how are you?', 'Patient feels anxious');
    expect(prompt).toContain('Patient message');
    expect(prompt).toContain('Patient feels anxious');
  });

  it('builds patient prompt payload', () => {
    const payload = buildPrompt({ recordId: 'abc123' }, 'What is the tumour volume?');
    expect(payload).toContain('abc123');
    expect(payload).toContain('What is the tumour volume?');
  });

  it('selects radiomic highlights', () => {
    const highlights = selectRadiomicHighlights({
      original_firstorder_Entropy: 1,
      original_shape_Sphericity: 0.7,
      irrelevant: 2,
    });
    expect(highlights).toHaveProperty('original_shape_Sphericity');
    expect(highlights).not.toHaveProperty('irrelevant');
  });
});
