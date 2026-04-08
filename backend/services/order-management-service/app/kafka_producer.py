import json
import logging

from confluent_kafka import Producer

from app.config import settings

logger = logging.getLogger(__name__)

_producer: Producer | None = None


def _is_msk_serverless(brokers: str) -> bool:
    return "amazonaws.com" in brokers


def _oauth_cb(config_str):
    """
    Called by librdkafka when OAUTHBEARER token needs refresh.
    Must return (token, expiry_time_in_seconds_since_epoch).
    """
    from aws_msk_iam_sasl_signer import MSKAuthTokenProvider
    logger.info("OAUTHBEARER token refresh requested")
    token, expiry_ms = MSKAuthTokenProvider.generate_auth_token(settings.AWS_REGION)
    logger.info("OAUTHBEARER token generated, expiry_ms=%s", expiry_ms)
    # confluent-kafka expects expiry as seconds since epoch
    return token, expiry_ms / 1000


def _build_producer() -> Producer:
    conf = {
        "bootstrap.servers": settings.KAFKA_BROKERS,
        "client.id": "order-management-service",
        "message.timeout.ms": "30000",
    }

    if _is_msk_serverless(settings.KAFKA_BROKERS):
        conf.update({
            "security.protocol": "SASL_SSL",
            "sasl.mechanism": "OAUTHBEARER",
            "allow.auto.create.topics": "true",
        })

    return Producer(conf, oauth_cb=_oauth_cb if _is_msk_serverless(settings.KAFKA_BROKERS) else None)


def get_producer() -> Producer | None:
    global _producer
    if _producer is None:
        try:
            _producer = _build_producer()
            logger.info("Kafka producer connected")
        except Exception as e:
            logger.error("Kafka producer failed to start: %s", e)
    return _producer


def _delivery_report(err, msg):
    if err:
        logger.error("Kafka delivery failed: %s", err)
    else:
        logger.info("Published to %s [%d]", msg.topic(), msg.partition())


def publish(event: dict):
    import time
    producer = get_producer()
    if producer is None:
        logger.error("Cannot publish event — no Kafka producer: %s", event)
        return
    topic = settings.KAFKA_TOPIC_ORDERS
    for attempt in range(5):
        try:
            producer.produce(
                topic,
                value=json.dumps(event).encode("utf-8"),
                callback=_delivery_report,
            )
            producer.flush(timeout=10)
            logger.info("Published event: %s to topic: %s", event.get("event_type"), topic)
            return
        except Exception as e:
            logger.warning("Produce attempt %d failed: %s — retrying in 5s", attempt + 1, e)
            time.sleep(5)
            producer.poll(0)  # trigger metadata refresh
    logger.error("Failed to publish event after retries: %s", event)


def close():
    global _producer
    if _producer:
        _producer.flush()
        _producer = None
        logger.info("Kafka producer closed")
