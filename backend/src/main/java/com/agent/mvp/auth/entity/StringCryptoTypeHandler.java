package com.agent.mvp.auth.entity;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class StringCryptoTypeHandler extends BaseTypeHandler<String> {

    private static volatile StringCryptoConverter converter;

    public static void setConverter(StringCryptoConverter c) {
        converter = c;
    }

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, String parameter, JdbcType jdbcType) throws SQLException {
        String encrypted = converter != null ? converter.convertToDatabaseColumn(parameter) : parameter;
        ps.setString(i, encrypted);
    }

    @Override
    public String getNullableResult(ResultSet rs, String columnName) throws SQLException {
        String raw = rs.getString(columnName);
        return converter != null ? converter.convertToEntityAttribute(raw) : raw;
    }

    @Override
    public String getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        String raw = rs.getString(columnIndex);
        return converter != null ? converter.convertToEntityAttribute(raw) : raw;
    }

    @Override
    public String getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        String raw = cs.getString(columnIndex);
        return converter != null ? converter.convertToEntityAttribute(raw) : raw;
    }
}
