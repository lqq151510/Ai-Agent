package com.agent.mvp.settings.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("user_profiles")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserProfile {

    @TableId("user_id")
    private UUID userId;

    private String displayName;

    private String avatarUrl;

    private UUID defaultModelSourceId;

    private UUID summaryModelSourceId;

    private UUID taggingModelSourceId;

    private String organizeMode;

    private String privacyMode;

    private Instant createdAt;

    private Instant updatedAt;

    public void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (updatedAt == null) {
            updatedAt = createdAt;
        }
        if (organizeMode == null || organizeMode.isBlank()) {
            organizeMode = "manual";
        }
        if (privacyMode == null || privacyMode.isBlank()) {
            privacyMode = "local_first";
        }
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
