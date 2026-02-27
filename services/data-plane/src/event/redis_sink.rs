use async_trait::async_trait;
use codex_pool_core::events::RequestLogEvent;
use tracing::warn;

use super::EventSink;

pub struct RedisStreamEventSink {
    redis_url: String,
    stream: String,
}

impl RedisStreamEventSink {
    pub fn new(redis_url: impl Into<String>, stream: impl Into<String>) -> Self {
        Self {
            redis_url: redis_url.into(),
            stream: stream.into(),
        }
    }

    pub fn serialize_for_test(&self, event: &RequestLogEvent) -> anyhow::Result<String> {
        Ok(serde_json::to_string(event)?)
    }

    async fn publish_json(&self, event: &RequestLogEvent) -> anyhow::Result<()> {
        let payload = self.serialize_for_test(event)?;
        let client = redis::Client::open(self.redis_url.as_str())?;
        let mut conn = client.get_multiplexed_async_connection().await?;

        let _: String = redis::cmd("XADD")
            .arg(&self.stream)
            .arg("*")
            .arg("event")
            .arg(payload)
            .query_async(&mut conn)
            .await?;

        Ok(())
    }
}

#[async_trait]
impl EventSink for RedisStreamEventSink {
    async fn emit_request_log(&self, event: RequestLogEvent) {
        if let Err(error) = self.publish_json(&event).await {
            warn!(stream = %self.stream, error = %error, "failed to publish request log event");
        }
    }
}
