<script lang="ts">
import type { KnowledgeReviewItem, KnowledgeReviewQueue, KnowledgeReviewRating } from './knowledgeDeskApi'

export interface ReviewPageProps {
  apiEnabled: boolean
  onOpenDetail: (itemId: string) => void
  onReviewCompleted: () => Promise<void>
}
</script>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { BookOpen, CheckCircle2, Clock3, Eye, EyeOff, Loader2, RefreshCw, Tags } from '@lucide/vue'
import { EmptyState, ErrorCard } from './components'
import { completeKnowledgeReview, loadKnowledgeReviewQueue } from './knowledgeDeskApi'
import {
  knowledgeReviewFeedback,
  reviewDueCopy,
  reviewQueueCopy,
  reviewRecallPrompt,
} from './knowledgeDeskReviewModel'

const props = defineProps<ReviewPageProps>()

const queue = ref<KnowledgeReviewQueue | null>(null)
const isLoading = ref(false)
const isSubmitting = ref<KnowledgeReviewRating | null>(null)
const answerRevealed = ref(false)
const error = ref<string | null>(null)

const item = computed<KnowledgeReviewItem | undefined>(() => queue.value?.items[0])
const queueCopy = computed(() =>
  queue.value ? reviewQueueCopy(queue.value.items.length, queue.value.dueCount) : '',
)
const reviewCardLabel = computed(() => {
  if (!queue.value) return ''
  return queue.value.items.length > 1 ? `1 / ${queue.value.items.length}` : ''
})

async function reload() {
  if (!props.apiEnabled) {
    queue.value = null
    error.value = null
    return
  }
  isLoading.value = true
  error.value = null
  try {
    const nextQueue = await loadKnowledgeReviewQueue()
    queue.value = nextQueue
    answerRevealed.value = false
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : String(loadError)
  } finally {
    isLoading.value = false
  }
}

let mountTimer: number | undefined
onMounted(() => {
  mountTimer = window.setTimeout(() => {
    void reload()
  }, 0)
})
onUnmounted(() => {
  if (mountTimer !== undefined) window.clearTimeout(mountTimer)
})

// Reload whenever the backend availability flips (mirrors React's reload useCallback dependency).
watch(
  () => props.apiEnabled,
  () => {
    void reload()
  },
)

async function submitRating(rating: KnowledgeReviewRating) {
  if (!item.value || isSubmitting.value) return
  isSubmitting.value = rating
  error.value = null
  try {
    await completeKnowledgeReview(item.value.id, rating)
    await reload()
    await props.onReviewCompleted().catch(() => undefined)
  } catch (submitError) {
    error.value = submitError instanceof Error ? submitError.message : String(submitError)
  } finally {
    isSubmitting.value = null
  }
}
</script>

<template>
  <div
    class="kd-review-page"
    :class="isLoading && !queue ? 'kd-review-page--loading' : ''"
    :aria-live="isLoading && !queue ? 'polite' : undefined"
  >
    <template v-if="!apiEnabled">
      <EmptyState
        :icon="BookOpen"
        title="每日回顾暂不可用"
        description="每日回顾需要桌面端本机知识服务。浏览器预览不会伪造复习进度或写入学习状态。"
      />
    </template>

    <template v-else-if="error && !item">
      <ErrorCard
        description="无法加载本机回顾队列。你的知识条目和原件没有被修改。"
        :error="error"
        :on-retry="() => void reload()"
        retry-label="重新加载"
        title="每日回顾暂时不可用"
      />
    </template>

    <template v-else-if="isLoading && !queue">
      <Loader2 class="kd-spin" :size="22" />
      正在读取本机回顾队列…
    </template>

    <template v-else-if="item">
      <section class="kd-review-hero">
        <div>
          <p>SPACED RECALL / DAILY REVIEW</p>
          <h2>先凭记忆找回，<em>再决定下一次相遇。</em></h2>
          <span>{{ queueCopy }}</span>
        </div>
        <button class="kd-secondary-button" :disabled="isLoading || isSubmitting !== null" type="button" @click="() => void reload()">
          <RefreshCw :size="16" />
          刷新队列
        </button>
      </section>

      <article class="kd-review-card">
        <header class="kd-review-card-header">
          <div>
            <span class="kd-review-eyebrow">回顾卡 {{ reviewCardLabel }}</span>
            <h3>{{ item.title }}</h3>
          </div>
          <span class="kd-review-due"><Clock3 :size="15" /> {{ reviewDueCopy(item.dueAt) }}</span>
        </header>

        <div class="kd-review-prompt">
          <span>回想提示</span>
          <p>{{ reviewRecallPrompt(item) }}</p>
        </div>

        <section v-if="answerRevealed" class="kd-review-answer" aria-label="摘要与标签">
          <div>
            <span>摘要</span>
            <p>{{ item.summary.trim() || '这条资料尚无摘要。可打开详情补充整理，再回到这里复习。' }}</p>
          </div>
          <div>
            <span><Tags :size="15" /> 标签</span>
            <div class="kd-tag-cloud">
              <i v-for="tag in item.tags" :key="tag.id ?? tag.name" class="kd-tag">{{ tag.name }}</i>
              <em v-if="item.tags.length === 0" class="kd-muted">暂无标签</em>
            </div>
          </div>
        </section>
        <button v-else class="kd-review-reveal" type="button" @click="answerRevealed = true">
          <Eye :size="17" />
          显示摘要与标签
        </button>

        <div class="kd-review-card-actions">
          <button class="kd-secondary-button" type="button" @click="onOpenDetail(item.id)">
            <BookOpen :size="16" />
            打开详情
          </button>
          <button v-if="answerRevealed" class="kd-review-hide" type="button" @click="answerRevealed = false">
            <EyeOff :size="16" />
            收起答案
          </button>
        </div>

        <section class="kd-review-feedback" aria-label="选择本次回顾反馈">
          <button
            v-for="feedback in knowledgeReviewFeedback"
            :key="feedback.rating"
            :class="`kd-review-rating kd-review-rating--${feedback.rating}`"
            :disabled="isSubmitting !== null"
            type="button"
            @click="submitRating(feedback.rating)"
          >
            <Loader2 v-if="isSubmitting === feedback.rating" class="kd-spin" :size="16" />
            <strong>{{ feedback.label }}</strong>
            <span>{{ feedback.detail }}</span>
          </button>
        </section>
        <p v-if="error" class="kd-review-inline-error" role="alert">{{ error }}</p>
      </article>
    </template>

    <template v-else>
      <EmptyState
        :action="{ label: '刷新队列', onClick: () => void reload() }"
        :icon="CheckCircle2"
        title="今日回顾已完成"
        description="今天没有待回顾资料。收集并整理新资料后，它们会在这里以首次回顾的方式出现。"
      >
        <template #action-icon>
          <RefreshCw :size="16" />
        </template>
      </EmptyState>
    </template>
  </div>
</template>
