FROM maven:3.9.8-eclipse-temurin-21 AS build
WORKDIR /build

COPY pom.xml ./
COPY src ./src

RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin appuser
COPY --from=build /build/target/backend-*.jar /app/app.jar

USER appuser
EXPOSE 8080

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-jar", "/app/app.jar"]
