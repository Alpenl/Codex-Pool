use data_plane::app::build_app;
use data_plane::config::DataPlaneConfig;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = DataPlaneConfig::from_env()?;
    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    let app = build_app(config).await?;

    axum::serve(listener, app).await?;
    Ok(())
}
