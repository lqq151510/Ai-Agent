import re

with open("backend/src/main/java/com/agent/mvp/auth/service/AuthService.java", "r") as f:
    content = f.read()

content = content.replace("import com.agent.mvp.auth.entity.User;", "import com.agent.mvp.auth.entity.User;\nimport com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;\nimport java.util.Optional;")

content = content.replace("userRepository.existsByEmail(normalizedEmail)", "userRepository.selectCount(new LambdaQueryWrapper<User>().eq(User::getEmail, normalizedEmail)) > 0")

content = content.replace("User saved = userRepository.save(user);", "user.onCreate(); userRepository.insert(user); User saved = user;")

content = content.replace("userRepository.findByEmail(normalizedEmail)", "Optional.ofNullable(userRepository.selectOne(new LambdaQueryWrapper<User>().eq(User::getEmail, normalizedEmail)))")

content = content.replace("userRepository.findById(", "Optional.ofNullable(userRepository.selectById(")

content = content.replace("userRepository.save(user);", "if(user.getId() == null) { user.onCreate(); userRepository.insert(user); } else { userRepository.updateById(user); }")

with open("backend/src/main/java/com/agent/mvp/auth/service/AuthService.java", "w") as f:
    f.write(content)
print("AuthService Fixed")
