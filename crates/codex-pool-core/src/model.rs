use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tenant {
    pub id: Uuid,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ApiKey {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub key_hash: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpstreamMode {
    #[serde(alias = "openai", alias = "api_key")]
    OpenAiApiKey,
    #[serde(alias = "chat_gpt_oauth", alias = "chatgpt", alias = "chatgpt_oauth")]
    ChatGptSession,
    #[serde(alias = "codex_session", alias = "codex")]
    CodexOauth,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum UpstreamAuthProvider {
    LegacyBearer,
    #[serde(rename = "oauth_refresh_token")]
    OAuthRefreshToken,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct UpstreamAccount {
    pub id: Uuid,
    pub label: String,
    pub mode: UpstreamMode,
    pub base_url: String,
    pub bearer_token: String,
    pub chatgpt_account_id: Option<String>,
    pub enabled: bool,
    pub priority: i32,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RoutingStrategy {
    RoundRobin,
    FillFirst,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoutingPolicy {
    pub tenant_id: Uuid,
    pub strategy: RoutingStrategy,
    pub max_retries: u32,
    pub stream_max_retries: u32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccountHealthStatus {
    Healthy,
    Degraded,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AccountHealth {
    pub account_id: Uuid,
    pub status: AccountHealthStatus,
    pub reason: Option<String>,
    pub updated_at: DateTime<Utc>,
}
