# syntax=docker/dockerfile:1.10
FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /build

COPY pom.xml ./
COPY backend/pom.xml backend/pom.xml
COPY backend/src backend/src
COPY bug-sentinel-starter/pom.xml bug-sentinel-starter/pom.xml
COPY bug-sentinel-starter/src bug-sentinel-starter/src
COPY .mvn .mvn

RUN --mount=type=secret,id=maven_settings,target=/run/secrets/maven_settings,required=true \
    --mount=type=secret,id=github_actor,env=GITHUB_ACTOR,required=true \
    --mount=type=secret,id=github_token,env=GITHUB_TOKEN,required=true \
    test -n "${GITHUB_ACTOR}" && test -n "${GITHUB_TOKEN}" && \
    mvn --settings /run/secrets/maven_settings -q -DskipTests -pl backend -am package

FROM eclipse-temurin:21-jre
WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin appuser
COPY --from=build /build/target/backend-*.jar /app/app.jar

USER appuser
EXPOSE 8080

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-jar", "/app/app.jar"]
