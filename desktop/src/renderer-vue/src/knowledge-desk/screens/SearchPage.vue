<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Search } from '@lucide/vue'
import type { KnowledgeItem } from '../knowledgeDeskApi'
import { searchKnowledgeItems } from '../knowledgeDeskApi'
import { buildSearchCorpus, filterLocalItems } from '../knowledgeDeskViewModel'

const props = defineProps<{ apiEnabled: boolean; availableTags: string[]; searchableItems: KnowledgeItem[]; onOpenDetail: (item: KnowledgeItem) => void }>()
const query = ref(''); const results = ref<KnowledgeItem[]>([]); const isSearching = ref(false); const error = ref<string | null>(null); const hasSearched = ref(false); const input = ref<HTMLInputElement | null>(null)
const corpus = computed(() => buildSearchCorpus(props.searchableItems))
async function runSearch() {
  hasSearched.value = true; isSearching.value = true; error.value = null
  try {
    if (props.apiEnabled) { const page = await searchKnowledgeItems({ query: query.value, page: 1, pageSize: 20 }); results.value = page.items } else results.value = filterLocalItems(corpus.value, query.value)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : String(reason); results.value = filterLocalItems(corpus.value, query.value) } finally { isSearching.value = false }
}
onMounted(() => input.value?.focus())
</script>

<template>
  <div class="kd-search-page"><header class="kd-page-identity kd-page-identity--search"><div><p>QUERY ROOM / GLOBAL SEARCH</p><h2>不是翻找，是重新抵达。</h2><span>从主题、来源、标签或一句关键话，回到它最初留下来的位置。</span></div></header><form class="kd-search-box" @submit.prevent="void runSearch()"><Search :size="24" /><input ref="input" v-model="query" aria-label="全局搜索" placeholder="搜索标题、摘要、来源或标签…" /><button class="kd-action-button kd-action-button--primary" type="submit">搜索</button></form><p v-if="error" class="kd-form-error">{{ error }}</p><p v-if="isSearching">正在搜索…</p><p v-else-if="hasSearched && results.length === 0" class="kd-muted">没有找到匹配资料。</p><div v-else class="kd-search-results"><button v-for="item in results" :key="item.id" class="kd-search-result" type="button" @click="onOpenDetail(item)"><strong>{{ item.title }}</strong><span>{{ item.summary || item.source }}</span><small>{{ item.tags.join(' · ') || '未分类' }}</small></button></div></div>
</template>
