use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use control_plane::usage::clickhouse_repo::ClickHouseUsageRepo;
use control_plane::usage::redis_reader::RedisStreamReader;
use control_plane::usage::worker::{
    RequestLogStreamReader, UsageAggregationWorker, UsageWorkerConfig, WorkerRunStats,
};

const DEFAULT_REQUEST_LOG_STREAM: &str = "stream.request_log";
const DEFAULT_REQUEST_LOG_CONSUMER_GROUP: &str = "usage-worker";
const DEFAULT_STREAM_READ_COUNT: usize = 100;
const DEFAULT_STREAM_BLOCK_MS: u64 = 1000;
const DEFAULT_RECLAIM_COUNT: usize = 100;
const DEFAULT_RECLAIM_MIN_IDLE_MS: u64 = 30_000;
const DEFAULT_FLUSH_MIN_BATCH: usize = 100;
const DEFAULT_FLUSH_INTERVAL_MS: u64 = 5000;
const DEFAULT_METRICS_LOG_INTERVAL_MS: u64 = 10000;
const DEFAULT_ERROR_BACKOFF_MS: u64 = 1000;
const DEFAULT_ERROR_BACKOFF_FACTOR: u32 = 2;
const DEFAULT_ERROR_BACKOFF_MAX_MS: u64 = 10000;
const DEFAULT_ERROR_BACKOFF_JITTER_PCT: u32 = 0;
const DEFAULT_MAX_CONSECUTIVE_ERRORS: u32 = 0;
const DEFAULT_CLICKHOUSE_DATABASE: &str = "default";
const DEFAULT_CLICKHOUSE_ACCOUNT_TABLE: &str = "usage_account_hourly";
const DEFAULT_CLICKHOUSE_TENANT_APIKEY_TABLE: &str = "usage_tenant_api_key_hourly";
const DEFAULT_CLICKHOUSE_TENANT_ACCOUNT_TABLE: &str = "usage_tenant_account_hourly";
const DEFAULT_CLICKHOUSE_REQUEST_LOG_TABLE: &str = "request_log_events";
const DEFAULT_WORKER_MODE: &str = "daemon";
const DEFAULT_WORKER_REPORT_JSON: bool = false;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkerMode {
    Daemon,
    Oneshot,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    if wants_help() {
        print_help();
        return Ok(());
    }

    control_plane::config::apply_usage_worker_runtime_env_defaults_from_config()?;

    let redis_url = required_env("REDIS_URL")?;
    let clickhouse_url = required_env("CLICKHOUSE_URL")?;
    let worker_mode = parse_worker_mode(std::env::var("USAGE_WORKER_MODE").ok().as_deref())?;
    let report_json = parse_bool_env("USAGE_WORKER_REPORT_JSON", DEFAULT_WORKER_REPORT_JSON)?;
    let report_path = std::env::var_os("USAGE_WORKER_REPORT_PATH").map(PathBuf::from);

    let request_log_stream = std::env::var("REQUEST_LOG_STREAM")
        .unwrap_or_else(|_| DEFAULT_REQUEST_LOG_STREAM.to_string());
    let request_log_dead_letter_stream = std::env::var("REQUEST_LOG_DEAD_LETTER_STREAM").ok();
    let consumer_group = std::env::var("REQUEST_LOG_CONSUMER_GROUP")
        .unwrap_or_else(|_| DEFAULT_REQUEST_LOG_CONSUMER_GROUP.to_string());
    let consumer_name = std::env::var("REQUEST_LOG_CONSUMER_NAME")
        .unwrap_or_else(|_| format!("usage-worker-{}", std::process::id()));

    let stream_read_count = parse_usize_env("STREAM_READ_COUNT", DEFAULT_STREAM_READ_COUNT)?;
    let stream_block_ms = parse_u64_env("STREAM_BLOCK_MS", DEFAULT_STREAM_BLOCK_MS)?;
    let reclaim_count = parse_usize_env("RECLAIM_COUNT", DEFAULT_RECLAIM_COUNT)?;
    let reclaim_min_idle_ms = parse_u64_env("RECLAIM_MIN_IDLE_MS", DEFAULT_RECLAIM_MIN_IDLE_MS)?;
    let flush_min_batch = parse_usize_env("FLUSH_MIN_BATCH", DEFAULT_FLUSH_MIN_BATCH)?;
    let flush_interval_ms = parse_u64_env("FLUSH_INTERVAL_MS", DEFAULT_FLUSH_INTERVAL_MS)?;
    let metrics_log_interval_ms =
        parse_u64_env("METRICS_LOG_INTERVAL_MS", DEFAULT_METRICS_LOG_INTERVAL_MS)?;
    let error_backoff_ms = parse_u64_env("ERROR_BACKOFF_MS", DEFAULT_ERROR_BACKOFF_MS)?;
    let error_backoff_factor = parse_u32_env("ERROR_BACKOFF_FACTOR", DEFAULT_ERROR_BACKOFF_FACTOR)?;
    let error_backoff_max_ms = parse_u64_env("ERROR_BACKOFF_MAX_MS", DEFAULT_ERROR_BACKOFF_MAX_MS)?;
    let error_backoff_jitter_pct =
        parse_u32_env("ERROR_BACKOFF_JITTER_PCT", DEFAULT_ERROR_BACKOFF_JITTER_PCT)?;
    let error_backoff_jitter_seed = parse_optional_u64_env("ERROR_BACKOFF_JITTER_SEED")?;
    let max_consecutive_errors =
        parse_u32_env("MAX_CONSECUTIVE_ERRORS", DEFAULT_MAX_CONSECUTIVE_ERRORS)?;

    let database = std::env::var("CLICKHOUSE_DATABASE")
        .unwrap_or_else(|_| DEFAULT_CLICKHOUSE_DATABASE.to_string());
    let legacy_usage_table = std::env::var("CLICKHOUSE_USAGE_TABLE").ok();
    let account_table = std::env::var("CLICKHOUSE_ACCOUNT_TABLE")
        .ok()
        .or(legacy_usage_table)
        .unwrap_or_else(|| DEFAULT_CLICKHOUSE_ACCOUNT_TABLE.to_string());
    let tenant_api_key_table = std::env::var("CLICKHOUSE_TENANT_APIKEY_TABLE")
        .unwrap_or_else(|_| DEFAULT_CLICKHOUSE_TENANT_APIKEY_TABLE.to_string());
    let tenant_account_table = std::env::var("CLICKHOUSE_TENANT_ACCOUNT_TABLE")
        .unwrap_or_else(|_| DEFAULT_CLICKHOUSE_TENANT_ACCOUNT_TABLE.to_string());
    let request_log_table = std::env::var("CLICKHOUSE_REQUEST_LOG_TABLE")
        .unwrap_or_else(|_| DEFAULT_CLICKHOUSE_REQUEST_LOG_TABLE.to_string());

    let reader = RedisStreamReader::new(
        &redis_url,
        request_log_stream,
        consumer_group,
        consumer_name,
    )?
    .with_dead_letter_stream(request_log_dead_letter_stream);

    if matches!(worker_mode, WorkerMode::Oneshot) {
        reader.ensure_consumer_group().await?;
    }

    let repo = ClickHouseUsageRepo::new(
        &clickhouse_url,
        &database,
        &account_table,
        &tenant_api_key_table,
        &tenant_account_table,
        &request_log_table,
    );
    repo.ensure_table().await?;

    let config = UsageWorkerConfig {
        stream_read_count,
        stream_block: Duration::from_millis(stream_block_ms),
        reclaim_count,
        reclaim_min_idle: Duration::from_millis(reclaim_min_idle_ms),
        flush_min_batch,
        flush_interval: Duration::from_millis(flush_interval_ms),
        metrics_log_interval: Duration::from_millis(metrics_log_interval_ms),
        error_backoff: Duration::from_millis(error_backoff_ms),
        error_backoff_factor,
        error_backoff_max: Duration::from_millis(error_backoff_max_ms),
        error_backoff_jitter_pct: error_backoff_jitter_pct.min(100),
        error_backoff_jitter_seed,
        max_consecutive_errors,
    };

    let worker = UsageAggregationWorker::with_config(reader, repo, config);

    match worker_mode {
        WorkerMode::Daemon => {
            worker
                .run_until_shutdown(async {
                    match tokio::signal::ctrl_c().await {
                        Ok(()) => tracing::info!("ctrl-c received, shutting down usage worker"),
                        Err(err) => {
                            tracing::error!(error = %err, "failed to listen for ctrl-c, shutting down usage worker")
                        }
                    }
                })
                .await
        }
        WorkerMode::Oneshot => {
            tracing::info!("running usage worker in oneshot mode");
            let stats = worker.run_once_with_stats().await?;
            if report_json {
                let report = oneshot_report_json(&stats)?;
                println!("{report}");

                if let Some(path) = report_path.as_deref() {
                    write_oneshot_report(path, &report)?;
                }
            }

            Ok(())
        }
    }
}

fn oneshot_report_json(stats: &WorkerRunStats) -> Result<String> {
    serde_json::to_string(stats).context("failed to serialize oneshot usage worker stats")
}

fn write_oneshot_report(path: &Path, report: &str) -> Result<()> {
    std::fs::write(path, report).with_context(|| {
        format!(
            "failed to write oneshot usage worker report to {}",
            path.display()
        )
    })
}

fn wants_help() -> bool {
    std::env::args().any(|arg| arg == "-h" || arg == "--help")
}

fn print_help() {
    println!("{}", help_text());
}

fn help_text() -> String {
    format!(
        "usage-worker env:\n  CODEX_POOL_CONFIG_FILE (optional: global config.toml path)\n  USAGE_WORKER_CONFIG_FILE (optional: usage-worker config.toml path override)\n  REDIS_URL\n  CLICKHOUSE_URL\n  USAGE_WORKER_MODE (default: {}, values: daemon|oneshot)\n  USAGE_WORKER_REPORT_JSON (default: {}, values: true|false, oneshot only; includes pending/lag backlog and backoff snapshot fields)\n  USAGE_WORKER_REPORT_PATH (optional path, oneshot + report json only, overwrite write)\n  REQUEST_LOG_STREAM (default: {})\n  REQUEST_LOG_DEAD_LETTER_STREAM (optional: relay malformed entries before ack)\n  REQUEST_LOG_CONSUMER_GROUP (default: {})\n  REQUEST_LOG_CONSUMER_NAME (default: usage-worker-<pid>)\n  STREAM_READ_COUNT (default: {})\n  STREAM_BLOCK_MS (default: {})\n  RECLAIM_COUNT (default: {})\n  RECLAIM_MIN_IDLE_MS (default: {})\n  FLUSH_MIN_BATCH (default: {})\n  FLUSH_INTERVAL_MS (default: {})\n  METRICS_LOG_INTERVAL_MS (default: {})\n  ERROR_BACKOFF_MS (default: {})\n  ERROR_BACKOFF_FACTOR (default: {})\n  ERROR_BACKOFF_MAX_MS (default: {})\n  ERROR_BACKOFF_JITTER_PCT (default: {}, allowed: 0-100, values >100 are clamped)\n  ERROR_BACKOFF_JITTER_SEED (optional: u64 seed for deterministic jitter)\n  MAX_CONSECUTIVE_ERRORS (default: {}, 0 means unlimited)\n  CLICKHOUSE_DATABASE (default: {})\n  CLICKHOUSE_ACCOUNT_TABLE (default: {})\n  CLICKHOUSE_TENANT_APIKEY_TABLE (default: {})\n  CLICKHOUSE_TENANT_ACCOUNT_TABLE (default: {})\n  CLICKHOUSE_REQUEST_LOG_TABLE (default: {})\n  CLICKHOUSE_USAGE_TABLE (legacy fallback for account table)",
        DEFAULT_WORKER_MODE,
        DEFAULT_WORKER_REPORT_JSON,
        DEFAULT_REQUEST_LOG_STREAM,
        DEFAULT_REQUEST_LOG_CONSUMER_GROUP,
        DEFAULT_STREAM_READ_COUNT,
        DEFAULT_STREAM_BLOCK_MS,
        DEFAULT_RECLAIM_COUNT,
        DEFAULT_RECLAIM_MIN_IDLE_MS,
        DEFAULT_FLUSH_MIN_BATCH,
        DEFAULT_FLUSH_INTERVAL_MS,
        DEFAULT_METRICS_LOG_INTERVAL_MS,
        DEFAULT_ERROR_BACKOFF_MS,
        DEFAULT_ERROR_BACKOFF_FACTOR,
        DEFAULT_ERROR_BACKOFF_MAX_MS,
        DEFAULT_ERROR_BACKOFF_JITTER_PCT,
        DEFAULT_MAX_CONSECUTIVE_ERRORS,
        DEFAULT_CLICKHOUSE_DATABASE,
        DEFAULT_CLICKHOUSE_ACCOUNT_TABLE,
        DEFAULT_CLICKHOUSE_TENANT_APIKEY_TABLE,
        DEFAULT_CLICKHOUSE_TENANT_ACCOUNT_TABLE,
        DEFAULT_CLICKHOUSE_REQUEST_LOG_TABLE,
    )
}

fn required_env(key: &str) -> Result<String> {
    std::env::var(key).with_context(|| format!("missing required env var {key}"))
}

fn parse_usize_env(key: &str, default: usize) -> Result<usize> {
    match std::env::var(key) {
        Ok(value) => value
            .parse::<usize>()
            .with_context(|| format!("invalid usize value in {key}")),
        Err(_) => Ok(default),
    }
}

fn parse_u64_env(key: &str, default: u64) -> Result<u64> {
    match std::env::var(key) {
        Ok(value) => value
            .parse::<u64>()
            .with_context(|| format!("invalid u64 value in {key}")),
        Err(_) => Ok(default),
    }
}

fn parse_optional_u64_env(key: &str) -> Result<Option<u64>> {
    match std::env::var(key) {
        Ok(value) => value
            .parse::<u64>()
            .map(Some)
            .with_context(|| format!("invalid u64 value in {key}")),
        Err(_) => Ok(None),
    }
}

fn parse_bool_env(key: &str, default: bool) -> Result<bool> {
    match std::env::var(key) {
        Ok(value) => parse_bool(&value).with_context(|| format!("invalid bool value in {key}")),
        Err(_) => Ok(default),
    }
}

fn parse_bool(value: &str) -> Option<bool> {
    if value.eq_ignore_ascii_case("true") || value == "1" {
        return Some(true);
    }

    if value.eq_ignore_ascii_case("false") || value == "0" {
        return Some(false);
    }

    None
}

fn parse_u32_env(key: &str, default: u32) -> Result<u32> {
    match std::env::var(key) {
        Ok(value) => value
            .parse::<u32>()
            .with_context(|| format!("invalid u32 value in {key}")),
        Err(_) => Ok(default),
    }
}

fn parse_worker_mode(value: Option<&str>) -> Result<WorkerMode> {
    let value = value.unwrap_or(DEFAULT_WORKER_MODE);
    match value {
        "daemon" => Ok(WorkerMode::Daemon),
        "oneshot" => Ok(WorkerMode::Oneshot),
        _ => bail!("invalid USAGE_WORKER_MODE value: {value} (expected daemon or oneshot)"),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        help_text, oneshot_report_json, parse_bool, parse_worker_mode, write_oneshot_report,
        WorkerMode,
    };
    use control_plane::usage::worker::WorkerRunStats;
    use serde_json::Value;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "usage-worker-{label}-{}-{nanos}",
            std::process::id()
        ))
    }

    #[test]
    fn parse_worker_mode_defaults_to_daemon() {
        let mode = parse_worker_mode(None).unwrap();
        assert_eq!(mode, WorkerMode::Daemon);
    }

    #[test]
    fn parse_worker_mode_accepts_oneshot() {
        let mode = parse_worker_mode(Some("oneshot")).unwrap();
        assert_eq!(mode, WorkerMode::Oneshot);
    }

    #[test]
    fn parse_worker_mode_rejects_unknown_value() {
        let error = parse_worker_mode(Some("burst")).unwrap_err();
        assert!(error.to_string().contains("USAGE_WORKER_MODE"));
    }

    #[test]
    fn help_includes_error_backoff_jitter_env() {
        let help = help_text();
        assert!(help.contains("ERROR_BACKOFF_JITTER_PCT"));
        assert!(help.contains("ERROR_BACKOFF_JITTER_SEED"));
        assert!(help.contains("REQUEST_LOG_DEAD_LETTER_STREAM"));
        assert!(help.contains("USAGE_WORKER_REPORT_JSON"));
        assert!(help.contains("USAGE_WORKER_REPORT_PATH"));
        assert!(help.contains("clamped"));
    }

    #[test]
    fn parse_bool_accepts_true_false_and_binary_values() {
        assert_eq!(parse_bool("true"), Some(true));
        assert_eq!(parse_bool("TRUE"), Some(true));
        assert_eq!(parse_bool("1"), Some(true));
        assert_eq!(parse_bool("false"), Some(false));
        assert_eq!(parse_bool("FALSE"), Some(false));
        assert_eq!(parse_bool("0"), Some(false));
        assert_eq!(parse_bool("yes"), None);
    }

    #[test]
    fn oneshot_report_json_includes_extended_stats_fields() {
        let stats = WorkerRunStats {
            processed_count: 3,
            reclaimed_count: 1,
            fresh_read_count: 2,
            reclaimed_message_count: 1,
            fresh_message_count: 2,
            malformed_acked_count: 0,
            malformed_missing_event_count: 0,
            malformed_invalid_json_count: 0,
            malformed_other_count: 0,
            malformed_raw_event_bytes_total: 17,
            dead_letter_relay_attempt_count: 8,
            dead_letter_relay_skipped_count: 9,
            dead_letter_relay_success_count: 5,
            dead_letter_relay_failed_count: 2,
            flush_count: 1,
            ack_count: 3,
            error_count: 0,
            run_duration_ms: 42,
            ..WorkerRunStats::default()
        };

        let report = oneshot_report_json(&stats).unwrap();
        let value: Value = serde_json::from_str(&report).unwrap();

        for key in [
            "processed_count",
            "reclaimed_count",
            "fresh_read_count",
            "reclaimed_message_count",
            "fresh_message_count",
            "malformed_acked_count",
            "malformed_missing_event_count",
            "malformed_invalid_json_count",
            "malformed_other_count",
            "malformed_raw_event_bytes_total",
            "dead_letter_relay_attempt_count",
            "dead_letter_relay_skipped_count",
            "dead_letter_relay_success_count",
            "dead_letter_relay_failed_count",
            "flush_count",
            "ack_count",
            "error_count",
            "pending_count",
            "lag_count",
            "last_backoff_ms",
            "consecutive_errors",
            "run_duration_ms",
        ] {
            assert!(value.get(key).is_some(), "missing field: {key}");
        }

        assert_eq!(value["reclaimed_count"], 1);
        assert_eq!(value["fresh_read_count"], 2);
        assert_eq!(value["reclaimed_message_count"], 1);
        assert_eq!(value["fresh_message_count"], 2);
        assert_eq!(value["malformed_raw_event_bytes_total"], 17);
        assert_eq!(value["dead_letter_relay_attempt_count"], 8);
        assert_eq!(value["dead_letter_relay_skipped_count"], 9);
        assert_eq!(value["dead_letter_relay_success_count"], 5);
        assert_eq!(value["dead_letter_relay_failed_count"], 2);
        assert_eq!(value["pending_count"], 0);
        assert!(value["lag_count"].is_null());
        assert_eq!(value["last_backoff_ms"], 0);
        assert_eq!(value["consecutive_errors"], 0);
        assert_eq!(value["run_duration_ms"], 42);
    }

    #[test]
    fn write_oneshot_report_writes_report_json_to_file() {
        let report_path = unique_temp_path("report-json");
        let report = r#"{"processed_count":3,"flush_count":1}"#;

        write_oneshot_report(&report_path, report).unwrap();

        let written = std::fs::read_to_string(&report_path).unwrap();
        assert_eq!(written, report);

        let _ = std::fs::remove_file(&report_path);
    }

    #[test]
    fn write_oneshot_report_returns_error_when_write_fails() {
        let report_dir = unique_temp_path("report-dir");
        std::fs::create_dir_all(&report_dir).unwrap();

        let error = write_oneshot_report(&report_dir, "{}").unwrap_err();
        assert!(
            error
                .to_string()
                .contains("failed to write oneshot usage worker report"),
            "unexpected error: {error}"
        );

        let _ = std::fs::remove_dir_all(&report_dir);
    }
}
