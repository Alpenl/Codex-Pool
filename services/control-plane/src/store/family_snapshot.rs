impl InMemoryStore {
    fn set_oauth_family_enabled_inner(
        &self,
        account_id: Uuid,
        enabled: bool,
    ) -> Result<OAuthFamilyActionResponse> {
        let provider = self.account_auth_provider(account_id);
        if provider != UpstreamAuthProvider::OAuthRefreshToken {
            return Err(anyhow!("account is not an oauth account"));
        }

        let credentials = self.oauth_credentials.read().unwrap();
        let target = credentials
            .get(&account_id)
            .ok_or_else(|| anyhow!("oauth credential not found"))?;
        let family_id = target.token_family_id.clone();
        drop(credentials);

        let affected = self.disable_or_enable_oauth_family(&family_id, enabled);
        if affected > 0 {
            self.revision.fetch_add(1, Ordering::Relaxed);
        }

        Ok(OAuthFamilyActionResponse {
            account_id,
            token_family_id: Some(family_id),
            enabled,
            affected_accounts: affected as u64,
        })
    }

    fn disable_oauth_family_inner(&self, family_id: &str) {
        let affected = self.disable_or_enable_oauth_family(family_id, false);
        if affected > 0 {
            self.revision.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn disable_or_enable_oauth_family(&self, family_id: &str, enabled: bool) -> usize {
        let account_ids = {
            let credentials = self.oauth_credentials.read().unwrap();
            credentials
                .iter()
                .filter_map(|(account_id, credential)| {
                    if credential.token_family_id == family_id {
                        Some(*account_id)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        };

        if account_ids.is_empty() {
            return 0;
        }

        if enabled {
            let mut credentials = self.oauth_credentials.write().unwrap();
            for account_id in &account_ids {
                if let Some(credential) = credentials.get_mut(account_id) {
                    credential.refresh_reused_detected = false;
                    credential.refresh_backoff_until = None;
                }
            }
        }

        let mut affected = 0_usize;
        let mut accounts = self.accounts.write().unwrap();
        for account_id in account_ids {
            if let Some(account) = accounts.get_mut(&account_id) {
                if account.enabled != enabled {
                    account.enabled = enabled;
                    affected = affected.saturating_add(1);
                }
            }
        }
        affected
    }

    fn snapshot_inner(&self) -> Result<DataPlaneSnapshot> {
        self.purge_expired_one_time_accounts_inner();
        let providers = self.account_auth_providers.read().unwrap().clone();
        let oauth_credentials = self.oauth_credentials.read().unwrap().clone();
        let mut accounts = self.list_upstream_accounts_inner();

        for account in &mut accounts {
            let provider = providers
                .get(&account.id)
                .cloned()
                .unwrap_or(UpstreamAuthProvider::LegacyBearer);
            if provider != UpstreamAuthProvider::OAuthRefreshToken {
                continue;
            }

            let Some(credential) = oauth_credentials.get(&account.id) else {
                account.enabled = false;
                account.bearer_token.clear();
                continue;
            };

            if credential.token_expires_at <= Utc::now() + Duration::seconds(OAUTH_MIN_VALID_SEC) {
                account.enabled = false;
            }

            if let Some(cipher) = &self.credential_cipher {
                match cipher.decrypt(&credential.access_token_enc) {
                    Ok(access_token) => account.bearer_token = access_token,
                    Err(_) => {
                        account.enabled = false;
                        account.bearer_token.clear();
                    }
                }
            } else {
                account.enabled = false;
                account.bearer_token.clear();
            }
        }

        Ok(DataPlaneSnapshot {
            revision: self.revision.load(Ordering::Relaxed),
            cursor: 0,
            accounts,
            issued_at: Utc::now(),
        })
    }
}

include!("trait_impl.rs");
