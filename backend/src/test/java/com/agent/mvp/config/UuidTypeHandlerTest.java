package com.agent.mvp.config;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.sql.PreparedStatement;
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
}
