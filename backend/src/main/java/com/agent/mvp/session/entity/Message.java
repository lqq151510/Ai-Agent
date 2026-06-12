package com.agent.mvp.session.entity;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.IdType;



import java.time.Instant;
import java.util.UUID;

@TableName("messages")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Message {

    @TableId
    private UUID id;

    @TableField("session_id")
    private UUID sessionId;

    
    private String role;

    
    private String content;

    @TableField("tool_trace")
    private String toolTrace;

    
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
