package com.agent.mvp.agent.service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class VisionModelService {

    private static final Logger log = LoggerFactory.getLogger(VisionModelService.class);
    private final String scriptPath;

    public VisionModelService(@Value("${vision.script-path:}") String scriptPath) {
        this.scriptPath = scriptPath;
    }

    public String analyzeImage(String imagePath, String prompt) {
        if (scriptPath == null || scriptPath.isBlank()) {
            throw new RuntimeException("Vision script path is not configured (vision.script-path)");
        }
        try {
            ProcessBuilder pb =
                    new ProcessBuilder(
                            "python", scriptPath, "--image", imagePath, "--prompt", prompt);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            try (BufferedReader reader =
                    new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String output = reader.lines().collect(Collectors.joining("\n"));
                int exitCode = process.waitFor();
                if (exitCode != 0) {
                    log.error("Vision script failed with exit code: {}", exitCode);
                    throw new RuntimeException("Vision script failed: " + output);
                }
                return output;
            }
        } catch (Exception e) {
            log.error("Error executing vision model script", e);
            throw new RuntimeException("Failed to analyze image", e);
        }
    }
}
