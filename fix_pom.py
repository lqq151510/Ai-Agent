import re
with open('backend/pom.xml', 'r') as f:
    content = f.read()

# 1. Update langchain4j version
content = content.replace('<version>0.33.0</version>', '<version>0.36.2</version>')

# 2. Add lombok
lombok = """
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <version>1.18.36</version>
            <scope>provided</scope>
        </dependency>
"""
if 'lombok' not in content:
    content = content.replace('<dependencies>', '<dependencies>' + lombok, 1)

# 3. Replace JPA with MyBatis-Plus
jpa = """        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>"""

mp = """        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>3.5.7</version>
        </dependency>"""

content = content.replace(jpa, mp)

with open('backend/pom.xml', 'w') as f:
    f.write(content)
