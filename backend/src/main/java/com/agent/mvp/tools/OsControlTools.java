package com.agent.mvp.tools;

import dev.langchain4j.agent.tool.Tool;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;

@Component
public class OsControlTools {
    private static final Logger log = LoggerFactory.getLogger(OsControlTools.class);

    // 白名单：允许安全的基础查看命令
    private static final String[] WHITELIST = {"ls", "pwd", "echo", "cat", "whoami", "date", "java -version", "mvn -v"};
    
    // 黑名单：绝对禁止的高危命令
    private static final String[] BLACKLIST = {"rm", "sudo", "chmod", "chown", "mv", "reboot", "shutdown", "mkfs", ">", ">>"};

    @Tool("Executes a terminal bash command on the macOS system. DANGEROUS: use with caution. Useful for file reading, listing directory, or running scripts.")
    public String executeTerminalCommand(String command) {
        log.warn("\n========================================================");
        log.warn("🤖 [OS Agent] 正在尝试执行系统终端命令:");
        log.warn("💻 指令内容: {}", command);
        log.warn("========================================================");

        // 1. 检查黑名单 (优先级最高)
        for (String blocked : BLACKLIST) {
            if (command.contains(blocked)) {
                log.error("拦截：命令触发黑名单限制 [{}]", blocked);
                return "SECURITY ERROR: Command blocked due to blacklist restriction (" + blocked + ")";
            }
        }

        // 2. 检查白名单 (必须以白名单命令开头)
        boolean isWhitelisted = false;
        for (String allowed : WHITELIST) {
            if (command.trim().startsWith(allowed)) {
                isWhitelisted = true;
                break;
            }
        }

        if (!isWhitelisted) {
            log.error("拦截：命令不在白名单内");
            return "SECURITY ERROR: Command blocked because it is not in the whitelist. Allowed prefixes: ls, pwd, echo, cat, whoami, date";
        }

        try {
            // 通过黑白名单校验后执行
            log.info("✅ 安全校验通过，正在执行...");
            ProcessBuilder processBuilder = new ProcessBuilder("bash", "-c", command);
            processBuilder.redirectErrorStream(true);
            Process process = processBuilder.start();

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }

            int exitCode = process.waitFor();
            String result = "Exit Code: " + exitCode + "\nOutput:\n" + output.toString();
            log.info("执行结果:\n{}", result);
            return result;
        } catch (Exception e) {
            log.error("执行命令失败", e);
            return "Failed to execute command: " + e.getMessage();
        }
    }
}
