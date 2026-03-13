use async_trait::async_trait;
use codex_pool_core::events::RequestLogEvent;

pub mod http_sink;
pub mod redis_sink;

#[async_trait]
pub trait EventSink: Send + Sync {
    async fn emit_request_log(&self, event: RequestLogEvent);
}

#[derive(Default)]
pub struct NoopEventSink;

#[async_trait]
impl EventSink for NoopEventSink {
    async fn emit_request_log(&self, _event: RequestLogEvent) {}
}
