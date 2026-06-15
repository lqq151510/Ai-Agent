from pydantic import BaseModel
from typing import List

class EvalTask(BaseModel):
    id: str
    title: str
    description: str
    original_code: str
    language: str

def get_eval_tasks() -> List[EvalTask]:
    return [
        EvalTask(
            id="refactor_001",
            title="Extract Method",
            description="重构以下冗长的代码，将独立逻辑提取为私有方法。",
            original_code='''public void processOrder(Order order) {
    // validate order
    if (order == null || order.getItems().isEmpty()) {
        throw new IllegalArgumentException("Invalid order");
    }
    // calculate total
    double total = 0;
    for (Item item : order.getItems()) {
        total += item.getPrice() * item.getQuantity();
    }
    // apply discount
    if (total > 100) {
        total = total * 0.9;
    }
    // save order
    order.setTotal(total);
    orderRepository.save(order);
}''',
            language="java"
        ),
        EvalTask(
            id="refactor_002",
            title="Remove Magic Numbers",
            description="消除代码中的魔术数字，使用有意义的常量代替。",
            original_code='''def calculate_salary(role_code, base_salary):
    if role_code == 1:
        return base_salary * 1.5 + 500
    elif role_code == 2:
        return base_salary * 1.2 + 200
    else:
        return base_salary''',
            language="python"
        ),
        EvalTask(
            id="refactor_003",
            title="Simplify Nested Ifs (Guard Clauses)",
            description="使用卫语句（Guard Clauses）简化深度嵌套的条件判断。",
            original_code='''public void updateProfile(User user) {
    if (user != null) {
        if (user.isActive()) {
            if (user.getProfile() != null) {
                user.getProfile().setUpdated(new Date());
                profileDao.save(user.getProfile());
            } else {
                throw new Exception("Profile is null");
            }
        } else {
            throw new Exception("User is inactive");
        }
    } else {
        throw new Exception("User is null");
    }
}''',
            language="java"
        ),
        EvalTask(
            id="refactor_004",
            title="Use List Comprehension",
            description="将繁琐的for循环追加列表的代码，重构为列表推导式 (List Comprehension)。",
            original_code='''def get_even_squares(numbers):
    result = []
    for n in numbers:
        if n % 2 == 0:
            result.append(n * n)
    return result''',
            language="python"
        ),
        EvalTask(
            id="refactor_005",
            title="Replace Switch with Polymorphism / Strategy",
            description="消除臃肿的 switch-case，建议使用多态或策略模式进行结构重构（给出设计即可）。",
            original_code='''public double calculateShippingCode(String method, double weight) {
    switch (method) {
        case "STANDARD":
            return weight * 1.5;
        case "EXPRESS":
            return weight * 3.0 + 10;
        case "SAME_DAY":
            return weight * 5.0 + 20;
        default:
            throw new IllegalArgumentException("Unknown method");
    }
}''',
            language="java"
        ),
        EvalTask(
            id="refactor_006",
            title="Optimize String Concatenation",
            description="优化循环中的字符串拼接方式，提高性能和可读性。",
            original_code='''public String buildReport(List<String> lines) {
    String report = "";
    for (String line : lines) {
        report += line + "\\n";
    }
    return report;
}''',
            language="java"
        ),
        EvalTask(
            id="refactor_007",
            title="Refactor God Class (Partial)",
            description="指出该类违反了单一职责原则，并给出将日志处理与业务逻辑分离的重构代码。",
            original_code='''class UserService:
    def __init__(self, db, logger):
        self.db = db
        self.logger = logger
        
    def create_user(self, user_data):
        self.logger.write_log(f"Creating user {user_data['name']}")
        self.db.insert("users", user_data)
        self.logger.write_log("User created successfully")
        
    def send_welcome_email(self, user_email):
        # connects to SMTP and sends email
        self.logger.write_log(f"Sending email to {user_email}")
        smtp_client.send(user_email, "Welcome!")''',
            language="python"
        ),
        EvalTask(
            id="refactor_008",
            title="Null Object Pattern",
            description="重构代码以减少显式的 null 检查。",
            original_code='''public void playVideo(VideoPlayer player) {
    if (player != null) {
        player.play();
    }
}''',
            language="java"
        ),
        EvalTask(
            id="refactor_009",
            title="Use map/filter/reduce (Stream API)",
            description="使用 Java Stream API 重写该集合处理逻辑，使其更函数式和简洁。",
            original_code='''public List<String> getActiveUserNames(List<User> users) {
    List<String> names = new ArrayList<>();
    for (User u : users) {
        if (u.isActive() && u.getAge() >= 18) {
            names.add(u.getName().toUpperCase());
        }
    }
    return names;
}''',
            language="java"
        ),
        EvalTask(
            id="refactor_010",
            title="Dictionary Get with Default",
            description="优化字典键值获取方式，避免 KeyError 异常以及复杂的 if-else 检查。",
            original_code='''def get_user_status(user_data):
    if "status" in user_data:
        return user_data["status"]
    else:
        return "UNKNOWN"''',
            language="python"
        )
    ]
