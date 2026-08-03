# Kubernetes Deployment

The manifests expect an externally managed Secret named `app-secrets`. Create it before
deploying, replacing every placeholder locally:

```bash
kubectl create secret generic app-secrets \
  --from-literal=POSTGRES_PASSWORD='<replace-with-postgres-password>' \
  --from-literal=JWT_SECRET='<replace-with-at-least-32-random-characters>' \
  --from-literal=SECURITY_DB_ENCRYPTION_KEY='<replace-with-at-least-32-random-characters>' \
  --from-literal=OPENAI_API_KEY='<replace-with-provider-key>'
```

Optional Sentinel keys are `BUG_SENTINEL_TOKEN` and `BUG_SENTINEL_OWNER_USER_ID`.
The starter webhook client and this backend receiver use the same `BUG_SENTINEL_TOKEN` secret.
`SECURITY_DB_LEGACY_ENCRYPTION_KEY` is optional and is used only during key rotation.
The backend deployment uses `/actuator/health/liveness` for liveness and
`/api/v1/system/health/ready` for readiness. The default deployment has no Prometheus scrape
annotations. `servicemonitor.yaml` is opt-in: before applying it, configure authentication and
network protection for `/actuator/prometheus` in the Prometheus Operator.

Kafka is not deployed by the default manifests. Kafka topic creation is enabled only with the
Spring `mq` profile and requires separate Kafka infrastructure plus
`SPRING_PROFILES_ACTIVE=mq` and `SPRING_KAFKA_BOOTSTRAP_SERVERS`.
