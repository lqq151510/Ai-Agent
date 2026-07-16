package com.agent.mvp.config;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.UUID;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

/**
 * UUID 类型处理器。
 *
 * <p>PostgreSQL 原生支持 UUID 类型，JDBC 驱动会自动处理。 但 H2 内存数据库（测试环境）将 UUID 存为 BINARY(16) 或
 * VARCHAR，需要显式类型处理器进行转换。
 *
 * <p>本处理器支持两种存储格式： 1. 字符串形式（如 "550e8400-e29b-41d4-a716-446655440000"） 2. 字节数组形式（16 字节 BINARY）
 *
 * <p>通过 application-test.yml 的 mybatis-plus.type-handlers-package 注册。
 */
@MappedTypes(UUID.class)
@MappedJdbcTypes(value = JdbcType.OTHER, includeNullJdbcType = true)
public class UuidTypeHandler extends BaseTypeHandler<UUID> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, UUID parameter, JdbcType jdbcType)
            throws SQLException {
        // 统一用字符串形式写入，H2 和 PostgreSQL 都兼容
        ps.setObject(i, parameter.toString());
    }

    @Override
    public UUID getNullableResult(ResultSet rs, String columnName) throws SQLException {
        Object value = rs.getObject(columnName);
        return toUuid(value);
    }

    @Override
    public UUID getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        Object value = rs.getObject(columnIndex);
        return toUuid(value);
    }

    @Override
    public UUID getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        Object value = cs.getObject(columnIndex);
        return toUuid(value);
    }

    /** 将数据库返回的值转换为 UUID，支持字符串、字节数组、UUID 三种形式。 */
    private UUID toUuid(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID) {
            return (UUID) value;
        }
        if (value instanceof String) {
            return UUID.fromString((String) value);
        }
        if (value instanceof byte[]) {
            byte[] bytes = (byte[]) value;
            if (bytes.length == 16) {
                long mostSigBits = 0;
                long leastSigBits = 0;
                for (int i = 0; i < 8; i++) {
                    mostSigBits = (mostSigBits << 8) | (bytes[i] & 0xff);
                }
                for (int i = 8; i < 16; i++) {
                    leastSigBits = (leastSigBits << 8) | (bytes[i] & 0xff);
                }
                return new UUID(mostSigBits, leastSigBits);
            }
        }
        throw new IllegalArgumentException("无法将 " + value.getClass() + " 转换为 UUID: " + value);
    }
}
