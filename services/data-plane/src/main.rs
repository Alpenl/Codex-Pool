use data_plane::app::build_app;
use data_plane::config::DataPlaneConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    codex_pool_core::logging::init_local_tracing();

    let config = DataPlaneConfig::from_env()?;
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    let app = build_app(config).await?;

    axum::serve(listener, app).await?;
    Ok(())
}
