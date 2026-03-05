const UPSTREAM_HEALTH_REDIS_PREFIX_ENV: &str = "CONTROL_PLANE_HEALTH_REDIS_PREFIX";
const DEFAULT_UPSTREAM_HEALTH_REDIS_PREFIX: &str = "codex_pool:health";
const UPSTREAM_HEALTH_ALIVE_RING_SIZE_ENV: &str = "CONTROL_PLANE_ALIVE_RING_SIZE";
const DEFAULT_UPSTREAM_HEALTH_ALIVE_RING_SIZE: usize = 5_000;
const UPSTREAM_SEEN_OK_MIN_WRITE_INTERVAL_SEC_ENV: &str =
    "CONTROL_PLANE_UPSTREAM_SEEN_OK_MIN_WRITE_INTERVAL_SEC";
const DEFAULT_UPSTREAM_SEEN_OK_MIN_WRITE_INTERVAL_SEC: i64 = 10;

#[derive(Clone)]
struct UpstreamAliveRingClient {
    client: redis::Client,
    key: String,
    max_size: i64,
}

impl UpstreamAliveRingClient {
    fn from_redis_url(redis_url: &str) -> Option<Self> {
        let client = redis::Client::open(redis_url).ok()?;
        let prefix = std::env::var(UPSTREAM_HEALTH_REDIS_PREFIX_ENV)
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| DEFAULT_UPSTREAM_HEALTH_REDIS_PREFIX.to_string());
        let max_size = std::env::var(UPSTREAM_HEALTH_ALIVE_RING_SIZE_ENV)
            .ok()
            .and_then(|raw| raw.parse::<usize>().ok())
            .unwrap_or(DEFAULT_UPSTREAM_HEALTH_ALIVE_RING_SIZE)
            .clamp(1, 100_000);
        Some(Self {
            client,
            key: format!("{prefix}:alive_ring:v1"),
            max_size: i64::try_from(max_size).unwrap_or(i64::MAX),
        })
    }

    async fn touch(&self, account_id: Uuid) -> anyhow::Result<()> {
        let mut conn = self
            .client
            .get_multiplexed_async_connection()
            .await
            .context("failed to connect redis for alive ring touch")?;
        let _: () = redis::pipe()
            .atomic()
            .cmd("LREM")
            .arg(&self.key)
            .arg(0)
            .arg(account_id.to_string())
            .ignore()
            .cmd("LPUSH")
            .arg(&self.key)
            .arg(account_id.to_string())
            .ignore()
            .cmd("LTRIM")
            .arg(&self.key)
            .arg(0)
            .arg(self.max_size - 1)
            .ignore()
            .query_async(&mut conn)
            .await
            .context("failed to update alive ring")?;
        Ok(())
    }
}

fn build_alive_ring_client_from_state(state: &AppState) -> Option<UpstreamAliveRingClient> {
    let redis_url = state
        .runtime_config
        .read()
        .ok()
        .and_then(|runtime| runtime.redis_url.clone())?;
    UpstreamAliveRingClient::from_redis_url(&redis_url)
}

fn upstream_seen_ok_min_write_interval_sec_from_env() -> i64 {
    std::env::var(UPSTREAM_SEEN_OK_MIN_WRITE_INTERVAL_SEC_ENV)
        .ok()
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(DEFAULT_UPSTREAM_SEEN_OK_MIN_WRITE_INTERVAL_SEC)
        .clamp(0, 3600)
}

#[derive(Debug, Serialize)]
struct InternalSeenOkResponse {
    ok: bool,
    accepted: bool,
    account_id: Uuid,
    seen_ok_at: DateTime<Utc>,
}

async fn internal_mark_upstream_account_seen_ok(
    Path(account_id): Path<Uuid>,
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<InternalSeenOkResponse>, (StatusCode, Json<ErrorEnvelope>)> {
    require_internal_service_token(&state, &headers)?;

    let seen_ok_at = Utc::now();
    let accepted = state
        .store
        .mark_account_seen_ok(
            account_id,
            seen_ok_at,
            upstream_seen_ok_min_write_interval_sec_from_env(),
        )
        .await
        .map_err(internal_error)?;

    if accepted {
        if let Some(alive_ring) = build_alive_ring_client_from_state(&state) {
            if let Err(err) = alive_ring.touch(account_id).await {
                tracing::warn!(
                    error = %err,
                    account_id = %account_id,
                    "failed to push seen_ok account into alive ring"
                );
            }
        }
    }

    Ok(Json(InternalSeenOkResponse {
        ok: true,
        accepted,
        account_id,
        seen_ok_at,
    }))
}
