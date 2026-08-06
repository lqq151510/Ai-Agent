import type { KnowledgeReviewItem, KnowledgeReviewRating } from './knowledgeDeskApi';

export const knowledgeReviewFeedback: Array<{
  rating: KnowledgeReviewRating;
  label: string;
  detail: string;
}> = [
  { rating: 'again', label: '再来一次', detail: '明天重新出现，重复次数重置。' },
  { rating: 'hard', label: '有点难', detail: '缩短节奏，给自己更多提示空间。' },
  { rating: 'good', label: '记住了', detail: '按当前掌握程度推进下一次回顾。' },
  { rating: 'easy', label: '很轻松', detail: '拉长间隔，减少不必要的重复。' },
];

export const reviewRecallPrompt = (item: KnowledgeReviewItem) => (
  item.summary.trim()
    ? `先根据标题回想这条资料的核心：${item.title}`
    : `先根据标题回想：${item.title}`
);

export const reviewQueueCopy = (loadedCount: number, dueCount: number) => {
  if (loadedCount === 0) {
    return '今天没有待回顾资料，去收集或整理一些新知识吧。';
  }
  if (dueCount > loadedCount) {
    return `已加载前 ${loadedCount} 条，今天还有 ${dueCount} 条可回顾。`;
  }
  return `今天有 ${dueCount} 条资料等待你主动找回。`;
};

export const reviewDueCopy = (dueAt: string | null) => {
  if (!dueAt) return '首次回顾';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return '已安排回顾';
  return `下次回顾：${due.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`;
};
