package com.agent.mvp.knowledge.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.agent.mvp.knowledge.entity.KnowledgeItem;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * wordCount 统计语义单测（F3：中文被低估的修复）。
 *
 * <p>契约：CJK 按字、拉丁/数字按词、标点与符号不计且作为词边界、中英混排加总、空白/null 为 0。
 */
@DisplayName("wordCount：CJK 按字 + 拉丁数字按词 + 标点不计")
class WordCountTest {

    @Test
    @DisplayName("纯中文：每个汉字计 1")
    void countsChineseByCharacter() {
        assertEquals(5, WordCounter.count("知识工作台"));
        assertEquals(8, WordCounter.count("导入整理检索复习"));
        assertEquals(13, WordCounter.count("端到端链路测试覆盖五个步骤"));
    }

    @Test
    @DisplayName("纯英文：空白分隔的单词各计 1")
    void countsLatinByWord() {
        assertEquals(3, WordCounter.count("hello world foo"));
        assertEquals(1, WordCounter.count("knowledge"));
        assertEquals(4, WordCounter.count("a  b\tc\nd"));
    }

    @Test
    @DisplayName("中英混排：中文按字 + 英文按词，可加总")
    void countsMixedChineseAndLatin() {
        // Java(1) + 知识工作台(5) + v2(1) + beta(1) = 8
        assertEquals(8, WordCounter.count("Java 知识工作台 v2 beta"));
        // RAG(1) + 检索增强生成(6) = 7
        assertEquals(7, WordCounter.count("RAG 检索增强生成"));
        // abc123(1) + 中文(2) = 3
        assertEquals(3, WordCounter.count("abc123 中文"));
    }

    @Test
    @DisplayName("空串 / 空白串 / null 均为 0")
    void returnsZeroForBlankInput() {
        assertEquals(0, WordCounter.count(""));
        assertEquals(0, WordCounter.count("   "));
        assertEquals(0, WordCounter.count("\n\t  \r\n"));
        assertEquals(0, WordCounter.count(null));
    }

    @Test
    @DisplayName("纯标点与符号：不计入")
    void ignoresPunctuationOnly() {
        assertEquals(0, WordCounter.count("，。！？!?,.;:"));
        assertEquals(0, WordCounter.count("《》“”（）【】—…·"));
        assertEquals(0, WordCounter.count("--- ___ === ***"));
        assertEquals(0, WordCounter.count("😀😀🎉"));
    }

    @Test
    @DisplayName("边界：标点作为词边界、连续字母数字算一个词")
    void handlesBoundaries() {
        // 中文标点不计，但两侧汉字分别计数
        assertEquals(4, WordCounter.count("你好，世界"));
        assertEquals(5, WordCounter.count("《知识》工作台！"));
        // 下划线是符号 → 切断词
        assertEquals(2, WordCounter.count("foo_bar"));
        // 连续字母数字为一个词
        assertEquals(1, WordCounter.count("abc123def456"));
        // 破折号/斜杠同样切断
        assertEquals(2, WordCounter.count("read-only"));
        assertEquals(2, WordCounter.count("a/b"));
        // emoji 夹在中文之间不计
        assertEquals(2, WordCounter.count("好😀友"));
    }

    @Test
    @DisplayName("日文假名与韩文音节按字计数")
    void countsKanaAndHangulByCharacter() {
        assertEquals(4, WordCounter.count("ひらがな"));
        assertEquals(4, WordCounter.count("カタカナ"));
        assertEquals(3, WordCounter.count("한국어"));
    }

    @Test
    @DisplayName("整理链路使用同一实现：KnowledgeOrganizerService.organize 的中文 wordCount 不再被低估")
    void organizerUsesSharedWordCounter() {
        KnowledgeOrganizerService service = new KnowledgeOrganizerService();
        String content = "知识工作台的端到端链路包含导入整理检索复习助手五个步骤";
        KnowledgeItem item =
                KnowledgeItem.builder()
                        .sourceType("snippet")
                        .title("链路说明")
                        .rawContent(content)
                        .build();

        var result = service.organize(item);

        assertEquals(
                WordCounter.count(result.cleanedContent()),
                result.wordCount(),
                "整理结果应与 WordCounter 使用同一套统计语义");
        assertTrue(
                result.wordCount() >= 20,
                "该正文为 27 个汉字，旧实现（split(\"\\\\s+\")）会得到 1，实际: " + result.wordCount());
    }
}
