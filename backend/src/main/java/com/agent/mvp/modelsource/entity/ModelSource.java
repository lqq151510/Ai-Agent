package com.agent.mvp.modelsource.entity;

import com.agent.mvp.auth.entity.StringCryptoTypeHandler;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("model_sources")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ModelSource {

    @TableId
    private UUID id;

    private UUID userId;

    private String providerType;

    private String name;

    private String baseUrl;

    @TableField(value = "api_key", typeHandler = StringCryptoTypeHandler.class)
    private String apiKey;

    private String defaultModel;

    private Boolean enabled;

    private Boolean isDefault;

    private String lastCheckStatus;

    private String lastCheckMessage;

    private Instant lastCheckedAt;

    private Instant createdAt;

    private Instant updatedAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (updatedAt == null) {
            updatedAt = createdAt;
        }
        if (enabled == null) {
            enabled = true;
        }
        if (isDefault == null) {
            isDefault = false;
        }
        if (lastCheckStatus == null || lastCheckStatus.isBlank()) {
            lastCheckStatus = "unknown";
        }
    }

    public void touch() {
        updatedAt = Instant.now();
    }
}
