package com.agent.mvp.settings.dto;

import java.time.Instant;
import java.util.UUID;

public record SettingsBackupTag(UUID id, String name, String color, Instant createdAt) {}
