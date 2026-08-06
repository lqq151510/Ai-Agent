import { useCallback, useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, Clock3, Eye, EyeOff, Loader2, RefreshCw, Tags } from 'lucide-react';
import { EmptyState, ErrorCard } from './components';
import {
  completeKnowledgeReview,
  loadKnowledgeReviewQueue,
  type KnowledgeReviewItem,
  type KnowledgeReviewQueue,
  type KnowledgeReviewRating,
} from './knowledgeDeskApi';
import {
  knowledgeReviewFeedback,
  reviewDueCopy,
  reviewQueueCopy,
  reviewRecallPrompt,
} from './knowledgeDeskReviewModel';

type ReviewPageProps = {
  apiEnabled: boolean;
  onOpenDetail: (itemId: string) => void;
  onReviewCompleted: () => Promise<void>;
};

export const ReviewPage = ({ apiEnabled, onOpenDetail, onReviewCompleted }: ReviewPageProps) => {
  const [queue, setQueue] = useState<KnowledgeReviewQueue | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<KnowledgeReviewRating | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!apiEnabled) {
      setQueue(null);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const nextQueue = await loadKnowledgeReviewQueue();
      setQueue(nextQueue);
      setAnswerRevealed(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [apiEnabled]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const item = queue?.items[0];
  const submitRating = async (rating: KnowledgeReviewRating) => {
    if (!item || isSubmitting) return;
    setIsSubmitting(rating);
    setError(null);
    try {
      await completeKnowledgeReview(item.id, rating);
      await reload();
      await onReviewCompleted().catch(() => undefined);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setIsSubmitting(null);
    }
  };

  if (!apiEnabled) {
    return (
      <div className="kd-review-page">
        <EmptyState
          description="每日回顾需要桌面端本机知识服务。浏览器预览不会伪造复习进度或写入学习状态。"
          icon={BookOpen}
          title="每日回顾暂不可用"
        />
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="kd-review-page">
        <ErrorCard
          description="无法加载本机回顾队列。你的知识条目和原件没有被修改。"
          error={error}
          onRetry={() => void reload()}
          retryLabel="重新加载"
          title="每日回顾暂时不可用"
        />
      </div>
    );
  }

  if (isLoading && !queue) {
    return (
      <div className="kd-review-page kd-review-page--loading" aria-live="polite">
        <Loader2 className="kd-spin" size={22} />
        正在读取本机回顾队列…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="kd-review-page">
        <EmptyState
          action={{ label: '刷新队列', onClick: () => void reload(), icon: <RefreshCw size={16} /> }}
          description="今天没有待回顾资料。收集并整理新资料后，它们会在这里以首次回顾的方式出现。"
          icon={CheckCircle2}
          title="今日回顾已完成"
        />
      </div>
    );
  }

  return (
    <div className="kd-review-page">
      <section className="kd-review-hero">
        <div>
          <p>每日回顾</p>
          <h2>先凭记忆找回，再决定下一次相遇的时间。</h2>
          <span>{reviewQueueCopy(queue.items.length, queue.dueCount)}</span>
        </div>
        <button className="kd-secondary-button" disabled={isLoading || isSubmitting !== null} onClick={() => void reload()} type="button">
          <RefreshCw size={16} />
          刷新队列
        </button>
      </section>

      <article className="kd-review-card">
        <header className="kd-review-card-header">
          <div>
            <span className="kd-review-eyebrow">回顾卡 {queue.items.length > 1 ? `1 / ${queue.items.length}` : ''}</span>
            <h3>{item.title}</h3>
          </div>
          <span className="kd-review-due"><Clock3 size={15} /> {reviewDueCopy(item.dueAt)}</span>
        </header>

        <div className="kd-review-prompt">
          <span>回想提示</span>
          <p>{reviewRecallPrompt(item)}</p>
        </div>

        {answerRevealed ? <ReviewAnswer item={item} /> : (
          <button className="kd-review-reveal" onClick={() => setAnswerRevealed(true)} type="button">
            <Eye size={17} />
            显示摘要与标签
          </button>
        )}

        <div className="kd-review-card-actions">
          <button className="kd-secondary-button" onClick={() => onOpenDetail(item.id)} type="button">
            <BookOpen size={16} />
            打开详情
          </button>
          {answerRevealed ? (
            <button className="kd-review-hide" onClick={() => setAnswerRevealed(false)} type="button">
              <EyeOff size={16} />
              收起答案
            </button>
          ) : null}
        </div>

        <section className="kd-review-feedback" aria-label="选择本次回顾反馈">
          {knowledgeReviewFeedback.map((feedback) => (
            <button
              className={`kd-review-rating kd-review-rating--${feedback.rating}`}
              disabled={isSubmitting !== null}
              key={feedback.rating}
              onClick={() => void submitRating(feedback.rating)}
              type="button"
            >
              {isSubmitting === feedback.rating ? <Loader2 className="kd-spin" size={16} /> : null}
              <strong>{feedback.label}</strong>
              <span>{feedback.detail}</span>
            </button>
          ))}
        </section>
        {error ? <p className="kd-review-inline-error" role="alert">{error}</p> : null}
      </article>
    </div>
  );
};

const ReviewAnswer = ({ item }: { item: KnowledgeReviewItem }) => (
  <section className="kd-review-answer" aria-label="摘要与标签">
    <div>
      <span>摘要</span>
      <p>{item.summary.trim() || '这条资料尚无摘要。可打开详情补充整理，再回到这里复习。'}</p>
    </div>
    <div>
      <span><Tags size={15} /> 标签</span>
      <div className="kd-tag-cloud">
        {item.tags.map((tag) => <i className="kd-tag" key={tag.id ?? tag.name}>{tag.name}</i>)}
        {item.tags.length === 0 ? <em className="kd-muted">暂无标签</em> : null}
      </div>
    </div>
  </section>
);
