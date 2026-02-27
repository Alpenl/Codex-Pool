use std::sync::LazyLock;

use anyhow::{anyhow, Context, Result};
use base64::Engine;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

const API_KEY_HMAC_KEYS_ENV: &str = "CONTROL_PLANE_API_KEY_HMAC_KEYS";
const API_KEY_HMAC_ALGO: &str = "hmac-sha256";
const TEST_FALLBACK_HMAC_KEY_ID: &str = "test";
const TEST_FALLBACK_HMAC_KEY_BYTES: [u8; 32] = [0x11; 32];

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
struct ApiKeyHmacKey {
    key_id: String,
    secret: Vec<u8>,
}

#[derive(Debug, Clone)]
struct ApiKeyTokenHasher {
    active: ApiKeyHmacKey,
    all: Vec<ApiKeyHmacKey>,
}

impl ApiKeyTokenHasher {
    fn from_env() -> Result<Self> {
        let raw = std::env::var(API_KEY_HMAC_KEYS_ENV).context(
            "CONTROL_PLANE_API_KEY_HMAC_KEYS is required (format: kid:base64_secret[,kid2:base64_secret2])",
        )?;
        Self::from_raw_keys(&raw)
    }

    fn from_raw_keys(raw: &str) -> Result<Self> {
        let mut keys = Vec::new();
        for item in raw
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
        {
            let (key_id, secret_b64) = item
                .split_once(':')
                .ok_or_else(|| anyhow!("invalid api-key hmac key entry: {item}"))?;
            let key_id = key_id.trim();
            if key_id.is_empty() {
                return Err(anyhow!("api-key hmac key id must not be empty"));
            }
            if !key_id
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
            {
                return Err(anyhow!(
                    "api-key hmac key id contains invalid characters: {key_id}"
                ));
            }
            let secret = base64::engine::general_purpose::STANDARD
                .decode(secret_b64.trim())
                .with_context(|| format!("failed to decode base64 secret for key id {key_id}"))?;
            if secret.len() < 32 {
                return Err(anyhow!(
                    "api-key hmac secret for key id {key_id} must be at least 32 bytes"
                ));
            }
            keys.push(ApiKeyHmacKey {
                key_id: key_id.to_string(),
                secret,
            });
        }
        let Some(active) = keys.first().cloned() else {
            return Err(anyhow!(
                "CONTROL_PLANE_API_KEY_HMAC_KEYS must contain at least one key"
            ));
        };
        Ok(Self { active, all: keys })
    }

    fn test_fallback() -> Self {
        let key = ApiKeyHmacKey {
            key_id: TEST_FALLBACK_HMAC_KEY_ID.to_string(),
            secret: TEST_FALLBACK_HMAC_KEY_BYTES.to_vec(),
        };
        Self {
            active: key.clone(),
            all: vec![key],
        }
    }

    fn hash_with_key(&self, key: &ApiKeyHmacKey, token: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(&key.secret).expect("hmac key must be valid");
        mac.update(token.as_bytes());
        let digest = mac.finalize().into_bytes();
        format!(
            "{}:{}:{}",
            API_KEY_HMAC_ALGO,
            key.key_id,
            hex::encode(digest)
        )
    }

    fn hash_active(&self, token: &str) -> String {
        self.hash_with_key(&self.active, token)
    }

    fn candidates(&self, token: &str) -> Vec<String> {
        let mut values = Vec::with_capacity(self.all.len() + 2);
        for key in &self.all {
            values.push(self.hash_with_key(key, token));
        }
        let legacy_sha256 = legacy_sha256_hash_api_key_token(token);
        if !values.iter().any(|item| item == &legacy_sha256) {
            values.push(legacy_sha256);
        }
        if !values.iter().any(|item| item == token) {
            values.push(token.to_string());
        }
        values
    }
}

static API_KEY_TOKEN_HASHER: LazyLock<ApiKeyTokenHasher> = LazyLock::new(|| {
    match ApiKeyTokenHasher::from_env() {
        Ok(hasher) => hasher,
        Err(err) => {
            if cfg!(test) {
                tracing::warn!(
                    error = %err,
                    "CONTROL_PLANE_API_KEY_HMAC_KEYS not set in tests, using fallback key"
                );
                ApiKeyTokenHasher::test_fallback()
            } else {
                panic!(
                    "failed to initialize api key hasher: {err}. set CONTROL_PLANE_API_KEY_HMAC_KEYS (format: kid:base64_secret[,kid2:base64_secret2])"
                );
            }
        }
    }
});

pub fn ensure_api_key_hasher_configured() -> Result<()> {
    ApiKeyTokenHasher::from_env().map(|_| ())
}

pub fn hash_api_key_token(token: &str) -> String {
    API_KEY_TOKEN_HASHER.hash_active(token)
}

pub fn api_key_token_hash_candidates(token: &str) -> Vec<String> {
    API_KEY_TOKEN_HASHER.candidates(token)
}

pub fn legacy_sha256_hash_api_key_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}
