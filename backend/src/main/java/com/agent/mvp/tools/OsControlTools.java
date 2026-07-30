package com.agent.mvp.tools;

import dev.langchain4j.agent.tool.Tool;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class OsControlTools {
    private static final Logger log = LoggerFactory.getLogger(OsControlTools.class);

    // 白名单：允许安全的基础查看命令
    private static final String[] WHITELIST = {
        "ls", "pwd", "echo", "cat", "whoami", "date", "java -version", "mvn -v"
    };

    // 黑名单：绝对禁止的高危命令
    private static final String[] BLACKLIST = {
        "rm", "sudo", "chmod", "chown", "mv", "reboot", "shutdown", "mkfs", ">", ">>"
    };

    // Shell 元字符：禁止出现，防止命令注入（第一层防御）
    private static final String[] SHELL_METACHARS = {
        ";", "|", "&", "$", "`", "(", ")", "{", "}", ">", "<", "\n", "\r"
    };

    // 进程执行超时时间（秒）
    private static final long PROCESS_TIMEOUT_SECONDS = 30;

    @Tool(
            "Executes a terminal bash command on the macOS system. DANGEROUS: use with caution."
                    + " Useful for file reading, listing directory, or running scripts.")
    public String executeTerminalCommand(String command) {
        log.warn("\n========================================================");
        log.warn("🤖 [OS Agent] 正在尝试执行系统终端命令:");
        log.warn("💻 指令内容: {}", command);
        log.warn("========================================================");

        // 1. 检查 shell 元字符（第一层防御，防止命令注入）
        for (String metachar : SHELL_METACHARS) {
            if (command.contains(metachar)) {
                log.error("拦截：命令包含 shell 元字符 [{}]", metachar);
                return "SECURITY ERROR: Command blocked due to shell metacharacter ("
                        + metachar
                        + ")";
            }
        }

        // 2. 检查黑名单（第二层防御）
        for (String blocked : BLACKLIST) {
            if (command.contains(blocked)) {
                log.error("拦截：命令触发黑名单限制 [{}]", blocked);
                return "SECURITY ERROR: Command blocked due to blacklist restriction ("
                        + blocked
                        + ")";
            }
        }

        // 3. 检查白名单（第二层防御，必须以白名单命令开头）
        boolean isWhitelisted = false;
        for (String allowed : WHITELIST) {
            if (command.trim().startsWith(allowed)) {
                isWhitelisted = true;
                break;
            }
        }

        if (!isWhitelisted) {
            log.error("拦截：命令不在白名单内");
            return "SECURITY ERROR: Command blocked because it is not in the whitelist. Allowed"
                    + " prefixes: ls, pwd, echo, cat, whoami, date";
        }

        try {
            // 通过校验后，直接使用 ProcessBuilder 传参数组执行（不经过 bash -c，避免 shell 解析）
            log.info("✅ 安全校验通过，正在执行...");
            String[] commandParts = command.trim().split("\\s+");
            ProcessBuilder processBuilder = new ProcessBuilder(commandParts);
            processBuilder.redirectErrorStream(true);
            Process process = processBuilder.start();

            // 设置超时，防止命令卡住阻塞调用线程
            boolean finished = process.waitFor(PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                log.error("命令执行超时（{}秒），已强制销毁进程", PROCESS_TIMEOUT_SECONDS);
                return "TIMEOUT ERROR: Command execution timed out after "
                        + PROCESS_TIMEOUT_SECONDS
                        + " seconds and process was forcibly destroyed.";
            }

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader =
                    new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    output.append(line).append("\n");
                }
            }

            int exitCode = process.exitValue();
            String result = "Exit Code: " + exitCode + "\nOutput:\n" + output.toString();
            log.info("执行结果:\n{}", result);
            return result;
        } catch (Exception e) {
            log.error("执行命令失败", e);
            return "Failed to execute command: " + e.getMessage();
        }
    }
}
