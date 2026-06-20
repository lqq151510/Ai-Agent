package com.agent.mvp.coach.service;

import com.agent.mvp.coach.domain.GeneratedScaffold;
import com.agent.mvp.coach.domain.ScaffoldFile;
import com.agent.mvp.coach.dto.ScaffoldRequest;
import com.agent.mvp.common.exception.BadRequestException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class ScaffoldTemplateRegistry {

    private static final Set<String> PRESETS =
            Set.of("spring-ai-rag-starter", "langchain4j-agent-starter", "spring-boot-agent-basic");

    public GeneratedScaffold generate(ScaffoldRequest request) {
        String preset = normalizePreset(request.preset());
        String projectName = normalizeProjectName(request.projectName());
        String basePackage = normalizeBasePackage(request.basePackage());
        String packagePath = basePackage.replace('.', '/');
        String description =
                request.description() == null || request.description().isBlank()
                        ? defaultDescription(preset)
                        : request.description().trim();

        List<ScaffoldFile> files =
                List.of(
                        new ScaffoldFile("pom.xml", pom(projectName)),
                        new ScaffoldFile("README.md", readme(projectName, preset, description)),
                        new ScaffoldFile(
                                "src/main/resources/application.yml", applicationYaml(projectName)),
                        new ScaffoldFile(
                                "src/main/java/"
                                        + packagePath
                                        + "/"
                                        + className(projectName)
                                        + "Application.java",
                                applicationClass(basePackage, className(projectName))),
                        new ScaffoldFile(
                                "src/main/java/" + packagePath + "/api/DevCoachController.java",
                                controller(basePackage, preset)),
                        new ScaffoldFile(
                                "src/main/java/" + packagePath + "/service/DevCoachService.java",
                                service(basePackage, preset)),
                        new ScaffoldFile(
                                "src/test/java/"
                                        + packagePath
                                        + "/service/DevCoachServiceTest.java",
                                serviceTest(basePackage)));

        return new GeneratedScaffold(
                preset, projectName, files, List.of("mvn -q test", "mvn spring-boot:run"));
    }

    public Map<String, String> listPresets() {
        return Map.of(
                "spring-ai-rag-starter",
                        "Spring Boot RAG starter with retrieval-oriented service boundaries",
                "langchain4j-agent-starter", "Agent starter with tool-planning service boundaries",
                "spring-boot-agent-basic", "Minimal Spring Boot AI assistant skeleton");
    }

    private String normalizePreset(String value) {
        String preset = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!PRESETS.contains(preset)) {
            throw new BadRequestException("Unsupported scaffold preset: " + value);
        }
        return preset;
    }

    private String normalizeProjectName(String value) {
        return value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeBasePackage(String value) {
        String normalized = value.trim();
        if (!normalized.matches("[a-zA-Z_][a-zA-Z0-9_]*(\\.[a-zA-Z_][a-zA-Z0-9_]*)*")) {
            throw new BadRequestException("Base package is invalid");
        }
        return normalized;
    }

    private String className(String projectName) {
        StringBuilder out = new StringBuilder();
        for (String part : projectName.split("-")) {
            if (part.isBlank()) {
                continue;
            }
            out.append(Character.toUpperCase(part.charAt(0)));
            if (part.length() > 1) {
                out.append(part.substring(1));
            }
        }
        return out.length() == 0 ? "DevCoach" : out.toString();
    }

    private String defaultDescription(String preset) {
        return switch (preset) {
            case "spring-ai-rag-starter" ->
                    "A Spring Boot starter for RAG-style Java AI applications.";
            case "langchain4j-agent-starter" ->
                    "A Java agent starter with planner and tool execution boundaries.";
            default -> "A minimal Java AI assistant built with Spring Boot.";
        };
    }

    private String pom(String projectName) {
        return """
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.2</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>%s</artifactId>
    <version>0.1.0-SNAPSHOT</version>
    <properties>
        <java.version>25</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
"""
                .formatted(projectName);
    }

    private String readme(String projectName, String preset, String description) {
        return """
               # %s

               Preset: `%s`

               %s

               ## Run

               ```bash
               mvn -q test
               mvn spring-boot:run
               ```

               ## Boundaries

               - `api`: HTTP adapter
               - `service`: use-case orchestration
               - future `domain`: Java AI rules and task models
               - future `infra`: model provider, vector database, and external SDK adapters
               """
                .formatted(projectName, preset, description);
    }

    private String applicationYaml(String projectName) {
        return """
               spring:
                 application:
                   name: %s

               server:
                 port: 8080
               """
                .formatted(projectName);
    }

    private String applicationClass(String basePackage, String className) {
        return """
               package %s;

               import org.springframework.boot.SpringApplication;
               import org.springframework.boot.autoconfigure.SpringBootApplication;

               @SpringBootApplication
               public class %sApplication {
                   public static void main(String[] args) {
                       SpringApplication.run(%sApplication.class, args);
                   }
               }
               """
                .formatted(basePackage, className, className);
    }

    private String controller(String basePackage, String preset) {
        return """
package %s.api;

import %s.service.DevCoachService;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dev-coach")
public class DevCoachController {
    private final DevCoachService service;

    public DevCoachController(DevCoachService service) {
        this.service = service;
    }

    @PostMapping("/plan")
    public DevCoachPlan plan(@RequestBody DevCoachRequest request) {
        return service.plan(request.requirement());
    }

    public record DevCoachRequest(@NotBlank String requirement) {}

    public record DevCoachPlan(String preset, String nextStep, String verification) {}
}
"""
                .formatted(basePackage, basePackage);
    }

    private String service(String basePackage, String preset) {
        String nextStep =
                switch (preset) {
                    case "spring-ai-rag-starter" ->
                            "Define document ingestion, retrieval interface, and answer synthesis.";
                    case "langchain4j-agent-starter" ->
                            "Define planner, tool registry, execution trace, and safety limits.";
                    default -> "Define request DTO, service use case, and model adapter boundary.";
                };
        return """
               package %s.service;

               import %s.api.DevCoachController.DevCoachPlan;
               import org.springframework.stereotype.Service;

               @Service
               public class DevCoachService {
                   public DevCoachPlan plan(String requirement) {
                       return new DevCoachPlan(
                               "%s",
                               "%s",
                               "Add a unit test first, then run mvn -q test."
                       );
                   }
               }
               """
                .formatted(basePackage, basePackage, preset, nextStep);
    }

    private String serviceTest(String basePackage) {
        return """
package %s.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class DevCoachServiceTest {
    @Test
    void planShouldReturnVerificationStep() {
        DevCoachService service = new DevCoachService();
        assertTrue(service.plan("build a Java AI assistant").verification().contains("mvn -q test"));
    }
}
"""
                .formatted(basePackage);
    }
}
