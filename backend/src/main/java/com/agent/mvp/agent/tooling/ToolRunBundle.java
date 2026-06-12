package com.agent.mvp.agent.tooling;

import com.agent.mvp.tooling.dto.ToolExecutionResult;
import java.util.List;

public record ToolRunBundle(String promptContext, List<ToolExecutionResult> traces) {}
