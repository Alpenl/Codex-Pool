use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

pub const CREDENTIALS_ENCRYPTION_KEY_ENV: &str = "CREDENTIALS_ENCRYPTION_KEY";
const CIPHERTEXT_VERSION_PREFIX: &str = "v1";

#[derive(Clone)]
pub struct CredentialCipher {
    cipher: Aes256Gcm,
}

impl CredentialCipher {
    pub fn from_env() -> Result<Option<Self>> {
        let Some(raw) = std::env::var(CREDENTIALS_ENCRYPTION_KEY_ENV).ok() else {
            return Ok(None);
        };

        let cipher = Self::from_base64_key(&raw)?;
        Ok(Some(cipher))
    }

    pub fn from_base64_key(raw: &str) -> Result<Self> {
        let key_bytes = STANDARD
            .decode(raw)
            .context("failed to decode base64 encryption key")?;
        if key_bytes.len() != 32 {
            return Err(anyhow!(
                "invalid encryption key length: expected 32 bytes after base64 decode"
            ));
        }

        let cipher = Aes256Gcm::new_from_slice(&key_bytes)
            .context("failed to initialize AES-256-GCM cipher")?;
        Ok(Self { cipher })
    }

    pub fn encrypt(&self, plaintext: &str) -> Result<String> {
        let mut nonce = [0_u8; 12];
        rand::fill(&mut nonce);
        let nonce_ref = Nonce::from_slice(&nonce);
        let ciphertext = self
            .cipher
            .encrypt(nonce_ref, plaintext.as_bytes())
            .map_err(|_| anyhow!("failed to encrypt credential"))?;

        Ok(format!(
            "{CIPHERTEXT_VERSION_PREFIX}:{}:{}",
            STANDARD.encode(nonce),
            STANDARD.encode(ciphertext)
        ))
    }

    pub fn decrypt(&self, encrypted: &str) -> Result<String> {
        let mut parts = encrypted.splitn(3, ':');
        let version = parts.next().unwrap_or_default();
        if version != CIPHERTEXT_VERSION_PREFIX {
            return Err(anyhow!("unsupported ciphertext version"));
        }

        let nonce = STANDARD
            .decode(parts.next().ok_or_else(|| anyhow!("missing nonce"))?)
            .context("failed to decode nonce")?;
        if nonce.len() != 12 {
            return Err(anyhow!("invalid nonce length"));
        }

        let ciphertext = STANDARD
            .decode(parts.next().ok_or_else(|| anyhow!("missing ciphertext"))?)
            .context("failed to decode ciphertext")?;

        let nonce_ref = Nonce::from_slice(&nonce);
        let plaintext = self
            .cipher
            .decrypt(nonce_ref, ciphertext.as_ref())
            .map_err(|_| anyhow!("failed to decrypt credential"))?;

        String::from_utf8(plaintext).context("decrypted credential is not valid UTF-8")
    }
}

#[cfg(test)]
mod tests {
    use super::CredentialCipher;
    use base64::Engine;

    #[test]
    fn encrypt_and_decrypt_roundtrip() {
        let key = base64::engine::general_purpose::STANDARD.encode([7_u8; 32]);
        let cipher = CredentialCipher::from_base64_key(&key).expect("cipher init");
        let encrypted = cipher.encrypt("rt-secret").expect("encrypt");
        let decrypted = cipher.decrypt(&encrypted).expect("decrypt");
        assert_eq!(decrypted, "rt-secret");
    }

    #[test]
    fn decrypt_rejects_unknown_version() {
        let key = base64::engine::general_purpose::STANDARD.encode([9_u8; 32]);
        let cipher = CredentialCipher::from_base64_key(&key).expect("cipher init");
        let err = cipher
            .decrypt("v2:YWJj:ZGVm")
            .expect_err("unknown version must fail");
        assert!(err.to_string().contains("unsupported ciphertext version"));
    }
}
