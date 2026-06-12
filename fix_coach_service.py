import re

with open("backend/src/main/java/com/agent/mvp/coach/service/CoachService.java", "r") as f:
    content = f.read()

content = content.replace("import com.agent.mvp.auth.entity.User;", "import com.agent.mvp.auth.entity.User;\nimport com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;\nimport com.baomidou.mybatisplus.extension.plugins.pagination.Page;\nimport java.util.Optional;")
content = re.sub(r'import org\.springframework\.data\.domain\.PageRequest;\n', '', content)

content = content.replace("runRepository.findById(runId)", "Optional.ofNullable(runRepository.selectById(runId))")

content = content.replace("""runRepository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, safeLimit))""", """runRepository.selectPage(
                        new Page<>(1, safeLimit),
                        new LambdaQueryWrapper<DevCoachRun>().eq(DevCoachRun::getUserId, userId).orderByDesc(DevCoachRun::getCreatedAt)
                ).getRecords()""")

content = content.replace("return runRepository.save(run);", """run.onCreate();
        runRepository.insert(run);
        return run;""")

with open("backend/src/main/java/com/agent/mvp/coach/service/CoachService.java", "w") as f:
    f.write(content)
print("CoachService Fixed")
