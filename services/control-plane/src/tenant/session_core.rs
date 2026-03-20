impl TenantAuthService {
    pub fn from_pool(pool: PgPool) -> Result<Self> {
        let jwt_secret = std::env::var("TENANT_JWT_SECRET")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .or_else(|| {
                std::env::var("ADMIN_JWT_SECRET")
                    .ok()
                    .filter(|v| !v.trim().is_empty())
            })
            .ok_or_else(|| {
                anyhow!("TENANT_JWT_SECRET (or ADMIN_JWT_SECRET fallback) must be set")
            })?;
        let token_ttl_sec = std::env::var("TENANT_JWT_TTL_SEC")
            .ok()
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or(DEFAULT_TENANT_JWT_TTL_SEC)
            .max(60);
        let session_cookie_name = std::env::var("TENANT_SESSION_COOKIE_NAME")
            .ok()
            .map(|raw| raw.trim().to_string())
            .filter(|raw| !raw.is_empty())
            .unwrap_or_else(|| DEFAULT_TENANT_SESSION_COOKIE_NAME.to_string());
        let session_cookie_secure = parse_bool_env("TENANT_SESSION_COOKIE_SECURE").unwrap_or(false);
        #[cfg(feature = "smtp-backend")]
        let expose_debug_code = parse_bool_env("TENANT_AUTH_DEBUG_EXPOSE_CODE").unwrap_or(false);
        let login_rate_limit_window_sec = std::env::var("TENANT_AUTH_LOGIN_RATE_LIMIT_WINDOW_SEC")
            .ok()
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or(DEFAULT_LOGIN_RATE_LIMIT_WINDOW_SEC)
            .max(10);
        let login_rate_limit_max_attempts =
            std::env::var("TENANT_AUTH_LOGIN_RATE_LIMIT_MAX_ATTEMPTS")
                .ok()
                .and_then(|raw| raw.parse::<usize>().ok())
                .unwrap_or(DEFAULT_LOGIN_RATE_LIMIT_MAX_ATTEMPTS)
                .max(1);

        Ok(Self {
            pool,
            token_ttl_sec,
            encoding_key: EncodingKey::from_secret(jwt_secret.as_bytes()),
            decoding_key: DecodingKey::from_secret(jwt_secret.as_bytes()),
            session_cookie_name,
            session_cookie_secure,
            #[cfg(feature = "smtp-backend")]
            expose_debug_code,
            login_rate_limit_window: StdDuration::from_secs(login_rate_limit_window_sec),
            login_rate_limit_max_attempts,
            login_attempts: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        })
    }

    pub fn build_session_cookie(&self, token: &str) -> String {
        let secure = if self.session_cookie_secure {
            "; Secure"
        } else {
            ""
        };
        format!(
            "{}={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}{}",
            self.session_cookie_name, token, self.token_ttl_sec, secure
        )
    }

    pub fn build_session_clear_cookie(&self) -> String {
        let secure = if self.session_cookie_secure {
            "; Secure"
        } else {
            ""
        };
        format!(
            "{}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{}",
            self.session_cookie_name, secure
        )
    }

    pub fn extract_cookie_token(&self, headers: &axum::http::HeaderMap) -> Option<String> {
        let cookie_header = headers
            .get(axum::http::header::COOKIE)
            .and_then(|value| value.to_str().ok())?;
        for cookie in cookie_header.split(';') {
            let mut parts = cookie.trim().splitn(2, '=');
            let key = parts.next()?.trim();
            let value = parts.next()?.trim();
            if key == self.session_cookie_name {
                return Some(value.to_string());
            }
        }
        None
    }

    pub fn verify_bearer_header(&self, authorization: Option<&str>) -> Result<TenantPrincipal> {
        let header = authorization.ok_or_else(|| anyhow!("missing authorization header"))?;
        let token = header
            .strip_prefix("Bearer ")
            .or_else(|| header.strip_prefix("bearer "))
            .ok_or_else(|| anyhow!("invalid authorization header"))?;
        self.verify_token(token)
    }

    pub fn verify_token(&self, token: &str) -> Result<TenantPrincipal> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;
        let data = decode::<TenantClaims>(token, &self.decoding_key, &validation)
            .context("failed to decode tenant jwt")?;
        let user_id = Uuid::parse_str(&data.claims.sub).context("invalid tenant user id in jwt")?;
        let tenant_id =
            Uuid::parse_str(&data.claims.tenant_id).context("invalid tenant id in jwt")?;
        let impersonated_admin_user_id = data
            .claims
            .impersonated_admin_user_id
            .as_deref()
            .map(Uuid::parse_str)
            .transpose()
            .context("invalid impersonated admin id in jwt")?;
        let impersonation_session_id = data
            .claims
            .impersonation_session_id
            .as_deref()
            .map(Uuid::parse_str)
            .transpose()
            .context("invalid impersonation session id in jwt")?;
        if impersonated_admin_user_id.is_some() && impersonation_session_id.is_none() {
            return Err(anyhow!(
                "impersonation session id is required for impersonated token"
            ));
        }
        Ok(TenantPrincipal {
            user_id,
            tenant_id,
            email: data.claims.email,
            impersonated_admin_user_id,
            impersonation_session_id,
            impersonation_reason: data.claims.impersonation_reason,
        })
    }

    pub fn me(&self, principal: &TenantPrincipal) -> TenantMeResponse {
        TenantMeResponse {
            tenant_id: principal.tenant_id,
            user_id: principal.user_id,
            email: principal.email.clone(),
            impersonated: principal.impersonated_admin_user_id.is_some(),
            impersonation_reason: principal.impersonation_reason.clone(),
        }
    }

    pub async fn ensure_principal_active(&self, principal: &TenantPrincipal) -> Result<()> {
        let Some(admin_user_id) = principal.impersonated_admin_user_id else {
            return Ok(());
        };
        let session_id = principal
            .impersonation_session_id
            .ok_or_else(|| anyhow!("impersonation session id missing in principal"))?;
        let row = sqlx::query(
            r#"
            SELECT admin_user_id, tenant_id, expires_at
            FROM admin_impersonation_sessions
            WHERE id = $1
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await
        .context("failed to load impersonation session")?
        .ok_or_else(|| anyhow!("impersonation session does not exist or has been revoked"))?;
        let db_admin_user_id: Uuid = row.try_get("admin_user_id")?;
        let db_tenant_id: Uuid = row.try_get("tenant_id")?;
        let expires_at: DateTime<Utc> = row.try_get("expires_at")?;
        if db_admin_user_id != admin_user_id || db_tenant_id != principal.tenant_id {
            return Err(anyhow!("impersonation session does not match token claims"));
        }
        if expires_at <= Utc::now() {
            return Err(anyhow!("impersonation session has expired"));
        }
        Ok(())
    }

    pub async fn login(
        &self,
        req: TenantLoginRequest,
        request_ip: Option<&str>,
    ) -> Result<Option<TenantLoginResponse>> {
        let email = normalize_email(&req.email)?;
        if self.is_rate_limited(&email, request_ip).await {
            return Ok(None);
        }

        let row = sqlx::query(
            r#"
            SELECT id, tenant_id, email, password_hash, email_verified, enabled
            FROM tenant_users
            WHERE email = $1
            "#,
        )
        .bind(&email)
        .fetch_optional(&self.pool)
        .await
        .context("failed to query tenant user for login")?;

        let Some(row) = row else {
            self.record_login_failure(&email, request_ip).await;
            return Ok(None);
        };

        let enabled: bool = row.try_get("enabled")?;
        let email_verified: bool = row.try_get("email_verified")?;
        if !enabled || !email_verified {
            self.record_login_failure(&email, request_ip).await;
            return Ok(None);
        }

        let password_hash: String = row.try_get("password_hash")?;
        if !verify(req.password, &password_hash).context("failed to verify tenant password")? {
            self.record_login_failure(&email, request_ip).await;
            return Ok(None);
        }

        let user_id: Uuid = row.try_get("id")?;
        let tenant_id: Uuid = row.try_get("tenant_id")?;
        let email: String = row.try_get("email")?;
        let token = self.issue_token(user_id, tenant_id, &email, None, None, None)?;
        let now = Utc::now();

        sqlx::query(
            r#"
            UPDATE tenant_users
            SET last_login_at = $2, updated_at = $2
            WHERE id = $1
            "#,
        )
        .bind(user_id)
        .bind(now)
        .execute(&self.pool)
        .await
        .context("failed to update tenant user last_login_at")?;
        self.clear_login_failures(&email, request_ip).await;

        Ok(Some(TenantLoginResponse {
            access_token: token,
            token_type: "Bearer".to_string(),
            expires_in: self.token_ttl_sec,
            tenant_id,
            user_id,
            email,
        }))
    }
}
