const AI_ERROR_LEARNING_SETTINGS_SINGLETON_ROW: bool = true;

impl PostgresStore {
    async fn load_upstream_error_learning_settings_inner(&self) -> Result<AiErrorLearningSettings> {
        let row = sqlx::query(
            r#"
            SELECT
                enabled,
                first_seen_timeout_ms,
                review_hit_threshold,
                updated_at
            FROM upstream_error_learning_settings
            WHERE singleton = $1
            "#,
        )
        .bind(AI_ERROR_LEARNING_SETTINGS_SINGLETON_ROW)
        .fetch_optional(&self.pool)
        .await
        .context("failed to load upstream error learning settings")?;

        let Some(row) = row else {
            return Ok(AiErrorLearningSettings::default());
        };

        Ok(AiErrorLearningSettings {
            enabled: row.try_get("enabled")?,
            first_seen_timeout_ms: u64::try_from(
                row.try_get::<i64, _>("first_seen_timeout_ms")?,
            )
            .context("upstream error learning timeout must be non-negative")?,
            review_hit_threshold: u32::try_from(
                row.try_get::<i32, _>("review_hit_threshold")?,
            )
            .context("upstream error learning threshold must be non-negative")?,
            updated_at: Some(row.try_get("updated_at")?),
        })
    }

    async fn update_upstream_error_learning_settings_inner(
        &self,
        req: UpdateAiErrorLearningSettingsRequest,
    ) -> Result<AiErrorLearningSettings> {
        let updated_at = Utc::now();
        let mut tx = self
            .pool
            .begin()
            .await
            .context("failed to start upstream error learning settings transaction")?;

        sqlx::query(
            r#"
            INSERT INTO upstream_error_learning_settings (
                singleton,
                enabled,
                first_seen_timeout_ms,
                review_hit_threshold,
                updated_at
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (singleton) DO UPDATE
            SET
                enabled = EXCLUDED.enabled,
                first_seen_timeout_ms = EXCLUDED.first_seen_timeout_ms,
                review_hit_threshold = EXCLUDED.review_hit_threshold,
                updated_at = EXCLUDED.updated_at
            "#,
        )
        .bind(AI_ERROR_LEARNING_SETTINGS_SINGLETON_ROW)
        .bind(req.enabled)
        .bind(i64::try_from(req.first_seen_timeout_ms).context(
            "upstream error learning timeout does not fit into postgres BIGINT",
        )?)
        .bind(i32::try_from(req.review_hit_threshold).context(
            "upstream error learning threshold does not fit into postgres INTEGER",
        )?)
        .bind(updated_at)
        .execute(tx.as_mut())
        .await
        .context("failed to update upstream error learning settings")?;

        self.bump_revision_tx(&mut tx).await?;
        self.append_data_plane_outbox_event_tx(
            &mut tx,
            DataPlaneSnapshotEventType::RoutingPlanRefresh,
            Uuid::nil(),
        )
        .await?;
        tx.commit()
            .await
            .context("failed to commit upstream error learning settings transaction")?;

        Ok(AiErrorLearningSettings {
            enabled: req.enabled,
            first_seen_timeout_ms: req.first_seen_timeout_ms,
            review_hit_threshold: req.review_hit_threshold,
            updated_at: Some(updated_at),
        })
    }

    async fn list_upstream_error_templates_inner(
        &self,
        status: Option<UpstreamErrorTemplateStatus>,
    ) -> Result<Vec<UpstreamErrorTemplateRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                fingerprint,
                provider,
                normalized_status_code,
                semantic_error_code,
                action,
                retry_scope,
                status,
                templates_json::text AS templates_json_text,
                representative_samples_json::text AS representative_samples_json_text,
                hit_count,
                first_seen_at,
                last_seen_at,
                updated_at
            FROM upstream_error_templates
            WHERE ($1::text IS NULL OR status = $1)
            ORDER BY last_seen_at DESC, updated_at DESC
            "#,
        )
        .bind(status.map(|item| upstream_error_template_status_to_db(&item)))
        .fetch_all(&self.pool)
        .await
        .context("failed to list upstream error templates")?;

        rows.iter().map(parse_upstream_error_template_row).collect()
    }

    async fn load_upstream_error_template_by_id_inner(
        &self,
        template_id: Uuid,
    ) -> Result<Option<UpstreamErrorTemplateRecord>> {
        let row = sqlx::query(
            r#"
            SELECT
                id,
                fingerprint,
                provider,
                normalized_status_code,
                semantic_error_code,
                action,
                retry_scope,
                status,
                templates_json::text AS templates_json_text,
                representative_samples_json::text AS representative_samples_json_text,
                hit_count,
                first_seen_at,
                last_seen_at,
                updated_at
            FROM upstream_error_templates
            WHERE id = $1
            "#,
        )
        .bind(template_id)
        .fetch_optional(&self.pool)
        .await
        .context("failed to load upstream error template by id")?;

        row.as_ref()
            .map(parse_upstream_error_template_row)
            .transpose()
    }

    async fn load_upstream_error_template_by_fingerprint_inner(
        &self,
        fingerprint: &str,
    ) -> Result<Option<UpstreamErrorTemplateRecord>> {
        let row = sqlx::query(
            r#"
            SELECT
                id,
                fingerprint,
                provider,
                normalized_status_code,
                semantic_error_code,
                action,
                retry_scope,
                status,
                templates_json::text AS templates_json_text,
                representative_samples_json::text AS representative_samples_json_text,
                hit_count,
                first_seen_at,
                last_seen_at,
                updated_at
            FROM upstream_error_templates
            WHERE fingerprint = $1
            "#,
        )
        .bind(fingerprint)
        .fetch_optional(&self.pool)
        .await
        .context("failed to load upstream error template by fingerprint")?;

        row.as_ref()
            .map(parse_upstream_error_template_row)
            .transpose()
    }

    async fn save_upstream_error_template_inner(
        &self,
        template: UpstreamErrorTemplateRecord,
    ) -> Result<UpstreamErrorTemplateRecord> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("failed to start upstream error template transaction")?;

        let row = sqlx::query(
            r#"
            INSERT INTO upstream_error_templates (
                id,
                fingerprint,
                provider,
                normalized_status_code,
                semantic_error_code,
                action,
                retry_scope,
                status,
                templates_json,
                representative_samples_json,
                hit_count,
                first_seen_at,
                last_seen_at,
                updated_at
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9::jsonb,
                $10::jsonb,
                $11,
                $12,
                $13,
                $14
            )
            ON CONFLICT (fingerprint) DO UPDATE
            SET
                provider = EXCLUDED.provider,
                normalized_status_code = EXCLUDED.normalized_status_code,
                semantic_error_code = EXCLUDED.semantic_error_code,
                action = EXCLUDED.action,
                retry_scope = EXCLUDED.retry_scope,
                status = EXCLUDED.status,
                templates_json = EXCLUDED.templates_json,
                representative_samples_json = EXCLUDED.representative_samples_json,
                hit_count = EXCLUDED.hit_count,
                last_seen_at = EXCLUDED.last_seen_at,
                updated_at = EXCLUDED.updated_at
            RETURNING
                id,
                fingerprint,
                provider,
                normalized_status_code,
                semantic_error_code,
                action,
                retry_scope,
                status,
                templates_json::text AS templates_json_text,
                representative_samples_json::text AS representative_samples_json_text,
                hit_count,
                first_seen_at,
                last_seen_at,
                updated_at
            "#,
        )
        .bind(template.id)
        .bind(template.fingerprint.trim())
        .bind(template.provider.trim())
        .bind(i32::from(template.normalized_status_code))
        .bind(template.semantic_error_code.trim())
        .bind(upstream_error_action_to_db(template.action))
        .bind(upstream_error_retry_scope_to_db(template.retry_scope))
        .bind(upstream_error_template_status_to_db(&template.status))
        .bind(
            serde_json::to_string(&template.templates)
                .context("failed to encode upstream error templates json")?,
        )
        .bind(
            serde_json::to_string(&normalize_representative_samples(
                template.representative_samples,
            ))
            .context("failed to encode upstream error representative samples json")?,
        )
        .bind(
            i64::try_from(template.hit_count)
                .context("upstream error template hit count does not fit into postgres BIGINT")?,
        )
        .bind(template.first_seen_at)
        .bind(template.last_seen_at)
        .bind(template.updated_at)
        .fetch_one(tx.as_mut())
        .await
        .context("failed to save upstream error template")?;

        self.bump_revision_tx(&mut tx).await?;
        self.append_data_plane_outbox_event_tx(
            &mut tx,
            DataPlaneSnapshotEventType::RoutingPlanRefresh,
            Uuid::nil(),
        )
        .await?;
        tx.commit()
            .await
            .context("failed to commit upstream error template transaction")?;

        parse_upstream_error_template_row(&row)
    }

    async fn load_approved_upstream_error_templates_inner(
        &self,
    ) -> Result<Vec<UpstreamErrorTemplateRecord>> {
        let rows = sqlx::query(
            r#"
            SELECT
                id,
                fingerprint,
                provider,
                normalized_status_code,
                semantic_error_code,
                action,
                retry_scope,
                status,
                templates_json::text AS templates_json_text,
                representative_samples_json::text AS representative_samples_json_text,
                hit_count,
                first_seen_at,
                last_seen_at,
                updated_at
            FROM upstream_error_templates
            WHERE status = $1
            ORDER BY fingerprint ASC
            "#,
        )
        .bind(upstream_error_template_status_to_db(
            &UpstreamErrorTemplateStatus::Approved,
        ))
        .fetch_all(&self.pool)
        .await
        .context("failed to load approved upstream error templates")?;

        rows.iter().map(parse_upstream_error_template_row).collect()
    }
}

fn parse_upstream_error_template_row(row: &sqlx_postgres::PgRow) -> Result<UpstreamErrorTemplateRecord> {
    Ok(UpstreamErrorTemplateRecord {
        id: row.try_get("id")?,
        fingerprint: row.try_get("fingerprint")?,
        provider: row.try_get("provider")?,
        normalized_status_code: u16::try_from(row.try_get::<i32, _>("normalized_status_code")?)
            .context("normalized upstream status code out of range")?,
        semantic_error_code: row.try_get("semantic_error_code")?,
        action: parse_upstream_error_action(row.try_get::<String, _>("action")?.as_str())?,
        retry_scope: parse_upstream_error_retry_scope(
            row.try_get::<String, _>("retry_scope")?.as_str(),
        )?,
        status: parse_upstream_error_template_status(
            row.try_get::<String, _>("status")?.as_str(),
        )?,
        templates: parse_localized_error_templates(
            row.try_get::<Option<String>, _>("templates_json_text")?,
        )?,
        representative_samples: parse_representative_samples(
            row.try_get::<Option<String>, _>("representative_samples_json_text")?,
        )?,
        hit_count: u64::try_from(row.try_get::<i64, _>("hit_count")?)
            .context("upstream error template hit count must be non-negative")?,
        first_seen_at: row.try_get("first_seen_at")?,
        last_seen_at: row.try_get("last_seen_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn upstream_error_action_to_db(action: UpstreamErrorAction) -> &'static str {
    match action {
        UpstreamErrorAction::ReturnFailure => "return_failure",
        UpstreamErrorAction::RetrySameAccount => "retry_same_account",
        UpstreamErrorAction::RetryCrossAccount => "retry_cross_account",
    }
}

fn parse_upstream_error_action(raw: &str) -> Result<UpstreamErrorAction> {
    match raw {
        "return_failure" => Ok(UpstreamErrorAction::ReturnFailure),
        "retry_same_account" => Ok(UpstreamErrorAction::RetrySameAccount),
        "retry_cross_account" => Ok(UpstreamErrorAction::RetryCrossAccount),
        _ => Err(anyhow!("unsupported upstream error action: {raw}")),
    }
}

fn upstream_error_retry_scope_to_db(scope: UpstreamErrorRetryScope) -> &'static str {
    match scope {
        UpstreamErrorRetryScope::None => "none",
        UpstreamErrorRetryScope::SameAccount => "same_account",
        UpstreamErrorRetryScope::CrossAccount => "cross_account",
    }
}

fn parse_upstream_error_retry_scope(raw: &str) -> Result<UpstreamErrorRetryScope> {
    match raw {
        "none" => Ok(UpstreamErrorRetryScope::None),
        "same_account" => Ok(UpstreamErrorRetryScope::SameAccount),
        "cross_account" => Ok(UpstreamErrorRetryScope::CrossAccount),
        _ => Err(anyhow!("unsupported upstream error retry scope: {raw}")),
    }
}

fn upstream_error_template_status_to_db(status: &UpstreamErrorTemplateStatus) -> &'static str {
    match status {
        UpstreamErrorTemplateStatus::ProvisionalLive => "provisional_live",
        UpstreamErrorTemplateStatus::ReviewPending => "review_pending",
        UpstreamErrorTemplateStatus::Approved => "approved",
        UpstreamErrorTemplateStatus::Rejected => "rejected",
    }
}

fn parse_upstream_error_template_status(raw: &str) -> Result<UpstreamErrorTemplateStatus> {
    match raw {
        "provisional_live" => Ok(UpstreamErrorTemplateStatus::ProvisionalLive),
        "review_pending" => Ok(UpstreamErrorTemplateStatus::ReviewPending),
        "approved" => Ok(UpstreamErrorTemplateStatus::Approved),
        "rejected" => Ok(UpstreamErrorTemplateStatus::Rejected),
        _ => Err(anyhow!("unsupported upstream error template status: {raw}")),
    }
}

fn parse_localized_error_templates(raw: Option<String>) -> Result<LocalizedErrorTemplates> {
    raw.map(|value| {
        serde_json::from_str::<LocalizedErrorTemplates>(&value)
            .context("failed to decode upstream error templates json")
    })
    .transpose()
    .map(Option::unwrap_or_default)
}

fn parse_representative_samples(raw: Option<String>) -> Result<Vec<String>> {
    raw.map(|value| {
        serde_json::from_str::<Vec<String>>(&value)
            .map(normalize_representative_samples)
            .context("failed to decode upstream error representative samples json")
    })
    .transpose()
    .map(Option::unwrap_or_default)
}

fn normalize_representative_samples(samples: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for sample in samples {
        let trimmed = sample.trim();
        if trimmed.is_empty() {
            continue;
        }
        if normalized.iter().any(|item: &String| item == trimmed) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}
