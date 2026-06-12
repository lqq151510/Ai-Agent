package com.agent.mvp.coach.domain;

import java.util.List;

public record GeneratedScaffold(
        String preset, String projectName, List<ScaffoldFile> files, List<String> startCommands) {}
