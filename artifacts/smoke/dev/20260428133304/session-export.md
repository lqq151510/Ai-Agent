# smoke-session

- Session ID: b9fe1f6b-1bcc-48f8-ac3c-e570b1e64e00
- Provider/Model: OPENAI/qwen/qwen3.5-9b
- Created At: 2026-04-28T05:33:04.846317Z
- Updated At: 2026-04-28T05:33:18.592014Z
- Exported At: 2026-04-28T05:33:18.674568Z

## Messages

### user @ 2026-04-28T05:33:04.943151Z

请回复 smoke ok

### assistant @ 2026-04-28T05:33:18.588098Z



smoke ok

```json
[{"toolName":"searchCode","argsJson":"{\"query\":\"请回复 smoke ok\",\"glob\":null,\"maxResults\":40}","status":"SUCCESS","durationMs":142,"output":"/Users/liuyongze/Documents/AI-agent/scripts/smoke.sh:106:    -d \"{\\\"sessionId\\\":\\\"${SESSION_ID}\\\",\\\"message\\\":\\\"请回复 smoke ok\\\"}\" \\\n/Users/liuyongze/Documents/AI-agent/artifacts/smoke/dev/20260428133156/stream.sse:2:data:{\"sessionId\":\"8cc714c9-0613-4460-93f7-69cc5fb3d4c1\",\"provider\":\"OPENAI\",\"model\":\"qwen/qwen3.5-9b\",\"toolTraces\":[{\"toolName\":\"searchCode\",\"argsJson\":\"{\\\"query\\\":\\\"请回复 smoke ok\\\",\\\"glob\\\":null,\\\"maxResults\\\":40}\",\"status\":\"ERROR\",\"durationMs\":14,\"output\":\"rg: /app/workspace: IO error for operation on /app/workspace: No such file or directory (os error 2)\"}]}\n/Users/liuyongze/Documents/AI-agent/artifacts/smoke/dev/20260428133156/stream.sse:22:data:{\"sessionId\":\"8cc714c9-0613-4460-93f7-69cc5fb3d4c1\",\"provider\":\"OPENAI\",\"model\":\"qwen/qwen3.5-9b\",\"reply\":\"\\n\\nsmoke ok\",\"latencyMs\":11790,\"toolTraces\":[{\"toolName\":\"searchCode\",\"argsJson\":\"{\\\"query\\\":\\\"请回复 smoke ok\\\",\\\"glob\\\":null,\\\"maxResults\\\":40}\",\"status\":\"ERROR\",\"durationMs\":14,\"output\":\"rg: /app/workspace: IO error for operation on /app/workspace: No such file or directory (os error 2)\"}]}"}]
```

