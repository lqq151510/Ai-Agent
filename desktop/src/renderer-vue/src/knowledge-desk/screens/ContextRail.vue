<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, BookOpen, CheckCircle2, Clock3, Cpu, FolderOpen, Inbox, Library, Loader2, Tags } from '@lucide/vue'
import type { KnowledgeDeskSnapshot, KnowledgeItem } from '../knowledgeDeskApi'
import type { MainPage } from '../knowledgeDeskTypes'
import { formatCount, toPercent } from '../knowledgeDeskDisplay'
import { ContextBlock } from '../shared'

const props = defineProps<{ activePage: MainPage; selectedItem?: KnowledgeItem; snapshot: KnowledgeDeskSnapshot }>()
const storagePercent = computed(() => toPercent(props.snapshot.storage.readyItems, Math.max(props.snapshot.storage.totalItems, 1)))
const activeModel = computed(() => props.snapshot.modelProviders.find((provider) => provider.isDefault && provider.enabled)
  ?? props.snapshot.modelProviders.find((provider) => provider.state === 'connected' || provider.state === 'local')
  ?? props.snapshot.modelProviders[0])
const modelOnline = computed(() => Boolean(activeModel.value && ['connected', 'local'].includes(activeModel.value.state)))
</script>

<template>
  <aside class="kd-context-rail">
    <template v-if="activePage === 'detail'">
      <ContextBlock title="AI 摘要" :icon="BookOpen"><p>{{ selectedItem?.summary || '暂无摘要。' }}</p></ContextBlock>
      <ContextBlock title="关联标签" :icon="Tags">
        <div class="kd-tag-cloud"><span v-for="tag in selectedItem?.tags || []" :key="tag" class="kd-tag">{{ tag }}</span><span v-if="!selectedItem?.tags?.length" class="kd-muted">暂无标签</span></div>
      </ContextBlock>
      <ContextBlock title="关联条目" :icon="Library">
        <p v-for="item in snapshot.libraryItems.filter((item) => item.id !== selectedItem?.id).slice(0, 3)" :key="item.id">{{ item.title }}</p>
        <p v-if="snapshot.libraryItems.length <= 1">整理更多资料后会显示关联条目。</p>
      </ContextBlock>
    </template>
    <template v-else>
      <ContextBlock title="整理队列" :icon="Inbox">
        <div class="kd-queue-row"><Loader2 :size="15" /> {{ snapshot.dashboard.inboxItems }} 条待整理</div>
        <div class="kd-queue-row"><CheckCircle2 :size="15" /> {{ snapshot.dashboard.readyItems }} 条已整理</div>
        <div class="kd-queue-row is-warning"><AlertTriangle :size="15" /> {{ snapshot.dashboard.failedItems }} 条需重试</div>
        <div class="kd-queue-row"><Clock3 :size="15" /> {{ snapshot.dashboard.review.dueCount }} 条待回顾</div>
      </ContextBlock>
      <ContextBlock title="知识资产" :icon="FolderOpen">
        <div class="kd-asset-meter"><span :style="{ width: `${storagePercent}%` }" /></div>
        <p>{{ formatCount(snapshot.storage.readyItems) }} / {{ formatCount(snapshot.storage.totalItems) }} 条已进入可检索索引。</p>
      </ContextBlock>
      <ContextBlock title="本机推理与索引状态" :icon="Cpu">
        <div class="kd-engine-status-list">
          <div class="kd-engine-status-item"><span :class="['kd-engine-status-indicator', modelOnline ? 'kd-engine-status-indicator--active' : 'kd-engine-status-indicator--idle']" /><div class="kd-engine-status-info"><span class="kd-engine-status-label">本地推理引擎</span><span class="kd-engine-status-value">{{ activeModel?.model || activeModel?.provider || '本地模型未配置' }} · {{ modelOnline ? '在线' : '离线待连' }}</span></div></div>
          <div class="kd-engine-status-item"><span class="kd-engine-status-indicator kd-engine-status-indicator--active" /><div class="kd-engine-status-info"><span class="kd-engine-status-label">向量检索索引</span><span class="kd-engine-status-value">{{ formatCount(snapshot.storage.readyItems) }} 条嵌入向量就绪</span></div></div>
        </div>
      </ContextBlock>
    </template>
  </aside>
</template>
