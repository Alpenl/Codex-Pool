fn build_upstream_models_url(base_url: &str, mode: &UpstreamMode) -> anyhow::Result<String> {
    let mut url = reqwest::Url::parse(base_url)?;
    let base_path = url.path().trim_end_matches('/').to_string();

    let target_path = match mode {
        UpstreamMode::ChatGptSession | UpstreamMode::CodexOauth => {
            if base_path.ends_with("/backend-api/codex") || base_path.ends_with("/v1") {
                format!("{base_path}/models")
            } else {
                format!("{base_path}/backend-api/codex/models")
            }
        }
        UpstreamMode::OpenAiApiKey => {
            if base_path.ends_with("/v1") {
                format!("{base_path}/models")
            } else {
                format!("{base_path}/v1/models")
            }
        }
    };

    url.set_path(&target_path);

    // ChatGPT backend-api /codex/models requires a `client_version` query
    // parameter, otherwise the server responds with 400. This mirrors the
    // same logic in data-plane (proxy.rs `ensure_client_version_query`).
    if matches!(mode, UpstreamMode::ChatGptSession | UpstreamMode::CodexOauth) {
        url.query_pairs_mut()
            .append_pair("client_version", env!("CARGO_PKG_VERSION"));
    }

    Ok(url.to_string())
}

fn build_upstream_responses_url(base_url: &str, mode: &UpstreamMode) -> anyhow::Result<String> {
    let mut url = reqwest::Url::parse(base_url)?;
    let base_path = url.path().trim_end_matches('/').to_string();

    let target_path = match mode {
        UpstreamMode::ChatGptSession | UpstreamMode::CodexOauth => {
            if base_path.ends_with("/backend-api/codex") || base_path.ends_with("/v1") {
                format!("{base_path}/responses")
            } else {
                format!("{base_path}/backend-api/codex/responses")
            }
        }
        UpstreamMode::OpenAiApiKey => {
            if base_path.ends_with("/v1") {
                format!("{base_path}/responses")
            } else {
                format!("{base_path}/v1/responses")
            }
        }
    };

    url.set_path(&target_path);
    Ok(url.to_string())
}

/// Normalise an upstream models response to the OpenAI `/v1/models` shape:
/// `{ "object": "list", "data": [{ "id", "object", "created", "owned_by" }] }`.
///
/// For `ChatGptSession`/`CodexOauth` the upstream returns
/// `{ "models": [{ "slug": "gpt-5.2-codex", ... }] }` — we map `slug` to `id`
/// and fill in sensible defaults for the missing standard fields.
///
/// For `OpenAiApiKey` the upstream already returns the standard format, so we
/// pass it through unchanged.
fn normalise_models_payload(payload: serde_json::Value, mode: &UpstreamMode) -> serde_json::Value {
    // Already in standard format — pass through.
    if payload.get("data").is_some() {
        return payload;
    }

    // ChatGPT backend-api format: { "models": [ { "slug": ..., ... } ] }
    let models = match payload.get("models").and_then(|v| v.as_array()) {
        Some(arr) => arr,
        None => return payload,
    };

    let provider = match mode {
        UpstreamMode::ChatGptSession => "chatgpt-session",
        UpstreamMode::CodexOauth => "codex-oauth",
        UpstreamMode::OpenAiApiKey => "openai",
    };

    let data: Vec<serde_json::Value> = models
        .iter()
        .map(|m| {
            let id = m
                .get("slug")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let visibility = m
                .get("visibility")
                .and_then(|value| value.as_str())
                .map(ToString::to_string);
            serde_json::json!({
                "id": id,
                "object": "model",
                "created": 0,
                "owned_by": provider,
                "visibility": visibility,
            })
        })
        .collect();

    serde_json::json!({
        "object": "list",
        "data": data,
    })
}

async fn fetch_data_plane_debug_state(
    data_plane_base_url: &str,
) -> (Option<serde_json::Value>, Option<String>) {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(client) => client,
        Err(err) => return (None, Some(format!("failed to build http client: {err}"))),
    };
    let base_url = data_plane_base_url.trim_end_matches('/');
    let health_url = format!("{base_url}/health");

    // Health endpoint is the source of truth for Data Plane availability.
    match client.get(&health_url).send().await {
        Ok(response) if response.status().is_success() => {}
        Ok(response) => return (None, Some(format!("health endpoint returned {}", response.status()))),
        Err(err) => return (None, Some(format!("health endpoint request failed: {err}"))),
    }

    // Debug endpoint is optional and may be disabled/protected in production.
    let debug_url = format!("{base_url}/internal/v1/debug/state");
    match client.get(debug_url).send().await {
        Ok(response) if response.status().is_success() => match response.json().await {
            Ok(value) => (Some(value), None),
            Err(err) => (None, Some(format!("failed to parse debug json: {err}"))),
        },
        Ok(_) => (None, None),
        Err(_) => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        build_upstream_responses_url, fetch_data_plane_debug_state, normalise_models_payload,
    };
    use axum::{routing::get, Router};
    use codex_pool_core::model::UpstreamMode;
    use serde_json::json;
    use tokio::net::TcpListener;

    async fn spawn_data_plane_like_server(enable_debug_state: bool) -> String {
        async fn health() -> axum::Json<serde_json::Value> {
            axum::Json(json!({"ok": true}))
        }

        async fn debug_state() -> axum::Json<serde_json::Value> {
            axum::Json(json!({
                "snapshot_revision": 7,
                "account_total": 2,
                "active_account_total": 2
            }))
        }

        let mut app = Router::new().route("/health", get(health));
        if enable_debug_state {
            app = app.route("/internal/v1/debug/state", get(debug_state));
        }

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{addr}")
    }

    async fn spawn_unhealthy_server() -> String {
        async fn health_fail() -> axum::http::StatusCode {
            axum::http::StatusCode::SERVICE_UNAVAILABLE
        }

        let app = Router::new().route("/health", get(health_fail));
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn debug_state_fetch_does_not_fail_when_debug_route_is_missing() {
        let base_url = spawn_data_plane_like_server(false).await;
        let (debug, error) = fetch_data_plane_debug_state(&base_url).await;
        assert!(error.is_none());
        assert!(debug.is_none());
    }

    #[tokio::test]
    async fn debug_state_fetch_returns_payload_when_debug_route_is_available() {
        let base_url = spawn_data_plane_like_server(true).await;
        let (debug, error) = fetch_data_plane_debug_state(&base_url).await;
        assert!(error.is_none());
        assert_eq!(debug.unwrap()["snapshot_revision"], 7);
    }

    #[tokio::test]
    async fn debug_state_fetch_reports_error_when_health_is_not_ready() {
        let base_url = spawn_unhealthy_server().await;
        let (debug, error) = fetch_data_plane_debug_state(&base_url).await;
        assert!(debug.is_none());
        assert!(error
            .unwrap_or_default()
            .contains("health endpoint returned 503 Service Unavailable"));
    }

    #[test]
    fn normalise_models_payload_keeps_hidden_models_and_visibility() {
        let payload = json!({
            "models": [
                { "slug": "gpt-5.2-codex", "visibility": "list" },
                { "slug": "gpt-5.1-codex", "visibility": "hide" }
            ]
        });

        let normalized = normalise_models_payload(payload, &UpstreamMode::CodexOauth);
        let data = normalized
            .get("data")
            .and_then(|value| value.as_array())
            .expect("normalized data array");
        assert_eq!(data.len(), 2);

        let hidden = data
            .iter()
            .find(|item| item.get("id").and_then(|value| value.as_str()) == Some("gpt-5.1-codex"))
            .expect("hidden model should be retained");
        assert_eq!(
            hidden.get("visibility").and_then(|value| value.as_str()),
            Some("hide")
        );
    }

    #[test]
    fn build_upstream_responses_url_for_codex_oauth_uses_responses_suffix() {
        let built = build_upstream_responses_url(
            "https://chatgpt.com/backend-api/codex",
            &UpstreamMode::CodexOauth,
        )
        .expect("url should build");
        assert_eq!(built, "https://chatgpt.com/backend-api/codex/responses");
    }
}

async fn create_oauth_import_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<OAuthImportJobSummary>, (StatusCode, Json<ErrorEnvelope>)> {
    let _principal = require_admin_principal(&state, &headers)?;
    let locale = i18n::locale_from_headers(&headers);

    let mut options = CreateOAuthImportJobOptions::default();
    let mut files = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(invalid_multipart_error)?
    {
        let field_name = field.name().unwrap_or_default().to_string();
        if matches!(field_name.as_str(), "file" | "files" | "files[]") {
            let file_name = field
                .file_name()
                .map(ToString::to_string)
                .unwrap_or_else(|| "uploaded.json".to_string());
            let bytes = field.bytes().await.map_err(invalid_multipart_error)?;
            files.push(ImportUploadFile {
                file_name,
                content: bytes,
            });
            continue;
        }

        let value = field.text().await.map_err(invalid_multipart_error)?;
        if value.trim().is_empty() {
            continue;
        }

        match field_name.as_str() {
            "base_url" => options.base_url = value,
            "default_priority" => {
                if let Ok(priority) = value.parse::<i32>() {
                    options.default_priority = priority;
                }
            }
            "default_enabled" => {
                if let Some(flag) = parse_bool_flag(&value) {
                    options.default_enabled = flag;
                }
            }
            "mode" | "default_mode" => {
                if let Some(mode) = parse_mode_flag(&value) {
                    options.default_mode = mode;
                }
            }
            _ => {}
        }
    }

    let summary = state
        .import_job_manager
        .create_job(files, options)
        .await
        .map_err(|err| internal_error_with_locale(locale, err))?;
    Ok(Json(summary))
}

fn map_oauth_import_job_error(
    locale: i18n::Locale,
    err: anyhow::Error,
) -> (StatusCode, Json<ErrorEnvelope>) {
    if err
        .to_string()
        .to_ascii_lowercase()
        .contains("job not found")
    {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorEnvelope::new(
                "not_found",
                locale.message("oauth import job not found", "未找到 OAuth 导入任务"),
            )),
        );
    }
    internal_error_with_locale(locale, err)
}

async fn get_oauth_import_job(
    Path(job_id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OAuthImportJobSummary>, (StatusCode, Json<ErrorEnvelope>)> {
    let _principal = require_admin_principal(&state, &headers)?;
    let locale = i18n::locale_from_headers(&headers);
    state
        .import_job_manager
        .job_summary(job_id)
        .await
        .map(Json)
        .map_err(|err| map_oauth_import_job_error(locale, err))
}

async fn list_oauth_import_job_items(
    Path(job_id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<OAuthImportJobItemsQuery>,
) -> Result<Json<OAuthImportJobItemsResponse>, (StatusCode, Json<ErrorEnvelope>)> {
    let _principal = require_admin_principal(&state, &headers)?;
    let locale = i18n::locale_from_headers(&headers);

    let status = query
        .status
        .as_deref()
        .map(parse_oauth_import_item_status)
        .transpose()?;
    let response = state
        .import_job_manager
        .job_items(job_id, status, query.cursor, query.limit.unwrap_or(200))
        .await
        .map_err(|err| map_oauth_import_job_error(locale, err))?;
    Ok(Json(response))
}

async fn retry_failed_oauth_import_items(
    Path(job_id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OAuthImportJobActionResponse>, (StatusCode, Json<ErrorEnvelope>)> {
    let _principal = require_admin_principal(&state, &headers)?;
    let locale = i18n::locale_from_headers(&headers);
    state
        .import_job_manager
        .retry_failed(job_id)
        .await
        .map(Json)
        .map_err(|err| map_oauth_import_job_error(locale, err))
}

async fn cancel_oauth_import_job(
    Path(job_id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OAuthImportJobActionResponse>, (StatusCode, Json<ErrorEnvelope>)> {
    let _principal = require_admin_principal(&state, &headers)?;
    let locale = i18n::locale_from_headers(&headers);
    state
        .import_job_manager
        .cancel_job(job_id)
        .await
        .map(Json)
        .map_err(|err| map_oauth_import_job_error(locale, err))
}
