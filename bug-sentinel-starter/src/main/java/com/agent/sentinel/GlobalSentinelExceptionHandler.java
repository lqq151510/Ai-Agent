package com.agent.sentinel;

import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;

import java.io.PrintWriter;
import java.io.StringWriter;

@ControllerAdvice
public class GlobalSentinelExceptionHandler {

    private static final int MAX_STACK_LENGTH = 4000;

    private final SentinelWebhookClient webhookClient;

    public GlobalSentinelExceptionHandler(SentinelWebhookClient webhookClient) {
        this.webhookClient = webhookClient;
    }

    @ExceptionHandler(Exception.class)
    public void handleException(Exception ex) throws Exception {
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        ex.printStackTrace(pw);
        String stackTrace = sanitizeStackTrace(sw.toString());

        webhookClient.reportException(stackTrace);

        // Re-throw the exception so the normal spring boot error handling can take over
        throw ex;
    }

    /**
     * 对堆栈做脱敏与截断处理，避免泄露密码、API key 等敏感信息，并限制最大长度。
     *
     * @param stackTrace 原始堆栈字符串
     * @return 脱敏并截断后的堆栈字符串
     */
    private String sanitizeStackTrace(String stackTrace) {
        String result = stackTrace;
        // 脱敏：替换可能包含密码、密钥的模式（不区分大小写）
        result = result.replaceAll("(?i)(password=)[^&\\s,;)]*", "$1***");
        result = result.replaceAll("(?i)(pwd=)[^&\\s,;)]*", "$1***");
        result = result.replaceAll("(?i)(apikey=)[^&\\s,;)]*", "$1***");
        result = result.replaceAll("(?i)(api-key:\\s*)[^\\s,;)]*", "$1***");
        // 截断：限制最大长度，超过则截断并添加后缀
        if (result.length() > MAX_STACK_LENGTH) {
            result = result.substring(0, MAX_STACK_LENGTH) + "...[truncated]";
        }
        return result;
    }
}
