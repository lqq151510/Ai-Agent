package com.agent.mvp.knowledge.service;

/**
 * 知识条目词数统计（导入与整理共用，单一实现）。
 *
 * <p>为什么需要它：早期实现是 {@code text.trim().split("\\s+").length}，对中文（不写空格）会把整段 正文算成 1 个"词"，导致知识工作台的
 * wordCount 严重低估。本实现按语言特性分别计数：
 *
 * <ul>
 *   <li><b>CJK 字符按字计数</b>：CJK 统一表意文字（含扩展 A、兼容表意文字）、日文假名、韩文音节各计 1；
 *   <li><b>拉丁字母/数字按词计数</b>：连续的字母/数字视为 1 个词（如 {@code abc123}、{@code v2}）；
 *   <li><b>标点、空白、符号、emoji 不计入</b>，并作为词边界（{@code foo_bar} 计 2 个词）；
 *   <li><b>中英混排可加总</b>：{@code "Java 知识工作台 v2"} = 1 + 5 + 1 = 7。
 * </ul>
 *
 * <p>空串、空白串、{@code null} 均返回 0；纯标点返回 0。
 */
public final class WordCounter {

    private WordCounter() {}

    /** 统计文本的"字数/词数"（CJK 按字、拉丁数字按词）。 */
    public static int count(String text) {
        if (text == null || text.isBlank()) {
            return 0;
        }
        int count = 0;
        boolean insideLatinRun = false;
        int index = 0;
        while (index < text.length()) {
            int codePoint = text.codePointAt(index);
            index += Character.charCount(codePoint);
            if (isCjk(codePoint)) {
                count++;
                insideLatinRun = false;
            } else if (Character.isLetterOrDigit(codePoint)) {
                if (!insideLatinRun) {
                    count++;
                    insideLatinRun = true;
                }
            } else {
                insideLatinRun = false;
            }
        }
        return count;
    }

    /** CJK（含假名、韩文音节）判定：这些文字不依赖空格分词，按字符计数更贴近"字数"直觉。 */
    private static boolean isCjk(int codePoint) {
        return (codePoint >= 0x4E00 && codePoint <= 0x9FFF) // CJK 统一表意文字
                || (codePoint >= 0x3400 && codePoint <= 0x4DBF) // 扩展 A
                || (codePoint >= 0xF900 && codePoint <= 0xFAFF) // 兼容表意文字
                || (codePoint >= 0x3040 && codePoint <= 0x30FF) // 平假名 + 片假名
                || (codePoint >= 0xAC00 && codePoint <= 0xD7AF); // 韩文音节
    }
}
