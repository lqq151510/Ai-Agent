package com.agent.mvp.session.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.IdType;


import com.agent.mvp.agent.ModelProviderType;
import com.agent.mvp.auth.entity.User;

import java.time.Instant;
import java.util.UUID;

@TableName("conversation_sessions")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConversationSession {

    @TableId
    private UUID id;

    @TableField("user_id")
    private UUID userId;

    
    private String title;

    private ModelProviderType provider;

    
    private String model;

    @TableField("context_token_limit")
    private Integer contextTokenLimit;

    @TableField("created_at")
    private Instant createdAt;

    @TableField("updated_at")
    private Instant updatedAt;

    @com.baomidou.mybatisplus.annotation.Version
    private Long version;

    
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
