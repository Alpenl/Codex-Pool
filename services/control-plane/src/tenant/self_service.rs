#[cfg(feature = "smtp-backend")]
impl TenantAuthService {
    pub async fn register(&self, req: TenantRegisterRequest) -> Result<TenantRegisterResponse> {
        let tenant_name = req.tenant_name.trim();
        if tenant_name.is_empty() {
            return Err(anyhow!("tenant_name must not be empty"));
        }
        let email = normalize_email(&req.email)?;
        validate_password(&req.password)?;
        let password_hash = hash(&req.password, DEFAULT_COST).context("failed to hash password")?;
        let now = Utc::now();

        let tenant_id = Uuid::new_v4();
        let tenant_user_id = Uuid::new_v4();
        let code = generate_email_code();
        let code_hash = sha256_hex(&code);

        let mut tx = self
            .pool
            .begin()
            .await
            .context("failed to start register transaction")?;
        sqlx::query(
            r#"
            INSERT INTO tenants (id, name, status, plan, expires_at, created_at, updated_at)
            VALUES ($1, $2, 'active', 'credit', NULL, $3, $3)
            "#,
        )
        .bind(tenant_id)
        .bind(tenant_name)
        .bind(now)
        .execute(tx.as_mut())
        .await
        .context("failed to create tenant")?;

        sqlx::query(
            r#"
            INSERT INTO tenant_users (id, tenant_id, email, password_hash, email_verified, enabled, created_at, updated_at)
            VALUES ($1, $2, $3, $4, false, true, $5, $5)
            "#,
        )
        .bind(tenant_user_id)
        .bind(tenant_id)
        .bind(&email)
        .bind(password_hash)
        .bind(now)
        .execute(tx.as_mut())
        .await
        .context("failed to create tenant user")?;

        sqlx::query(
            r#"
            INSERT INTO tenant_credit_accounts (tenant_id, balance_microcredits, updated_at)
            VALUES ($1, 0, $2)
            "#,
        )
        .bind(tenant_id)
        .bind(now)
        .execute(tx.as_mut())
        .await
        .context("failed to initialize tenant credit account")?;

        self.insert_code_inner(
            &mut tx,
            InsertCodeParams {
                tenant_id,
                tenant_user_id,
                purpose: CODE_PURPOSE_EMAIL_VERIFY,
                code_hash: &code_hash,
                expires_at: now + chrono::Duration::minutes(15),
                now,
            },
        )
        .await?;

        tx.commit()
            .await
            .context("failed to commit register transaction")?;

        self.dispatch_email_code(&email, CODE_PURPOSE_EMAIL_VERIFY, &code)
            .await;

        Ok(TenantRegisterResponse {
            tenant_id,
            user_id: tenant_user_id,
            requires_email_verification: true,
            debug_code: self.expose_debug_code.then_some(code),
        })
    }

    pub async fn verify_email(&self, req: TenantVerifyEmailRequest) -> Result<()> {
        let email = normalize_email(&req.email)?;
        let code_hash = sha256_hex(req.code.trim());
        let now = Utc::now();
        let mut tx = self
            .pool
            .begin()
            .await
            .context("failed to start email verification transaction")?;
        let row = sqlx::query(
            r#"
            SELECT id, tenant_id
            FROM tenant_users
            WHERE email = $1
            "#,
        )
        .bind(&email)
        .fetch_optional(tx.as_mut())
        .await
        .context("failed to query tenant user by email")?
        .ok_or_else(|| anyhow!("email or code is invalid"))?;
        let tenant_user_id: Uuid = row.try_get("id")?;
        self.consume_code_inner(
            &mut tx,
            tenant_user_id,
            CODE_PURPOSE_EMAIL_VERIFY,
            &code_hash,
            now,
        )
        .await?;

        sqlx::query(
            r#"
            UPDATE tenant_users
            SET email_verified = true, updated_at = $2
            WHERE id = $1
            "#,
        )
        .bind(tenant_user_id)
        .bind(now)
        .execute(tx.as_mut())
        .await
        .context("failed to set tenant user email_verified")?;

        sqlx::query(
            r#"
            UPDATE tenants
            SET updated_at = $2
            WHERE id = $1
            "#,
        )
        .bind(row.try_get::<Uuid, _>("tenant_id")?)
        .bind(now)
        .execute(tx.as_mut())
        .await
        .context("failed to update tenant updated_at after email verify")?;

        tx.commit()
            .await
            .context("failed to commit email verification transaction")?;
        Ok(())
    }

    pub async fn forgot_password(
        &self,
        req: TenantForgotPasswordRequest,
    ) -> Result<Option<String>> {
        let email = normalize_email(&req.email)?;
        let row = sqlx::query(
            r#"
            SELECT id, tenant_id
            FROM tenant_users
            WHERE email = $1 AND enabled = true
            "#,
        )
        .bind(&email)
        .fetch_optional(&self.pool)
        .await
        .context("failed to query tenant user for forgot password")?;
        let Some(row) = row else {
            return Ok(None);
        };
        let tenant_user_id: Uuid = row.try_get("id")?;
        let tenant_id: Uuid = row.try_get("tenant_id")?;
        let code = generate_email_code();
        let code_hash = sha256_hex(&code);
        let now = Utc::now();
        let mut tx = self
            .pool
            .begin()
            .await
            .context("failed to start forgot password transaction")?;
        self.insert_code_inner(
            &mut tx,
            InsertCodeParams {
                tenant_id,
                tenant_user_id,
                purpose: CODE_PURPOSE_PASSWORD_RESET,
                code_hash: &code_hash,
                expires_at: now + chrono::Duration::minutes(10),
                now,
            },
        )
        .await?;
        tx.commit()
            .await
            .context("failed to commit forgot password transaction")?;
        self.dispatch_email_code(&email, CODE_PURPOSE_PASSWORD_RESET, &code)
            .await;
        Ok(self.expose_debug_code.then_some(code))
    }

    pub async fn reset_password(&self, req: TenantResetPasswordRequest) -> Result<()> {
        let email = normalize_email(&req.email)?;
        validate_password(&req.new_password)?;
        let code_hash = sha256_hex(req.code.trim());
        let now = Utc::now();
        let new_password_hash =
            hash(&req.new_password, DEFAULT_COST).context("failed to hash new password")?;

        let mut tx = self
            .pool
            .begin()
            .await
            .context("failed to start reset password transaction")?;
        let row = sqlx::query(
            r#"
            SELECT id
            FROM tenant_users
            WHERE email = $1 AND enabled = true
            "#,
        )
        .bind(&email)
        .fetch_optional(tx.as_mut())
        .await
        .context("failed to query tenant user for password reset")?
        .ok_or_else(|| anyhow!("email or code is invalid"))?;
        let tenant_user_id: Uuid = row.try_get("id")?;
        self.consume_code_inner(
            &mut tx,
            tenant_user_id,
            CODE_PURPOSE_PASSWORD_RESET,
            &code_hash,
            now,
        )
        .await?;
        sqlx::query(
            r#"
            UPDATE tenant_users
            SET password_hash = $2, updated_at = $3
            WHERE id = $1
            "#,
        )
        .bind(tenant_user_id)
        .bind(new_password_hash)
        .bind(now)
        .execute(tx.as_mut())
        .await
        .context("failed to update tenant user password")?;
        tx.commit()
            .await
            .context("failed to commit reset password transaction")?;
        Ok(())
    }
}

#[cfg(not(feature = "smtp-backend"))]
impl TenantAuthService {
    pub async fn register(&self, _req: TenantRegisterRequest) -> Result<TenantRegisterResponse> {
        Err(anyhow!(
            "tenant self-service requires the smtp-backend cargo feature"
        ))
    }

    pub async fn verify_email(&self, _req: TenantVerifyEmailRequest) -> Result<()> {
        Err(anyhow!(
            "tenant self-service requires the smtp-backend cargo feature"
        ))
    }

    pub async fn forgot_password(
        &self,
        _req: TenantForgotPasswordRequest,
    ) -> Result<Option<String>> {
        Err(anyhow!(
            "tenant self-service requires the smtp-backend cargo feature"
        ))
    }

    pub async fn reset_password(&self, _req: TenantResetPasswordRequest) -> Result<()> {
        Err(anyhow!(
            "tenant self-service requires the smtp-backend cargo feature"
        ))
    }
}
