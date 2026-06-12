import re

# 1. Message.java
with open('backend/src/main/java/com/agent/mvp/session/entity/Message.java', 'r') as f:
    msg = f.read()
msg = re.sub(r'@ManyToOne[^;]+\n\s*@JoinColumn[^;]+\n\s*private ConversationSession session;', '@TableField("session_id")\n    private UUID sessionId;', msg)
msg = re.sub(r'import jakarta.persistence.[^;]+;\n', '', msg)
with open('backend/src/main/java/com/agent/mvp/session/entity/Message.java', 'w') as f:
    f.write(msg)

# 2. ConversationSession.java
with open('backend/src/main/java/com/agent/mvp/session/entity/ConversationSession.java', 'r') as f:
    sess = f.read()
sess = re.sub(r'@ManyToOne[^;]+\n\s*@JoinColumn[^;]+\n\s*private User user;', '@TableField("user_id")\n    private UUID userId;', sess)
sess = re.sub(r'@Enumerated[^;]+\n\s*', '', sess)
sess = re.sub(r'@jakarta\.persistence\.Version', '@com.baomidou.mybatisplus.annotation.Version', sess)
sess = re.sub(r'@PreUpdate', '', sess)
with open('backend/src/main/java/com/agent/mvp/session/entity/ConversationSession.java', 'w') as f:
    f.write(sess)

# 3. DevCoachRun.java
with open('backend/src/main/java/com/agent/mvp/coach/entity/DevCoachRun.java', 'r') as f:
    coach = f.read()
coach = re.sub(r'@ManyToOne[^;]+\n\s*@JoinColumn[^;]+\n\s*private User user;', '@TableField("user_id")\n    private UUID userId;', coach)
coach = re.sub(r'@Enumerated[^;]+\n\s*', '', coach)
with open('backend/src/main/java/com/agent/mvp/coach/entity/DevCoachRun.java', 'w') as f:
    f.write(coach)
