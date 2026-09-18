/* global describe, expect, it */

import { KNOWLEDGE_FILE_ACCEPT } from './knowledgeDeskFileTypes';

describe('Knowledge Desk file chooser contract', () => {
  it('advertises the exact modern Office formats accepted by the local import flow', () => {
    expect(KNOWLEDGE_FILE_ACCEPT).toContain('.docx');
    expect(KNOWLEDGE_FILE_ACCEPT).toContain('.pptx');
    expect(KNOWLEDGE_FILE_ACCEPT).toContain('.htm');
    expect(KNOWLEDGE_FILE_ACCEPT).toContain(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(KNOWLEDGE_FILE_ACCEPT).toContain(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(KNOWLEDGE_FILE_ACCEPT).not.toContain('.doc,');
    expect(KNOWLEDGE_FILE_ACCEPT).not.toContain('.ppt,');
  });
});
