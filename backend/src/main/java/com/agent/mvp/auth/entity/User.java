package com.agent.mvp.auth.entity;

import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@TableName("users")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @TableId private UUID id;

    private String email;

    @TableField("password_hash")
    private String passwordHash;

    @TableField("token_version")
    private int tokenVersion;

    @TableField("custom_base_url")
    private String customBaseUrl;

    @TableField(value = "custom_api_key", typeHandler = StringCryptoTypeHandler.class)
    private String customApiKey;

    @TableField("created_at")
    private Instant createdAt;

    public void onCreate() {
        if (id == null) {
            id = UUID.randomUUID();
        }
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        if (tokenVersion < 0) {
            tokenVersion = 0;
        }
    }
}
