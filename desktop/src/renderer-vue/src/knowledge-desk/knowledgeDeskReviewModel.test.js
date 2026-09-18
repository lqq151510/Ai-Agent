/* global describe, expect, it */

import {
  knowledgeReviewFeedback,
  reviewDueCopy,
  reviewQueueCopy,
  reviewRecallPrompt,
} from './knowledgeDeskReviewModel';

describe('knowledge review presentation model', () => {
  it('keeps the four feedback choices in a stable, intentional order', () => {
    expect(knowledgeReviewFeedback.map((feedback) => feedback.rating)).toEqual([
      'again', 'hard', 'good', 'easy',
    ]);
  });

  it('uses title and summary availability without leaking unseen content', () => {
    expect(reviewRecallPrompt({ title: 'RAG 检索链路', summary: '检索、重排、生成', tags: [] }))
      .toContain('RAG 检索链路');
    expect(reviewRecallPrompt({ title: 'Java 并发', summary: '', tags: [] }))
      .toBe('先根据标题回想：Java 并发');
  });

  it('distinguishes an empty queue from a capped queue', () => {
    expect(reviewQueueCopy(0, 0)).toContain('没有待回顾');
    expect(reviewQueueCopy(10, 18)).toContain('前 10 条');
  });

  it('labels unseen and scheduled cards without assuming a locale-dependent time', () => {
    expect(reviewDueCopy(null)).toBe('首次回顾');
    expect(reviewDueCopy('not-a-date')).toBe('已安排回顾');
  });
});
