package com.agent.mvp.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.ByteBuffer;
import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.UUID;
import org.apache.ibatis.type.JdbcType;
import org.junit.jupiter.api.Test;

class UuidTypeHandlerTest {

    @Test
    void bindsNativeUuidInsteadOfString() throws Exception {
        PreparedStatement statement = mock(PreparedStatement.class);
        UUID id = UUID.randomUUID();

        new UuidTypeHandler().setNonNullParameter(statement, 1, id, JdbcType.OTHER);

        verify(statement).setObject(1, id);
    }

    @Test
    void readsUuidStringAndNullValuesFromResultSets() throws Exception {
        UuidTypeHandler handler = new UuidTypeHandler();
        ResultSet resultSet = mock(ResultSet.class);
        UUID id = UUID.randomUUID();
        when(resultSet.getObject("native_id")).thenReturn(id);
        when(resultSet.getObject("string_id")).thenReturn(id.toString());
        when(resultSet.getObject("missing_id")).thenReturn(null);

        assertEquals(id, handler.getNullableResult(resultSet, "native_id"));
        assertEquals(id, handler.getNullableResult(resultSet, "string_id"));
        assertNull(handler.getNullableResult(resultSet, "missing_id"));
    }

    @Test
    void readsBinaryUuidFromIndexedResultSetAndCallableStatement() throws Exception {
        UuidTypeHandler handler = new UuidTypeHandler();
        ResultSet resultSet = mock(ResultSet.class);
        CallableStatement callable = mock(CallableStatement.class);
        UUID id = UUID.randomUUID();
        byte[] bytes =
                ByteBuffer.allocate(16)
                        .putLong(id.getMostSignificantBits())
                        .putLong(id.getLeastSignificantBits())
                        .array();
        when(resultSet.getObject(1)).thenReturn(bytes);
        when(callable.getObject(2)).thenReturn(id.toString());

        assertEquals(id, handler.getNullableResult(resultSet, 1));
        assertEquals(id, handler.getNullableResult(callable, 2));
    }

    @Test
    void rejectsUnsupportedAndMalformedDatabaseValues() throws Exception {
        UuidTypeHandler handler = new UuidTypeHandler();
        ResultSet resultSet = mock(ResultSet.class);
        when(resultSet.getObject(1)).thenReturn(new byte[] {1, 2, 3});
        when(resultSet.getObject(2)).thenReturn(42L);

        assertThrows(IllegalArgumentException.class, () -> handler.getNullableResult(resultSet, 1));
        assertThrows(IllegalArgumentException.class, () -> handler.getNullableResult(resultSet, 2));
    }
}
