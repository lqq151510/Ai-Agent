package com.agent.mvp.session.entity;

import com.agent.mvp.agent.ModelProviderType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("conversation_sessions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConversationSession {

    @TableId private UUID id;

    @TableField("user_id")
    private UUID userId;

    private String title;

    private ModelProviderType provider;

    private String model;

    @TableField("context_token_limit")
    private Integer contextTokenLimit;

    @TableField("task_type")
    private String taskType;

    @TableField("task_goal")
    private String taskGoal;

    @TableField("task_status")
    private String taskStatus;

    @TableField("created_at")
    private Instant createdAt;

    @TableField("updated_at")
    private Instant updatedAt;

    @com.baomidou.mybatisplus.annotation.Version private Long version;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
    }

    public void onUpdate() {
        updatedAt = Instant.now();
    }
}
