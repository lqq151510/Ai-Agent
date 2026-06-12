package com.agent.mvp.config;

import com.agent.mvp.auth.entity.StringCryptoConverter;
import com.agent.mvp.auth.entity.StringCryptoTypeHandler;
import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Configuration;

@Configuration
public class TypeHandlerConfig {

    private final StringCryptoConverter converter;

    public TypeHandlerConfig(StringCryptoConverter converter) {
        this.converter = converter;
    }

    @PostConstruct
    public void wire() {
        StringCryptoTypeHandler.setConverter(converter);
    }
}
