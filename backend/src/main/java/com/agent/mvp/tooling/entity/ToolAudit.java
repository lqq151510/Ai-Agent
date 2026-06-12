package com.agent.mvp.tooling.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("tool_audits")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ToolAudit {

    @TableId private UUID id;

    @TableField("user_id")
    private UUID userId;

    @TableField("session_id")
    private UUID sessionId;

    @TableField("tool_name")
    private String toolName;

    @TableField("args_json")
    private String argsJson;

    private String status;

    @TableField("duration_ms")
    private long durationMs;

    private String provider;

    private String model;

    @TableField("created_at")
    private Instant createdAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }
}
