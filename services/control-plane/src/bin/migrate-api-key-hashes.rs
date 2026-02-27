use anyhow::{Context, Result};
use control_plane::store::postgres::PostgresStore;
use tracing_subscriber::EnvFilter;

const BATCH_SIZE_ENV: &str = "CONTROL_PLANE_API_KEY_HASH_MIGRATION_BATCH_SIZE";
const DEFAULT_BATCH_SIZE: usize = 500;
const MIN_BATCH_SIZE: usize = 1;
const MAX_BATCH_SIZE: usize = 10_000;

fn batch_size_from_env() -> usize {
    std::env::var(BATCH_SIZE_ENV)
        .ok()
        .and_then(|raw| raw.parse::<usize>().ok())
        .unwrap_or(DEFAULT_BATCH_SIZE)
        .clamp(MIN_BATCH_SIZE, MAX_BATCH_SIZE)
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    control_plane::security::ensure_api_key_hasher_configured()?;
    let database_url = std::env::var("CONTROL_PLANE_DATABASE_URL")
        .ok()
        .or_else(|| std::env::var("DATABASE_URL").ok())
        .context("CONTROL_PLANE_DATABASE_URL (or DATABASE_URL) is required")?;
    let batch_size = batch_size_from_env();

    let store = PostgresStore::connect(&database_url).await?;
    let migrated = store
        .migrate_legacy_plaintext_api_key_tokens(batch_size)
        .await?;

    tracing::info!(migrated, batch_size, "api key hash migration completed");
    println!("migrated_plaintext_api_key_tokens={migrated}");
    Ok(())
}
