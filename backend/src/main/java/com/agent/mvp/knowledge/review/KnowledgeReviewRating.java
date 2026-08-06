package com.agent.mvp.knowledge.review;

import com.agent.mvp.common.exception.BadRequestException;
import java.util.Arrays;

public enum KnowledgeReviewRating {
    AGAIN("again"),
    HARD("hard"),
    GOOD("good"),
    EASY("easy");

    private final String value;

    KnowledgeReviewRating(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static KnowledgeReviewRating from(String rawValue) {
        if (rawValue == null) {
            throw new BadRequestException("复习反馈不能为空");
        }
        return Arrays.stream(values())
                .filter(rating -> rating.value.equalsIgnoreCase(rawValue.trim()))
                .findFirst()
                .orElseThrow(() -> new BadRequestException("无效的复习反馈"));
    }
}
