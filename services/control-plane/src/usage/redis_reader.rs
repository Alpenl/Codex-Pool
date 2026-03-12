use std::time::Duration;

use anyhow::{Context, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use codex_pool_core::events::RequestLogEvent;
use redis::aio::MultiplexedConnection;
use redis::streams::{
    StreamAutoClaimOptions, StreamAutoClaimReply, StreamId, StreamInfoGroupsReply,
    StreamReadOptions, StreamReadReply,
};
use redis::AsyncCommands;
use serde::Deserialize;
use tracing::warn;
use uuid::Uuid;

use crate::usage::worker::{
    ConsumerGroupBacklog, RequestLogStreamReader, StreamMessage, StreamReadResult,
};

#[derive(Clone)]
pub struct RedisStreamReader {
    client: redis::Client,
    stream: String,
    consumer_group: String,
    consumer_name: String,
    dead_letter_stream: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct EventIdentityFields {
    #[serde(default)]
    tenant_id: Option<Uuid>,
    #[serde(default)]
    api_key_id: Option<Uuid>,
}

#[derive(Default)]
struct ParsedMessages {
    messages: Vec<StreamMessage>,
    malformed_entries: Vec<MalformedStreamEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct MalformedStreamEntry {
    message_id: String,
    reason: String,
    raw_event: Option<String>,
    reason_code: MalformedReasonCode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MalformedReasonCode {
    MissingEvent,
    InvalidJson,
    Other,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct MalformedReasonCounts {
    malformed_missing_event_count: u64,
    malformed_invalid_json_count: u64,
    malformed_other_count: u64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct DeadLetterRelayCounts {
    dead_letter_relay_attempt_count: u64,
    dead_letter_relay_skipped_count: u64,
    dead_letter_relay_success_count: u64,
    dead_letter_relay_failed_count: u64,
}

impl DeadLetterRelayCounts {
    fn record_outcome<T, E>(&mut self, result: &std::result::Result<T, E>) {
        if result.is_ok() {
            self.dead_letter_relay_success_count =
                self.dead_letter_relay_success_count.saturating_add(1);
        } else {
            self.dead_letter_relay_failed_count =
                self.dead_letter_relay_failed_count.saturating_add(1);
        }
    }

    fn for_configured_stream_entries(entry_count: usize) -> Self {
        Self {
            dead_letter_relay_attempt_count: u64::try_from(entry_count).unwrap_or(u64::MAX),
            ..Self::default()
        }
    }

    fn for_unconfigured_stream(entry_count: usize) -> Self {
        Self {
            dead_letter_relay_skipped_count: u64::try_from(entry_count).unwrap_or(u64::MAX),
            ..Self::default()
        }
    }

    fn for_connection_failure(entry_count: usize) -> Self {
        let attempt_count = u64::try_from(entry_count).unwrap_or(u64::MAX);
        Self {
            dead_letter_relay_attempt_count: attempt_count,
            dead_letter_relay_skipped_count: 0,
            dead_letter_relay_success_count: 0,
            dead_letter_relay_failed_count: attempt_count,
        }
    }
}

impl MalformedReasonCode {
    fn as_str(self) -> &'static str {
        match self {
            Self::MissingEvent => "missing_event",
            Self::InvalidJson => "invalid_json",
            Self::Other => "other",
        }
    }
}

impl ParsedMessages {
    fn invalid_message_ids(&self) -> Vec<String> {
        self.malformed_entries
            .iter()
            .map(|entry| entry.message_id.clone())
            .collect()
    }
}

impl RedisStreamReader {
    pub fn new(
        redis_url: &str,
        stream: impl Into<String>,
        consumer_group: impl Into<String>,
        consumer_name: impl Into<String>,
    ) -> Result<Self> {
        let client = redis::Client::open(redis_url)
            .context("failed to create redis client for usage worker")?;

        Ok(Self {
            client,
            stream: stream.into(),
            consumer_group: consumer_group.into(),
            consumer_name: consumer_name.into(),
            dead_letter_stream: None,
        })
    }

    pub fn with_dead_letter_stream(mut self, dead_letter_stream: Option<String>) -> Self {
        self.dead_letter_stream = dead_letter_stream.and_then(|stream| {
            let trimmed = stream.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        self
    }

    async fn connection(&self) -> Result<MultiplexedConnection> {
        self.client
            .get_multiplexed_async_connection()
            .await
            .context("failed to connect to redis")
    }

    async fn parse_messages_and_ack_invalid(
        &self,
        entries: Vec<StreamId>,
    ) -> Result<StreamReadResult> {
        let parsed = Self::parse_messages(entries);
        let malformed_acked_count = parsed.malformed_entries.len() as u64;
        let malformed_reason_counts = Self::malformed_reason_counts(&parsed.malformed_entries);
        let malformed_raw_event_bytes_total =
            Self::malformed_raw_event_bytes_total(&parsed.malformed_entries);
        let mut dead_letter_relay_counts = DeadLetterRelayCounts::default();

        if malformed_acked_count > 0 {
            dead_letter_relay_counts = self
                .relay_malformed_to_dead_letter(&parsed.malformed_entries)
                .await;
            let invalid_message_ids = parsed.invalid_message_ids();
            self.ack(&invalid_message_ids)
                .await
                .context("failed to ack malformed redis stream entries")?;
        }

        Ok(StreamReadResult {
            messages: parsed.messages,
            malformed_acked_count,
            malformed_missing_event_count: malformed_reason_counts.malformed_missing_event_count,
            malformed_invalid_json_count: malformed_reason_counts.malformed_invalid_json_count,
            malformed_other_count: malformed_reason_counts.malformed_other_count,
            malformed_raw_event_bytes_total,
            dead_letter_relay_attempt_count: dead_letter_relay_counts
                .dead_letter_relay_attempt_count,
            dead_letter_relay_skipped_count: dead_letter_relay_counts
                .dead_letter_relay_skipped_count,
            dead_letter_relay_success_count: dead_letter_relay_counts
                .dead_letter_relay_success_count,
            dead_letter_relay_failed_count: dead_letter_relay_counts.dead_letter_relay_failed_count,
        })
    }

    fn parse_messages(entries: Vec<StreamId>) -> ParsedMessages {
        let mut parsed = ParsedMessages::default();

        for entry in entries {
            let message_id = entry.id.clone();
            let raw_event = entry.get::<String>("event");
            match Self::parse_message(entry) {
                Ok(message) => parsed.messages.push(message),
                Err(err) => {
                    let reason = err.to_string();
                    let reason_code = Self::classify_malformed_reason(raw_event.as_deref(), &err);
                    warn!(
                        message_id = %message_id,
                        error = %reason,
                        "skip malformed redis stream entry"
                    );
                    parsed.malformed_entries.push(MalformedStreamEntry {
                        message_id,
                        reason,
                        raw_event,
                        reason_code,
                    });
                }
            }
        }

        parsed
    }

    fn parse_message(entry: StreamId) -> Result<StreamMessage> {
        let message_id = entry.id.clone();
        let payload = entry
            .get::<String>("event")
            .with_context(|| format!("stream entry {} missing event payload", message_id))?;

        let event: RequestLogEvent = serde_json::from_str(&payload)
            .with_context(|| format!("failed to deserialize stream entry {}", message_id))?;

        let identity_fields =
            serde_json::from_str::<EventIdentityFields>(&payload).unwrap_or_default();

        Ok(StreamMessage {
            message_id,
            event,
            tenant_id: identity_fields.tenant_id,
            api_key_id: identity_fields.api_key_id,
        })
    }

    fn classify_malformed_reason(
        raw_event: Option<&str>,
        error: &anyhow::Error,
    ) -> MalformedReasonCode {
        if raw_event.is_none() {
            return MalformedReasonCode::MissingEvent;
        }

        if error
            .chain()
            .any(|cause| cause.downcast_ref::<serde_json::Error>().is_some())
        {
            return MalformedReasonCode::InvalidJson;
        }

        MalformedReasonCode::Other
    }

    fn malformed_reason_counts(
        malformed_entries: &[MalformedStreamEntry],
    ) -> MalformedReasonCounts {
        let mut counts = MalformedReasonCounts::default();

        for malformed_entry in malformed_entries {
            match malformed_entry.reason_code {
                MalformedReasonCode::MissingEvent => {
                    counts.malformed_missing_event_count =
                        counts.malformed_missing_event_count.saturating_add(1);
                }
                MalformedReasonCode::InvalidJson => {
                    counts.malformed_invalid_json_count =
                        counts.malformed_invalid_json_count.saturating_add(1);
                }
                MalformedReasonCode::Other => {
                    counts.malformed_other_count = counts.malformed_other_count.saturating_add(1);
                }
            }
        }

        counts
    }

    fn malformed_raw_event_bytes_total(malformed_entries: &[MalformedStreamEntry]) -> u64 {
        malformed_entries
            .iter()
            .fold(0_u64, |total, malformed_entry| {
                let Some(raw_event) = malformed_entry.raw_event.as_ref() else {
                    return total;
                };

                total.saturating_add(u64::try_from(raw_event.len()).unwrap_or(u64::MAX))
            })
    }

    async fn relay_malformed_to_dead_letter(
        &self,
        malformed_entries: &[MalformedStreamEntry],
    ) -> DeadLetterRelayCounts {
        let Some(dead_letter_stream) = self.dead_letter_stream.as_deref() else {
            return DeadLetterRelayCounts::for_unconfigured_stream(malformed_entries.len());
        };

        let mut conn = match self.connection().await {
            Ok(conn) => conn,
            Err(error) => {
                warn!(
                    dead_letter_stream = %dead_letter_stream,
                    error = %error,
                    "failed to connect redis for malformed dead-letter relay"
                );
                return DeadLetterRelayCounts::for_connection_failure(malformed_entries.len());
            }
        };

        let mut relay_counts =
            DeadLetterRelayCounts::for_configured_stream_entries(malformed_entries.len());
        for malformed_entry in malformed_entries {
            let fields = self.dead_letter_fields(malformed_entry, Utc::now());
            let mut command = redis::cmd("XADD");
            command.arg(dead_letter_stream).arg("*");
            for (key, value) in fields {
                command.arg(key).arg(value);
            }

            let result: redis::RedisResult<String> = command.query_async(&mut conn).await;
            relay_counts.record_outcome(&result);
            if let Err(error) = result {
                warn!(
                    dead_letter_stream = %dead_letter_stream,
                    message_id = %malformed_entry.message_id,
                    error = %error,
                    "failed to relay malformed redis stream entry to dead-letter stream"
                );
            }
        }

        relay_counts
    }

    fn dead_letter_fields(
        &self,
        malformed_entry: &MalformedStreamEntry,
        observed_at: DateTime<Utc>,
    ) -> Vec<(String, String)> {
        let mut fields = vec![
            ("message_id".to_string(), malformed_entry.message_id.clone()),
            ("reason".to_string(), malformed_entry.reason.clone()),
            (
                "reason_code".to_string(),
                malformed_entry.reason_code.as_str().to_string(),
            ),
            ("source_stream".to_string(), self.stream.clone()),
            ("consumer_group".to_string(), self.consumer_group.clone()),
            ("consumer_name".to_string(), self.consumer_name.clone()),
            ("observed_at".to_string(), observed_at.to_rfc3339()),
        ];

        if let Some(raw_event) = &malformed_entry.raw_event {
            fields.push(("raw_event".to_string(), raw_event.clone()));
        } else {
            fields.push(("raw_event_missing".to_string(), "true".to_string()));
        }

        fields
    }

    fn consumer_group_backlog_from_info(
        info: &StreamInfoGroupsReply,
        consumer_group: &str,
    ) -> ConsumerGroupBacklog {
        let Some(group) = info
            .groups
            .iter()
            .find(|group| group.name == consumer_group)
        else {
            return ConsumerGroupBacklog::default();
        };

        ConsumerGroupBacklog {
            pending_count: u64::try_from(group.pending).unwrap_or(u64::MAX),
            lag_count: group.lag.and_then(|lag| u64::try_from(lag).ok()),
        }
    }
}

#[async_trait]
impl RequestLogStreamReader for RedisStreamReader {
    async fn ensure_consumer_group(&self) -> Result<()> {
        let mut conn = self.connection().await?;
        let created: redis::RedisResult<String> = conn
            .xgroup_create_mkstream(&self.stream, &self.consumer_group, "$")
            .await;

        match created {
            Ok(_) => Ok(()),
            Err(err) if err.to_string().contains("BUSYGROUP") => Ok(()),
            Err(err) => Err(err).context("failed to ensure redis stream consumer group"),
        }
    }

    async fn reclaim_pending(&self, count: usize, min_idle: Duration) -> Result<StreamReadResult> {
        let mut conn = self.connection().await?;
        let options = StreamAutoClaimOptions::default().count(count);

        let reply: StreamAutoClaimReply = conn
            .xautoclaim_options(
                &self.stream,
                &self.consumer_group,
                &self.consumer_name,
                duration_to_millis(min_idle),
                "0-0",
                options,
            )
            .await
            .context("failed to reclaim pending redis stream entries")?;

        self.parse_messages_and_ack_invalid(reply.claimed).await
    }

    async fn read_group(&self, count: usize, block: Duration) -> Result<StreamReadResult> {
        let mut conn = self.connection().await?;
        let options = StreamReadOptions::default()
            .group(&self.consumer_group, &self.consumer_name)
            .count(count)
            .block(duration_to_millis(block));

        let reply: StreamReadReply = conn
            .xread_options(&[self.stream.as_str()], &[">"], &options)
            .await
            .context("failed to read redis stream entries for consumer group")?;

        let mut result = StreamReadResult::default();
        for key in reply.keys {
            let mut parsed = self.parse_messages_and_ack_invalid(key.ids).await?;
            result.malformed_acked_count = result
                .malformed_acked_count
                .saturating_add(parsed.malformed_acked_count);
            result.malformed_missing_event_count = result
                .malformed_missing_event_count
                .saturating_add(parsed.malformed_missing_event_count);
            result.malformed_invalid_json_count = result
                .malformed_invalid_json_count
                .saturating_add(parsed.malformed_invalid_json_count);
            result.malformed_other_count = result
                .malformed_other_count
                .saturating_add(parsed.malformed_other_count);
            result.malformed_raw_event_bytes_total = result
                .malformed_raw_event_bytes_total
                .saturating_add(parsed.malformed_raw_event_bytes_total);
            result.dead_letter_relay_attempt_count = result
                .dead_letter_relay_attempt_count
                .saturating_add(parsed.dead_letter_relay_attempt_count);
            result.dead_letter_relay_skipped_count = result
                .dead_letter_relay_skipped_count
                .saturating_add(parsed.dead_letter_relay_skipped_count);
            result.dead_letter_relay_success_count = result
                .dead_letter_relay_success_count
                .saturating_add(parsed.dead_letter_relay_success_count);
            result.dead_letter_relay_failed_count = result
                .dead_letter_relay_failed_count
                .saturating_add(parsed.dead_letter_relay_failed_count);
            result.messages.append(&mut parsed.messages);
        }

        Ok(result)
    }

    async fn ack(&self, message_ids: &[String]) -> Result<()> {
        if message_ids.is_empty() {
            return Ok(());
        }

        let mut conn = self.connection().await?;
        let _: usize = conn
            .xack(&self.stream, &self.consumer_group, message_ids)
            .await
            .context("failed to ack redis stream entries")?;

        Ok(())
    }

    async fn consumer_group_backlog(&self) -> Result<ConsumerGroupBacklog> {
        let mut conn = self.connection().await?;
        let groups: StreamInfoGroupsReply = conn
            .xinfo_groups(&self.stream)
            .await
            .context("failed to inspect redis stream consumer group backlog")?;

        Ok(Self::consumer_group_backlog_from_info(
            &groups,
            &self.consumer_group,
        ))
    }
}

fn duration_to_millis(duration: Duration) -> usize {
    let millis = duration.as_millis();
    millis.min(usize::MAX as u128) as usize
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use chrono::{TimeZone, Utc};
    use redis::Value;

    use super::*;

    fn sample_event_json() -> String {
        serde_json::to_string(&RequestLogEvent {
            id: Uuid::new_v4(),
            account_id: Uuid::new_v4(),
            tenant_id: Some(Uuid::new_v4()),
            api_key_id: Some(Uuid::new_v4()),
            event_version: 2,
            path: "/v1/responses".to_string(),
            method: "POST".to_string(),
            status_code: 200,
            latency_ms: 24,
            is_stream: false,
            error_code: None,
            request_id: Some("req-redis-reader".to_string()),
            model: Some("gpt-5.3-codex".to_string()),
            service_tier: Some("default".to_string()),
            input_tokens: None,
            cached_input_tokens: None,
            output_tokens: None,
            reasoning_tokens: None,
            first_token_latency_ms: None,
            billing_phase: None,
            authorization_id: None,
            capture_status: None,
            created_at: Utc::now(),
        })
        .unwrap()
    }

    fn stream_entry_with_payload(message_id: &str, payload: Option<&str>) -> StreamId {
        let mut map = HashMap::new();
        if let Some(payload) = payload {
            map.insert(
                "event".to_string(),
                Value::BulkString(payload.as_bytes().to_vec()),
            );
        }

        StreamId {
            id: message_id.to_string(),
            map,
            milliseconds_elapsed_from_delivery: None,
            delivered_count: None,
        }
    }

    #[test]
    fn parse_messages_skips_entries_without_event_field() {
        let entries = vec![stream_entry_with_payload("1708260000000-1", None)];

        let parsed = RedisStreamReader::parse_messages(entries);

        assert!(parsed.messages.is_empty());
        assert_eq!(parsed.invalid_message_ids(), vec!["1708260000000-1"]);
        assert_eq!(parsed.malformed_entries[0].raw_event, None);
        assert_eq!(
            parsed.malformed_entries[0].reason_code,
            MalformedReasonCode::MissingEvent
        );
    }

    #[test]
    fn parse_messages_skips_entries_with_invalid_json() {
        let entries = vec![stream_entry_with_payload(
            "1708260000000-2",
            Some("{not-json}"),
        )];

        let parsed = RedisStreamReader::parse_messages(entries);

        assert!(parsed.messages.is_empty());
        assert_eq!(parsed.invalid_message_ids(), vec!["1708260000000-2"]);
        assert_eq!(
            parsed.malformed_entries[0].raw_event.as_deref(),
            Some("{not-json}")
        );
        assert_eq!(
            parsed.malformed_entries[0].reason_code,
            MalformedReasonCode::InvalidJson
        );
    }

    #[test]
    fn parse_messages_keeps_valid_entries_when_mixed_with_invalid_entries() {
        let valid_payload = sample_event_json();
        let entries = vec![
            stream_entry_with_payload("1708260000000-3", Some(&valid_payload)),
            stream_entry_with_payload("1708260000000-4", Some("{not-json}")),
            stream_entry_with_payload("1708260000000-5", None),
        ];

        let parsed = RedisStreamReader::parse_messages(entries);

        assert_eq!(parsed.messages.len(), 1);
        assert_eq!(parsed.messages[0].message_id, "1708260000000-3");
        assert_eq!(
            parsed.invalid_message_ids(),
            vec!["1708260000000-4", "1708260000000-5"]
        );
        assert_eq!(
            parsed
                .malformed_entries
                .iter()
                .map(|entry| entry.reason_code)
                .collect::<Vec<_>>(),
            vec![
                MalformedReasonCode::InvalidJson,
                MalformedReasonCode::MissingEvent
            ]
        );
    }

    #[test]
    fn parse_messages_outputs_malformed_reason_breakdown() {
        let valid_payload = sample_event_json();
        let entries = vec![
            stream_entry_with_payload("1708260000000-30", Some(&valid_payload)),
            stream_entry_with_payload("1708260000000-31", Some("{not-json}")),
            stream_entry_with_payload("1708260000000-32", None),
            stream_entry_with_payload("1708260000000-33", Some("{still-not-json}")),
        ];

        let mut parsed = RedisStreamReader::parse_messages(entries);
        parsed.malformed_entries.push(MalformedStreamEntry {
            message_id: "1708260000000-34".to_string(),
            reason: "other malformed reason".to_string(),
            raw_event: Some("{}".to_string()),
            reason_code: MalformedReasonCode::Other,
        });

        let breakdown = RedisStreamReader::malformed_reason_counts(&parsed.malformed_entries);

        assert_eq!(parsed.malformed_entries.len(), 4);
        assert_eq!(breakdown.malformed_missing_event_count, 1);
        assert_eq!(breakdown.malformed_invalid_json_count, 2);
        assert_eq!(breakdown.malformed_other_count, 1);
    }

    #[test]
    fn malformed_raw_event_bytes_total_sums_utf8_bytes_and_skips_missing_payloads() {
        let malformed_entries = vec![
            MalformedStreamEntry {
                message_id: "1708260000000-35".to_string(),
                reason: "invalid json".to_string(),
                raw_event: Some("{bad}".to_string()),
                reason_code: MalformedReasonCode::InvalidJson,
            },
            MalformedStreamEntry {
                message_id: "1708260000000-36".to_string(),
                reason: "missing event payload".to_string(),
                raw_event: None,
                reason_code: MalformedReasonCode::MissingEvent,
            },
            MalformedStreamEntry {
                message_id: "1708260000000-37".to_string(),
                reason: "other reason".to_string(),
                raw_event: Some("\u{00E9}".to_string()),
                reason_code: MalformedReasonCode::Other,
            },
        ];

        let total = RedisStreamReader::malformed_raw_event_bytes_total(&malformed_entries);

        assert_eq!(total, 7);
    }

    #[test]
    fn dead_letter_fields_include_raw_event_payload() {
        let reader = RedisStreamReader::new(
            "redis://127.0.0.1:6379",
            "stream.request_log",
            "usage-worker",
            "usage-worker-test",
        )
        .unwrap();
        let malformed = MalformedStreamEntry {
            message_id: "1708260000000-6".to_string(),
            reason: "invalid json".to_string(),
            raw_event: Some("{not-json}".to_string()),
            reason_code: MalformedReasonCode::InvalidJson,
        };
        let observed_at = Utc.with_ymd_and_hms(2026, 2, 19, 12, 34, 56).unwrap();

        let fields = reader.dead_letter_fields(&malformed, observed_at);
        let fields = fields.into_iter().collect::<HashMap<_, _>>();

        assert_eq!(
            fields.get("message_id"),
            Some(&"1708260000000-6".to_string())
        );
        assert_eq!(fields.get("reason"), Some(&"invalid json".to_string()));
        assert_eq!(fields.get("raw_event"), Some(&"{not-json}".to_string()));
        assert_eq!(
            fields.get("source_stream"),
            Some(&"stream.request_log".to_string())
        );
        assert_eq!(
            fields.get("consumer_group"),
            Some(&"usage-worker".to_string())
        );
        assert_eq!(
            fields.get("consumer_name"),
            Some(&"usage-worker-test".to_string())
        );
        assert_eq!(fields.get("reason_code"), Some(&"invalid_json".to_string()));
        assert_eq!(
            fields.get("observed_at"),
            Some(&"2026-02-19T12:34:56+00:00".to_string())
        );
        assert!(!fields.contains_key("raw_event_missing"));
    }

    #[test]
    fn dead_letter_fields_include_missing_marker_when_payload_absent() {
        let reader = RedisStreamReader::new(
            "redis://127.0.0.1:6379",
            "stream.request_log",
            "usage-worker",
            "usage-worker-test",
        )
        .unwrap();
        let malformed = MalformedStreamEntry {
            message_id: "1708260000000-7".to_string(),
            reason: "missing event payload".to_string(),
            raw_event: None,
            reason_code: MalformedReasonCode::MissingEvent,
        };
        let observed_at = Utc.with_ymd_and_hms(2026, 2, 19, 12, 34, 57).unwrap();

        let fields = reader.dead_letter_fields(&malformed, observed_at);
        let fields = fields.into_iter().collect::<HashMap<_, _>>();

        assert_eq!(
            fields.get("message_id"),
            Some(&"1708260000000-7".to_string())
        );
        assert_eq!(
            fields.get("reason"),
            Some(&"missing event payload".to_string())
        );
        assert_eq!(
            fields.get("reason_code"),
            Some(&"missing_event".to_string())
        );
        assert_eq!(
            fields.get("source_stream"),
            Some(&"stream.request_log".to_string())
        );
        assert_eq!(
            fields.get("consumer_group"),
            Some(&"usage-worker".to_string())
        );
        assert_eq!(
            fields.get("consumer_name"),
            Some(&"usage-worker-test".to_string())
        );
        assert_eq!(fields.get("raw_event_missing"), Some(&"true".to_string()));
        assert!(!fields.contains_key("raw_event"));
    }

    #[test]
    fn dead_letter_fields_include_other_reason_code() {
        let reader = RedisStreamReader::new(
            "redis://127.0.0.1:6379",
            "stream.request_log",
            "usage-worker",
            "usage-worker-test",
        )
        .unwrap();
        let malformed = MalformedStreamEntry {
            message_id: "1708260000000-8".to_string(),
            reason: "other reason".to_string(),
            raw_event: Some("{}".to_string()),
            reason_code: MalformedReasonCode::Other,
        };
        let observed_at = Utc.with_ymd_and_hms(2026, 2, 19, 12, 34, 58).unwrap();

        let fields = reader.dead_letter_fields(&malformed, observed_at);
        let fields = fields.into_iter().collect::<HashMap<_, _>>();

        assert_eq!(fields.get("reason_code"), Some(&"other".to_string()));
    }

    #[test]
    fn dead_letter_relay_counts_record_success_and_failure_results() {
        let mut counts = DeadLetterRelayCounts::for_configured_stream_entries(3);

        let success_result: std::result::Result<(), ()> = Ok(());
        let failed_result: std::result::Result<(), ()> = Err(());

        counts.record_outcome(&success_result);
        counts.record_outcome(&success_result);
        counts.record_outcome(&failed_result);

        assert_eq!(counts.dead_letter_relay_attempt_count, 3);
        assert_eq!(counts.dead_letter_relay_skipped_count, 0);
        assert_eq!(counts.dead_letter_relay_success_count, 2);
        assert_eq!(counts.dead_letter_relay_failed_count, 1);
    }

    #[test]
    fn dead_letter_relay_counts_connection_failure_marks_all_entries_failed() {
        let counts = DeadLetterRelayCounts::for_connection_failure(3);

        assert_eq!(counts.dead_letter_relay_attempt_count, 3);
        assert_eq!(counts.dead_letter_relay_skipped_count, 0);
        assert_eq!(counts.dead_letter_relay_success_count, 0);
        assert_eq!(counts.dead_letter_relay_failed_count, 3);
    }

    #[test]
    fn dead_letter_relay_counts_without_configured_stream_marks_entries_skipped() {
        let counts = DeadLetterRelayCounts::for_unconfigured_stream(3);

        assert_eq!(counts.dead_letter_relay_attempt_count, 0);
        assert_eq!(counts.dead_letter_relay_skipped_count, 3);
        assert_eq!(counts.dead_letter_relay_success_count, 0);
        assert_eq!(counts.dead_letter_relay_failed_count, 0);
    }

    #[test]
    fn consumer_group_backlog_from_info_reads_pending_and_lag() {
        let info = redis::streams::StreamInfoGroupsReply {
            groups: vec![
                redis::streams::StreamInfoGroup {
                    name: "other-group".to_string(),
                    pending: 3,
                    lag: Some(9),
                    ..redis::streams::StreamInfoGroup::default()
                },
                redis::streams::StreamInfoGroup {
                    name: "usage-worker".to_string(),
                    pending: 17,
                    lag: Some(42),
                    ..redis::streams::StreamInfoGroup::default()
                },
            ],
        };

        let backlog = RedisStreamReader::consumer_group_backlog_from_info(&info, "usage-worker");

        assert_eq!(backlog.pending_count, 17);
        assert_eq!(backlog.lag_count, Some(42));
    }

    #[test]
    fn consumer_group_backlog_from_info_handles_missing_lag_for_legacy_redis() {
        let info = redis::streams::StreamInfoGroupsReply {
            groups: vec![redis::streams::StreamInfoGroup {
                name: "usage-worker".to_string(),
                pending: 8,
                lag: None,
                ..redis::streams::StreamInfoGroup::default()
            }],
        };

        let backlog = RedisStreamReader::consumer_group_backlog_from_info(&info, "usage-worker");

        assert_eq!(backlog.pending_count, 8);
        assert_eq!(backlog.lag_count, None);
    }

    #[test]
    fn reader_defaults_to_no_dead_letter_stream() {
        let reader = RedisStreamReader::new(
            "redis://127.0.0.1:6379",
            "stream.request_log",
            "usage-worker",
            "usage-worker-test",
        )
        .unwrap();

        assert!(reader.dead_letter_stream.is_none());
    }
}
