#[derive(Serialize)]
struct InternalAuthWhoamiResponse {
    tenant_id: Option<Uuid>,
    api_key_id: Option<Uuid>,
    enabled: bool,
    token_prefix: String,
}

#[derive(Serialize)]
struct InternalDebugBillingPreauthModelErrorStat {
    model: String,
    sample_count: usize,
    avg_ratio: f64,
    p50_ratio: f64,
    p95_ratio: f64,
}

#[derive(Serialize)]
struct InternalDebugStateResponse {
    snapshot_revision: u64,
    snapshot_cursor: u64,
    snapshot_remote_cursor: u64,
    snapshot_outbox_lag: u64,
    account_total: usize,
    active_account_total: usize,
    auth_mode: String,
    auth_fail_open: bool,
    allowlist_api_key_total: usize,
    auth_validator_enabled: bool,
    sticky_session_total: u64,
    sticky_hit_count: u64,
    sticky_miss_count: u64,
    sticky_rebind_count: u64,
    sticky_mapping_total: usize,
    sticky_hit_ratio: f64,
    failover_enabled: bool,
    same_account_quick_retry_max: u32,
    request_failover_wait_ms: u64,
    retry_poll_interval_ms: u64,
    invalid_request_guard_enabled: bool,
    invalid_request_guard_window_sec: u64,
    invalid_request_guard_threshold: usize,
    invalid_request_guard_block_ttl_sec: u64,
    sticky_prefer_non_conflicting: bool,
    shared_routing_cache_enabled: bool,
    enable_metered_stream_billing: bool,
    billing_authorize_required_for_stream: bool,
    stream_billing_reserve_microcredits: i64,
    billing_dynamic_preauth_enabled: bool,
    billing_preauth_expected_output_tokens: i64,
    billing_preauth_safety_factor: f64,
    billing_preauth_min_microcredits: i64,
    billing_preauth_max_microcredits: i64,
    billing_preauth_unit_price_microcredits: i64,
    stream_billing_drain_timeout_ms: u64,
    billing_capture_retry_max: u32,
    billing_capture_retry_backoff_ms: u64,
    failover_attempt_total: u64,
    failover_success_total: u64,
    failover_exhausted_total: u64,
    same_account_retry_total: u64,
    invalid_request_guard_block_total: u64,
    billing_authorize_total: u64,
    billing_authorize_failed_total: u64,
    billing_capture_total: u64,
    billing_capture_failed_total: u64,
    billing_release_total: u64,
    billing_idempotent_hit_total: u64,
    billing_preauth_dynamic_total: u64,
    billing_preauth_fallback_total: u64,
    billing_preauth_amount_microcredits_sum: u64,
    billing_preauth_error_ratio_count_total: u64,
    billing_preauth_error_ratio_avg: f64,
    billing_preauth_error_ratio_p50: f64,
    billing_preauth_error_ratio_p95: f64,
    billing_preauth_capture_missing_total: u64,
    billing_settle_complete_total: u64,
    billing_release_without_capture_total: u64,
    billing_settle_complete_ratio: f64,
    billing_release_without_capture_ratio: f64,
    billing_preauth_model_error_stats: Vec<InternalDebugBillingPreauthModelErrorStat>,
    stream_usage_missing_total: u64,
    stream_usage_estimated_total: u64,
    stream_drain_timeout_total: u64,
    stream_response_total: u64,
    stream_protocol_sse_header_total: u64,
    stream_protocol_header_missing_total: u64,
    stream_usage_json_line_fallback_total: u64,
    stream_protocol_sse_header_hit_ratio: f64,
    stream_protocol_header_missing_hit_ratio: f64,
    stream_usage_json_line_fallback_hit_ratio: f64,
    snapshot_events_apply_total: u64,
    snapshot_events_cursor_gone_total: u64,
    routing_cache_local_sticky_hit_total: u64,
    routing_cache_local_sticky_miss_total: u64,
    routing_cache_shared_sticky_hit_total: u64,
    routing_cache_shared_sticky_miss_total: u64,
}

#[derive(Serialize)]
struct InternalDebugAuthCacheResponse {
    auth_validator_enabled: bool,
    cached_principal_total: usize,
    negative_cached_token_total: usize,
    auth_fail_open: bool,
    allowlist_api_key_total: usize,
}

#[derive(Serialize)]
struct InternalDebugAuthCacheClearResponse {
    auth_validator_enabled: bool,
    cleared: usize,
    cached_principal_total: usize,
}

#[derive(Serialize)]
struct InternalDebugAuthCacheStatsResponse {
    auth_validator_enabled: bool,
    cached_principal_total: usize,
    cache_hit_count: u64,
    cache_miss_count: u64,
    remote_validate_count: u64,
    negative_cache_hit_count: u64,
    negative_cache_store_count: u64,
}

#[derive(Serialize)]
struct InternalDebugAuthCacheStatsResetResponse {
    auth_validator_enabled: bool,
    cache_hit_count_before: u64,
    cache_miss_count_before: u64,
    remote_validate_count_before: u64,
    negative_cache_hit_count_before: u64,
    negative_cache_store_count_before: u64,
    cache_hit_count_after: u64,
    cache_miss_count_after: u64,
    remote_validate_count_after: u64,
    negative_cache_hit_count_after: u64,
    negative_cache_store_count_after: u64,
}

#[derive(Deserialize)]
struct InternalDebugAuthCacheLookupRequest {
    token: String,
}

#[derive(Serialize)]
struct InternalDebugAuthCacheLookupResponse {
    auth_validator_enabled: bool,
    hit: bool,
    cached_negative: bool,
    lookup_status: String,
    tenant_id: Option<Uuid>,
    api_key_id: Option<Uuid>,
    enabled: Option<bool>,
    cached_principal_total: usize,
}

#[derive(Deserialize)]
struct InternalDebugAuthCacheEvictRequest {
    token: String,
}

#[derive(Serialize)]
struct InternalDebugAuthCacheEvictResponse {
    auth_validator_enabled: bool,
    evicted: bool,
    positive_evicted: bool,
    negative_evicted: bool,
    cached_principal_total: usize,
}

#[derive(Serialize)]
struct InternalDebugAccountsResponse {
    accounts: Vec<InternalDebugAccount>,
}

#[derive(Serialize)]
struct InternalDebugAccount {
    id: Uuid,
    label: String,
    mode: UpstreamMode,
    enabled: bool,
    priority: i32,
    base_url: String,
    chatgpt_account_id: Option<String>,
    temporarily_unhealthy: bool,
}

#[derive(Serialize)]
struct InternalDebugClearUnhealthyResponse {
    cleared: usize,
}

#[derive(Debug, Deserialize)]
struct InternalDebugMarkUnhealthyQuery {
    ttl_sec: Option<u64>,
}

async fn internal_auth_whoami(
    principal: Option<Extension<ApiPrincipal>>,
) -> Result<axum::Json<InternalAuthWhoamiResponse>, (StatusCode, axum::Json<ErrorEnvelope>)> {
    let Some(Extension(principal)) = principal else {
        return Err((
            StatusCode::UNAUTHORIZED,
            axum::Json(ErrorEnvelope::new(
                "unauthorized",
                "missing authenticated principal",
            )),
        ));
    };

    Ok(axum::Json(InternalAuthWhoamiResponse {
        tenant_id: principal.tenant_id,
        api_key_id: principal.api_key_id,
        enabled: principal.enabled,
        token_prefix: principal.token.chars().take(8).collect(),
    }))
}

async fn internal_debug_state(
    State(state): State<Arc<AppState>>,
) -> axum::Json<InternalDebugStateResponse> {
    let auth_validator_enabled = state.auth_validator.is_some();
    let auth_mode = if auth_validator_enabled {
        "online_validator"
    } else if !state.allowed_api_keys.is_empty() {
        "allowlist"
    } else {
        "open"
    };

    let sticky_stats = state.router.sticky_stats();
    let cache_stats = state.routing_cache.stats_snapshot();
    let sticky_hit_ratio = if sticky_stats.sticky_session_total == 0 {
        0.0
    } else {
        sticky_stats.sticky_hit_count as f64 / sticky_stats.sticky_session_total as f64
    };
    let stream_response_total = state.stream_response_total.load(Ordering::Relaxed);
    let stream_protocol_sse_header_total =
        state.stream_protocol_sse_header_total.load(Ordering::Relaxed);
    let stream_protocol_header_missing_total = state
        .stream_protocol_header_missing_total
        .load(Ordering::Relaxed);
    let stream_usage_json_line_fallback_total = state
        .stream_usage_json_line_fallback_total
        .load(Ordering::Relaxed);
    let stream_protocol_sse_header_hit_ratio = if stream_response_total == 0 {
        0.0
    } else {
        stream_protocol_sse_header_total as f64 / stream_response_total as f64
    };
    let stream_protocol_header_missing_hit_ratio = if stream_response_total == 0 {
        0.0
    } else {
        stream_protocol_header_missing_total as f64 / stream_response_total as f64
    };
    let stream_usage_json_line_fallback_hit_ratio = if stream_response_total == 0 {
        0.0
    } else {
        stream_usage_json_line_fallback_total as f64 / stream_response_total as f64
    };
    let billing_authorize_total = state.billing_authorize_total.load(Ordering::Relaxed);
    let billing_preauth_error_ratio_count_total = state
        .billing_preauth_error_ratio_count_total
        .load(Ordering::Relaxed);
    let billing_preauth_error_ratio_ppm_sum_total = state
        .billing_preauth_error_ratio_ppm_sum_total
        .load(Ordering::Relaxed);
    let billing_preauth_error_ratio_avg = if billing_preauth_error_ratio_count_total == 0 {
        0.0
    } else {
        ppm_to_ratio(
            billing_preauth_error_ratio_ppm_sum_total as f64
                / billing_preauth_error_ratio_count_total as f64,
        )
    };
    let recent_ratio_samples = state
        .billing_preauth_error_ratio_recent_ppm
        .read()
        .ok()
        .map(|values| values.iter().copied().collect::<Vec<_>>())
        .unwrap_or_default();
    let billing_preauth_error_ratio_p50 =
        quantile_ratio_from_ppm_samples(&recent_ratio_samples, 0.5);
    let billing_preauth_error_ratio_p95 =
        quantile_ratio_from_ppm_samples(&recent_ratio_samples, 0.95);
    let billing_release_without_capture_total = state
        .billing_release_without_capture_total
        .load(Ordering::Relaxed);
    let billing_settle_complete_total = state.billing_settle_complete_total.load(Ordering::Relaxed);
    let billing_settle_complete_ratio = if billing_authorize_total == 0 {
        0.0
    } else {
        billing_settle_complete_total as f64 / billing_authorize_total as f64
    };
    let billing_release_without_capture_ratio = if billing_authorize_total == 0 {
        0.0
    } else {
        billing_release_without_capture_total as f64 / billing_authorize_total as f64
    };
    let billing_preauth_model_error_stats = model_error_ratio_stats(&state);
    let snapshot_cursor = state.snapshot_cursor.load(Ordering::Relaxed);
    let snapshot_remote_cursor = state.snapshot_remote_cursor.load(Ordering::Relaxed);
    let snapshot_outbox_lag = snapshot_remote_cursor.saturating_sub(snapshot_cursor);

    axum::Json(InternalDebugStateResponse {
        snapshot_revision: state.snapshot_revision.load(Ordering::Relaxed),
        snapshot_cursor,
        snapshot_remote_cursor,
        snapshot_outbox_lag,
        account_total: state.router.total(),
        active_account_total: state.router.enabled_total(),
        auth_mode: auth_mode.to_string(),
        auth_fail_open: state.auth_fail_open,
        allowlist_api_key_total: state.allowed_api_keys.len(),
        auth_validator_enabled,
        sticky_session_total: sticky_stats.sticky_session_total,
        sticky_hit_count: sticky_stats.sticky_hit_count,
        sticky_miss_count: sticky_stats.sticky_miss_count,
        sticky_rebind_count: sticky_stats.sticky_rebind_count,
        sticky_mapping_total: sticky_stats.sticky_mapping_total,
        sticky_hit_ratio,
        failover_enabled: state.enable_request_failover,
        same_account_quick_retry_max: state.same_account_quick_retry_max,
        request_failover_wait_ms: state.request_failover_wait.as_millis() as u64,
        retry_poll_interval_ms: state.retry_poll_interval.as_millis() as u64,
        invalid_request_guard_enabled: state.invalid_request_guard_enabled,
        invalid_request_guard_window_sec: state.invalid_request_guard_window.as_secs(),
        invalid_request_guard_threshold: state.invalid_request_guard_threshold,
        invalid_request_guard_block_ttl_sec: state.invalid_request_guard_block_ttl.as_secs(),
        sticky_prefer_non_conflicting: state.sticky_prefer_non_conflicting,
        shared_routing_cache_enabled: state.shared_routing_cache_enabled,
        enable_metered_stream_billing: state.enable_metered_stream_billing,
        billing_authorize_required_for_stream: state.billing_authorize_required_for_stream,
        stream_billing_reserve_microcredits: state.stream_billing_reserve_microcredits,
        billing_dynamic_preauth_enabled: state.billing_dynamic_preauth_enabled,
        billing_preauth_expected_output_tokens: state.billing_preauth_expected_output_tokens,
        billing_preauth_safety_factor: state.billing_preauth_safety_factor,
        billing_preauth_min_microcredits: state.billing_preauth_min_microcredits,
        billing_preauth_max_microcredits: state.billing_preauth_max_microcredits,
        billing_preauth_unit_price_microcredits: state.billing_preauth_unit_price_microcredits,
        stream_billing_drain_timeout_ms: state.stream_billing_drain_timeout.as_millis() as u64,
        billing_capture_retry_max: state.billing_capture_retry_max,
        billing_capture_retry_backoff_ms: state.billing_capture_retry_backoff.as_millis() as u64,
        failover_attempt_total: state.failover_attempt_total.load(Ordering::Relaxed),
        failover_success_total: state.failover_success_total.load(Ordering::Relaxed),
        failover_exhausted_total: state.failover_exhausted_total.load(Ordering::Relaxed),
        same_account_retry_total: state.same_account_retry_total.load(Ordering::Relaxed),
        invalid_request_guard_block_total: state
            .invalid_request_guard_block_total
            .load(Ordering::Relaxed),
        billing_authorize_total,
        billing_authorize_failed_total: state
            .billing_authorize_failed_total
            .load(Ordering::Relaxed),
        billing_capture_total: state.billing_capture_total.load(Ordering::Relaxed),
        billing_capture_failed_total: state.billing_capture_failed_total.load(Ordering::Relaxed),
        billing_release_total: state.billing_release_total.load(Ordering::Relaxed),
        billing_idempotent_hit_total: state.billing_idempotent_hit_total.load(Ordering::Relaxed),
        billing_preauth_dynamic_total: state.billing_preauth_dynamic_total.load(Ordering::Relaxed),
        billing_preauth_fallback_total: state
            .billing_preauth_fallback_total
            .load(Ordering::Relaxed),
        billing_preauth_amount_microcredits_sum: state
            .billing_preauth_amount_microcredits_sum
            .load(Ordering::Relaxed),
        billing_preauth_error_ratio_count_total,
        billing_preauth_error_ratio_avg,
        billing_preauth_error_ratio_p50,
        billing_preauth_error_ratio_p95,
        billing_preauth_capture_missing_total: state
            .billing_preauth_capture_missing_total
            .load(Ordering::Relaxed),
        billing_settle_complete_total,
        billing_release_without_capture_total,
        billing_settle_complete_ratio,
        billing_release_without_capture_ratio,
        billing_preauth_model_error_stats,
        stream_usage_missing_total: state.stream_usage_missing_total.load(Ordering::Relaxed),
        stream_usage_estimated_total: state.stream_usage_estimated_total.load(Ordering::Relaxed),
        stream_drain_timeout_total: state.stream_drain_timeout_total.load(Ordering::Relaxed),
        stream_response_total,
        stream_protocol_sse_header_total,
        stream_protocol_header_missing_total,
        stream_usage_json_line_fallback_total,
        stream_protocol_sse_header_hit_ratio,
        stream_protocol_header_missing_hit_ratio,
        stream_usage_json_line_fallback_hit_ratio,
        snapshot_events_apply_total: state.snapshot_events_apply_total.load(Ordering::Relaxed),
        snapshot_events_cursor_gone_total: state
            .snapshot_events_cursor_gone_total
            .load(Ordering::Relaxed),
        routing_cache_local_sticky_hit_total: cache_stats.local_sticky_hit_total,
        routing_cache_local_sticky_miss_total: cache_stats.local_sticky_miss_total,
        routing_cache_shared_sticky_hit_total: cache_stats.shared_sticky_hit_total,
        routing_cache_shared_sticky_miss_total: cache_stats.shared_sticky_miss_total,
    })
}

async fn internal_metrics(State(state): State<Arc<AppState>>) -> (StatusCode, HeaderMap, String) {
    let sticky_stats = state.router.sticky_stats();
    let cache_stats = state.routing_cache.stats_snapshot();
    let snapshot_cursor = state.snapshot_cursor.load(Ordering::Relaxed);
    let snapshot_remote_cursor = state.snapshot_remote_cursor.load(Ordering::Relaxed);
    let snapshot_outbox_lag = snapshot_remote_cursor.saturating_sub(snapshot_cursor);
    let sticky_hit_ratio = if sticky_stats.sticky_session_total == 0 {
        0.0
    } else {
        sticky_stats.sticky_hit_count as f64 / sticky_stats.sticky_session_total as f64
    };

    let mut body = String::new();
    append_metric_line(
        &mut body,
        "codex_data_plane_snapshot_revision",
        state.snapshot_revision.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_snapshot_cursor",
        snapshot_cursor as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_snapshot_remote_cursor",
        snapshot_remote_cursor as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_snapshot_outbox_lag",
        snapshot_outbox_lag as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_snapshot_events_apply_total",
        state.snapshot_events_apply_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_snapshot_events_cursor_gone_total",
        state.snapshot_events_cursor_gone_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_failover_enabled",
        bool_to_metric_value(state.enable_request_failover),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_same_account_quick_retry_max",
        state.same_account_quick_retry_max as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_request_failover_wait_ms",
        state.request_failover_wait.as_millis() as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_retry_poll_interval_ms",
        state.retry_poll_interval.as_millis() as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_invalid_request_guard_enabled",
        bool_to_metric_value(state.invalid_request_guard_enabled),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_invalid_request_guard_window_sec",
        state.invalid_request_guard_window.as_secs() as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_invalid_request_guard_threshold",
        state.invalid_request_guard_threshold as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_invalid_request_guard_block_ttl_sec",
        state.invalid_request_guard_block_ttl.as_secs() as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_prefer_non_conflicting",
        bool_to_metric_value(state.sticky_prefer_non_conflicting),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_shared_routing_cache_enabled",
        bool_to_metric_value(state.shared_routing_cache_enabled),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_enable_metered_stream_billing",
        bool_to_metric_value(state.enable_metered_stream_billing),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_authorize_required_for_stream",
        bool_to_metric_value(state.billing_authorize_required_for_stream),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_billing_reserve_microcredits",
        state.stream_billing_reserve_microcredits as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_dynamic_preauth_enabled",
        bool_to_metric_value(state.billing_dynamic_preauth_enabled),
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_expected_output_tokens",
        state.billing_preauth_expected_output_tokens as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_safety_factor",
        state.billing_preauth_safety_factor,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_min_microcredits",
        state.billing_preauth_min_microcredits as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_max_microcredits",
        state.billing_preauth_max_microcredits as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_unit_price_microcredits",
        state.billing_preauth_unit_price_microcredits as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_billing_drain_timeout_ms",
        state.stream_billing_drain_timeout.as_millis() as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_capture_retry_max",
        state.billing_capture_retry_max as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_capture_retry_backoff_ms",
        state.billing_capture_retry_backoff.as_millis() as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_failover_attempt_total",
        state.failover_attempt_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_failover_success_total",
        state.failover_success_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_failover_exhausted_total",
        state.failover_exhausted_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_same_account_retry_total",
        state.same_account_retry_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_invalid_request_guard_block_total",
        state.invalid_request_guard_block_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_authorize_total",
        state.billing_authorize_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_authorize_failed_total",
        state.billing_authorize_failed_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_capture_total",
        state.billing_capture_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_capture_failed_total",
        state.billing_capture_failed_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_release_total",
        state.billing_release_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_idempotent_hit_total",
        state.billing_idempotent_hit_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_dynamic_total",
        state.billing_preauth_dynamic_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_fallback_total",
        state.billing_preauth_fallback_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_amount_microcredits_sum",
        state
            .billing_preauth_amount_microcredits_sum
            .load(Ordering::Relaxed) as f64,
    );
    let billing_preauth_error_ratio_count_total = state
        .billing_preauth_error_ratio_count_total
        .load(Ordering::Relaxed);
    let billing_preauth_error_ratio_ppm_sum_total = state
        .billing_preauth_error_ratio_ppm_sum_total
        .load(Ordering::Relaxed);
    let billing_preauth_error_ratio_avg = if billing_preauth_error_ratio_count_total == 0 {
        0.0
    } else {
        ppm_to_ratio(
            billing_preauth_error_ratio_ppm_sum_total as f64
                / billing_preauth_error_ratio_count_total as f64,
        )
    };
    let recent_ratio_samples = state
        .billing_preauth_error_ratio_recent_ppm
        .read()
        .ok()
        .map(|values| values.iter().copied().collect::<Vec<_>>())
        .unwrap_or_default();
    let billing_preauth_error_ratio_p50 =
        quantile_ratio_from_ppm_samples(&recent_ratio_samples, 0.5);
    let billing_preauth_error_ratio_p95 =
        quantile_ratio_from_ppm_samples(&recent_ratio_samples, 0.95);
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_error_ratio_count_total",
        billing_preauth_error_ratio_count_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_error_ratio_avg",
        billing_preauth_error_ratio_avg,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_error_ratio_p50",
        billing_preauth_error_ratio_p50,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_error_ratio_p95",
        billing_preauth_error_ratio_p95,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_preauth_capture_missing_total",
        state.billing_preauth_capture_missing_total.load(Ordering::Relaxed) as f64,
    );
    let billing_authorize_total = state.billing_authorize_total.load(Ordering::Relaxed);
    let billing_settle_complete_total = state.billing_settle_complete_total.load(Ordering::Relaxed);
    let billing_release_without_capture_total = state
        .billing_release_without_capture_total
        .load(Ordering::Relaxed);
    let billing_settle_complete_ratio = if billing_authorize_total == 0 {
        0.0
    } else {
        billing_settle_complete_total as f64 / billing_authorize_total as f64
    };
    let billing_release_without_capture_ratio = if billing_authorize_total == 0 {
        0.0
    } else {
        billing_release_without_capture_total as f64 / billing_authorize_total as f64
    };
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_settle_complete_total",
        billing_settle_complete_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_release_without_capture_total",
        billing_release_without_capture_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_settle_complete_ratio",
        billing_settle_complete_ratio,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_billing_release_without_capture_ratio",
        billing_release_without_capture_ratio,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_usage_missing_total",
        state.stream_usage_missing_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_usage_estimated_total",
        state.stream_usage_estimated_total.load(Ordering::Relaxed) as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_drain_timeout_total",
        state.stream_drain_timeout_total.load(Ordering::Relaxed) as f64,
    );
    let stream_response_total = state.stream_response_total.load(Ordering::Relaxed);
    let stream_protocol_sse_header_total =
        state.stream_protocol_sse_header_total.load(Ordering::Relaxed);
    let stream_protocol_header_missing_total = state
        .stream_protocol_header_missing_total
        .load(Ordering::Relaxed);
    let stream_usage_json_line_fallback_total = state
        .stream_usage_json_line_fallback_total
        .load(Ordering::Relaxed);
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_response_total",
        stream_response_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_protocol_sse_header_total",
        stream_protocol_sse_header_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_protocol_header_missing_total",
        stream_protocol_header_missing_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_usage_json_line_fallback_total",
        stream_usage_json_line_fallback_total as f64,
    );
    let stream_protocol_sse_header_hit_ratio = if stream_response_total == 0 {
        0.0
    } else {
        stream_protocol_sse_header_total as f64 / stream_response_total as f64
    };
    let stream_protocol_header_missing_hit_ratio = if stream_response_total == 0 {
        0.0
    } else {
        stream_protocol_header_missing_total as f64 / stream_response_total as f64
    };
    let stream_usage_json_line_fallback_hit_ratio = if stream_response_total == 0 {
        0.0
    } else {
        stream_usage_json_line_fallback_total as f64 / stream_response_total as f64
    };
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_protocol_sse_header_hit_ratio",
        stream_protocol_sse_header_hit_ratio,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_protocol_header_missing_hit_ratio",
        stream_protocol_header_missing_hit_ratio,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_stream_usage_json_line_fallback_hit_ratio",
        stream_usage_json_line_fallback_hit_ratio,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_session_total",
        sticky_stats.sticky_session_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_hit_total",
        sticky_stats.sticky_hit_count as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_miss_total",
        sticky_stats.sticky_miss_count as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_rebind_total",
        sticky_stats.sticky_rebind_count as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_mapping_total",
        sticky_stats.sticky_mapping_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_sticky_hit_ratio",
        sticky_hit_ratio,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_local_sticky_hit_total",
        cache_stats.local_sticky_hit_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_local_sticky_miss_total",
        cache_stats.local_sticky_miss_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_sticky_hit_total",
        cache_stats.shared_sticky_hit_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_sticky_miss_total",
        cache_stats.shared_sticky_miss_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_sticky_error_total",
        cache_stats.shared_sticky_error_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_local_unhealthy_hit_total",
        cache_stats.local_unhealthy_hit_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_local_unhealthy_miss_total",
        cache_stats.local_unhealthy_miss_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_unhealthy_hit_total",
        cache_stats.shared_unhealthy_hit_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_unhealthy_miss_total",
        cache_stats.shared_unhealthy_miss_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_unhealthy_error_total",
        cache_stats.shared_unhealthy_error_total as f64,
    );
    append_metric_line(
        &mut body,
        "codex_data_plane_routing_cache_shared_write_error_total",
        cache_stats.shared_write_error_total as f64,
    );

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; version=0.0.4; charset=utf-8"),
    );
    (StatusCode::OK, headers, body)
}

fn append_metric_line(output: &mut String, name: &str, value: f64) {
    output.push_str(name);
    output.push(' ');
    output.push_str(&format!("{value}"));
    output.push('\n');
}

fn bool_to_metric_value(value: bool) -> f64 {
    if value {
        1.0
    } else {
        0.0
    }
}

fn ppm_to_ratio(ppm: f64) -> f64 {
    ppm / 1_000_000.0
}

fn quantile_ratio_from_ppm_samples(values: &[u64], quantile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    let q = quantile.clamp(0.0, 1.0);
    let index = ((sorted.len().saturating_sub(1)) as f64 * q).round() as usize;
    ppm_to_ratio(sorted[index] as f64)
}

fn model_error_ratio_stats(state: &AppState) -> Vec<InternalDebugBillingPreauthModelErrorStat> {
    let Ok(by_model) = state.billing_preauth_error_ratio_by_model_ppm.read() else {
        return Vec::new();
    };
    let mut stats = by_model
        .iter()
        .filter_map(|(model, samples)| {
            let values = samples.iter().copied().collect::<Vec<_>>();
            if values.is_empty() {
                return None;
            }
            let sum = values.iter().fold(0_f64, |acc, item| acc + *item as f64);
            let avg = ppm_to_ratio(sum / values.len() as f64);
            Some(InternalDebugBillingPreauthModelErrorStat {
                model: model.clone(),
                sample_count: values.len(),
                avg_ratio: avg,
                p50_ratio: quantile_ratio_from_ppm_samples(&values, 0.5),
                p95_ratio: quantile_ratio_from_ppm_samples(&values, 0.95),
            })
        })
        .collect::<Vec<_>>();
    stats.sort_by(|left, right| {
        right
            .sample_count
            .cmp(&left.sample_count)
            .then_with(|| left.model.cmp(&right.model))
    });
    if stats.len() > 10 {
        stats.truncate(10);
    }
    stats
}
