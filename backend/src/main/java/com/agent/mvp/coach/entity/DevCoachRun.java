package com.agent.mvp.coach.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("dev_coach_runs")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DevCoachRun {

    @TableId private UUID id;

    @TableField("user_id")
    private UUID userId;

    @TableField("run_type")
    private String runType;

    private String title;

    @TableField("input_text")
    private String inputText;

    @TableField("output_json")
    private String outputJson;

    @TableField("artifact_path")
    private String artifactPath;

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
