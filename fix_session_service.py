import re

with open("backend/src/main/java/com/agent/mvp/session/service/SessionService.java", "r") as f:
    content = f.read()

content = content.replace("import com.agent.mvp.auth.entity.User;", "import com.agent.mvp.auth.entity.User;\nimport com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;\nimport com.baomidou.mybatisplus.extension.plugins.pagination.Page;\nimport java.util.Optional;")

content = content.replace("userRepository.findById(userId)", "Optional.ofNullable(userRepository.selectById(userId))")

content = content.replace("session.setUser(user);", "session.setUserId(user.getId());")
content = content.replace("sessionRepository.save(session)", "saveSession(session)")

content = content.replace("org.springframework.data.domain.Page<ConversationSession> sessionPage = sessionRepository.findByUser_IdOrderByUpdatedAtDesc(", """Page<ConversationSession> sessionPage = sessionRepository.selectPage(
                new Page<>(Math.max(1, page + 1), Math.max(1, size)),
                new LambdaQueryWrapper<ConversationSession>()
                        .eq(ConversationSession::getUserId, userId)
                        .orderByDesc(ConversationSession::getUpdatedAt)
        ); // """)

content = content.replace("sessionPage.getNumber()", "((int) sessionPage.getCurrent() - 1)")
content = content.replace("sessionPage.getSize()", "(int) sessionPage.getSize()")
content = content.replace("sessionPage.getTotalElements()", "sessionPage.getTotal()")
content = content.replace("sessionPage.getTotalPages()", "(int) sessionPage.getPages()")
content = content.replace("sessionPage.getContent()", "sessionPage.getRecords()")

content = content.replace("sessionRepository.findByIdAndUser_Id(sessionId, userId)", "Optional.ofNullable(sessionRepository.selectOne(new LambdaQueryWrapper<ConversationSession>().eq(ConversationSession::getId, sessionId).eq(ConversationSession::getUserId, userId)))")

content = content.replace("messageRepository.findBySessionIdOrderByCreatedAtAsc(session.getId())", "messageRepository.selectList(new LambdaQueryWrapper<Message>().eq(Message::getSessionId, session.getId()).orderByAsc(Message::getCreatedAt))")

content = content.replace("""messageRepository.findBySessionIdOrderByCreatedAtDesc(
                        session.getId(),
                        PageRequest.of(0, Math.max(1, limit))
                )""", """messageRepository.selectPage(
                        new Page<>(1, Math.max(1, limit)),
                        new LambdaQueryWrapper<Message>().eq(Message::getSessionId, session.getId()).orderByDesc(Message::getCreatedAt)
                ).getRecords()""")

content = content.replace("messageRepository.deleteBySessionId(session.getId());", "messageRepository.delete(new LambdaQueryWrapper<Message>().eq(Message::getSessionId, session.getId()));")
content = content.replace("sessionRepository.delete(session);", "sessionRepository.deleteById(session.getId());")

content = content.replace("message.setSession(session);", "message.setSessionId(session.getId());")
content = content.replace("messageRepository.save(message)", "saveMessage(message)")

# Add saveSession and saveMessage helpers
helpers = """
    private ConversationSession saveSession(ConversationSession session) {
        if (session.getId() == null) {
            session.onCreate();
            sessionRepository.insert(session);
        } else {
            session.onUpdate();
            sessionRepository.updateById(session);
        }
        return session;
    }

    private Message saveMessage(Message message) {
        if (message.getId() == null) {
            message.onCreate();
            messageRepository.insert(message);
        } else {
            messageRepository.updateById(message);
        }
        return message;
    }
"""
content = re.sub(r'}\s*$', helpers + '\n}', content)

with open("backend/src/main/java/com/agent/mvp/session/service/SessionService.java", "w") as f:
    f.write(content)
print("SessionService Fixed")
