impl ClickHouseUsageRepo {
    pub fn new(
        clickhouse_url: &str,
        database: &str,
        account_table: &str,
        tenant_api_key_table: &str,
        tenant_account_table: &str,
        request_log_table: &str,
    ) -> Self {
        let ch_client = clickhouse::Client::default()
            .with_url(clickhouse_url)
            .with_database(database);

        Self {
            ch_client,
            account_table: account_table.to_string(),
            tenant_api_key_table: tenant_api_key_table.to_string(),
            tenant_account_table: tenant_account_table.to_string(),
            request_log_table: request_log_table.to_string(),
        }
    }

    pub async fn ensure_table(&self) -> Result<()> {
        let account_ddl = format!(
            "CREATE TABLE IF NOT EXISTS {} (account_id String, hour_start Int64, request_count UInt64) ENGINE = ReplacingMergeTree ORDER BY (account_id, hour_start)",
            self.account_table
        );

        let tenant_api_key_ddl = format!(
            "CREATE TABLE IF NOT EXISTS {} (tenant_id String, api_key_id String, hour_start Int64, request_count UInt64) ENGINE = ReplacingMergeTree ORDER BY (tenant_id, api_key_id, hour_start)",
            self.tenant_api_key_table
        );
        let tenant_account_ddl = format!(
            "CREATE TABLE IF NOT EXISTS {} (tenant_id String, account_id String, hour_start Int64, request_count UInt64) ENGINE = ReplacingMergeTree ORDER BY (tenant_id, account_id, hour_start)",
            self.tenant_account_table
        );
        let request_log_ddl = format!(
            "CREATE TABLE IF NOT EXISTS {} (id String, account_id String, tenant_id Nullable(String), api_key_id Nullable(String), request_id Nullable(String), path String, method String, model Nullable(String), service_tier Nullable(String), input_tokens Nullable(Int64), cached_input_tokens Nullable(Int64), output_tokens Nullable(Int64), reasoning_tokens Nullable(Int64), first_token_latency_ms Nullable(UInt64), status_code UInt16, latency_ms UInt64, is_stream UInt8, error_code Nullable(String), billing_phase Nullable(String), authorization_id Nullable(String), capture_status Nullable(String), created_at Int64, event_version UInt16) ENGINE = ReplacingMergeTree ORDER BY (created_at, id)",
            self.request_log_table
        );

        self.ch_client
            .query(&account_ddl)
            .execute()
            .await
            .context("failed to ensure clickhouse account usage table")?;

        self.ch_client
            .query(&tenant_api_key_ddl)
            .execute()
            .await
            .context("failed to ensure clickhouse tenant api-key usage table")?;

        self.ch_client
            .query(&tenant_account_ddl)
            .execute()
            .await
            .context("failed to ensure clickhouse tenant account usage table")?;

        self.ch_client
            .query(&request_log_ddl)
            .execute()
            .await
            .context("failed to ensure clickhouse request log table")?;

        for ddl in [
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS billing_phase Nullable(String)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS input_tokens Nullable(Int64)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS output_tokens Nullable(Int64)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS cached_input_tokens Nullable(Int64)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS reasoning_tokens Nullable(Int64)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS first_token_latency_ms Nullable(UInt64)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS authorization_id Nullable(String)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS capture_status Nullable(String)",
                self.request_log_table
            ),
            format!(
                "ALTER TABLE {} ADD COLUMN IF NOT EXISTS service_tier Nullable(String)",
                self.request_log_table
            ),
        ] {
            self.ch_client
                .query(&ddl)
                .execute()
                .await
                .with_context(|| format!("failed to alter clickhouse request log table: {ddl}"))?;
        }

        Ok(())
    }

    async fn insert_account_rows(&self, rows: Vec<HourlyAccountUsageRow>) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }

        let mut insert = self
            .ch_client
            .insert::<ClickHouseHourlyAccountUsageRow>(&self.account_table)
            .await
            .context("failed to initialize clickhouse account insert")?;

        for row in rows {
            insert
                .write(&ClickHouseHourlyAccountUsageRow::from(row))
                .await
                .context("failed to write account usage row to clickhouse")?;
        }

        insert
            .end()
            .await
            .context("failed to finish clickhouse account usage insert")
    }

    async fn insert_tenant_api_key_rows(
        &self,
        rows: Vec<HourlyTenantApiKeyUsageRow>,
    ) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }

        let mut insert = self
            .ch_client
            .insert::<ClickHouseHourlyTenantApiKeyUsageRow>(&self.tenant_api_key_table)
            .await
            .context("failed to initialize clickhouse tenant api-key insert")?;

        for row in rows {
            insert
                .write(&ClickHouseHourlyTenantApiKeyUsageRow::from(row))
                .await
                .context("failed to write tenant api-key usage row to clickhouse")?;
        }

        insert
            .end()
            .await
            .context("failed to finish clickhouse tenant api-key usage insert")
    }

    async fn insert_tenant_account_rows(
        &self,
        rows: Vec<HourlyTenantAccountUsageRow>,
    ) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }

        let mut insert = self
            .ch_client
            .insert::<ClickHouseHourlyTenantAccountUsageRow>(&self.tenant_account_table)
            .await
            .context("failed to initialize clickhouse tenant-account insert")?;

        for row in rows {
            insert
                .write(&ClickHouseHourlyTenantAccountUsageRow::from(row))
                .await
                .context("failed to write tenant-account usage row to clickhouse")?;
        }

        insert
            .end()
            .await
            .context("failed to finish clickhouse tenant-account usage insert")
    }

    async fn insert_request_log_rows(&self, rows: Vec<RequestLogRow>) -> Result<()> {
        if rows.is_empty() {
            return Ok(());
        }

        let mut insert = self
            .ch_client
            .insert::<ClickHouseRequestLogInsertRow>(&self.request_log_table)
            .await
            .context("failed to initialize clickhouse request-log insert")?;

        for row in rows {
            insert
                .write(&ClickHouseRequestLogInsertRow::from(row))
                .await
                .context("failed to write request-log row to clickhouse")?;
        }

        insert
            .end()
            .await
            .context("failed to finish clickhouse request-log insert")
    }

    async fn fetch_request_logs(&self, query: RequestLogQuery) -> Result<Vec<RequestLogRow>> {
        let mut sql = format!(
            "SELECT id, account_id, tenant_id, api_key_id, request_id, path, method, model, service_tier, input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, first_token_latency_ms, status_code, latency_ms, is_stream, error_code, billing_phase, authorization_id, capture_status, created_at, event_version FROM {} WHERE created_at >= ? AND created_at <= ?",
            self.request_log_table
        );

        if query.tenant_id.is_some() {
            sql.push_str(" AND tenant_id = ?");
        }

        if query.api_key_id.is_some() {
            sql.push_str(" AND api_key_id = ?");
        }

        if query.status_code.is_some() {
            sql.push_str(" AND status_code = ?");
        }

        if query.request_id.is_some() {
            sql.push_str(" AND request_id = ?");
        }

        if query.keyword.is_some() {
            sql.push_str(
                " AND (positionCaseInsensitiveUTF8(path, ?) > 0 OR positionCaseInsensitiveUTF8(method, ?) > 0 OR positionCaseInsensitiveUTF8(ifNull(request_id, ''), ?) > 0 OR positionCaseInsensitiveUTF8(ifNull(error_code, ''), ?) > 0 OR positionCaseInsensitiveUTF8(ifNull(model, ''), ?) > 0)",
            );
        }

        sql.push_str(" ORDER BY created_at DESC LIMIT ?");

        let mut ch_query = self
            .ch_client
            .query(&sql)
            .bind(query.start_ts)
            .bind(query.end_ts);

        if let Some(tenant_id) = query.tenant_id {
            ch_query = ch_query.bind(tenant_id.to_string());
        }

        if let Some(api_key_id) = query.api_key_id {
            ch_query = ch_query.bind(api_key_id.to_string());
        }

        if let Some(status_code) = query.status_code {
            ch_query = ch_query.bind(status_code);
        }

        if let Some(request_id) = query.request_id {
            ch_query = ch_query.bind(request_id);
        }

        if let Some(keyword) = query.keyword {
            for _ in 0..5 {
                ch_query = ch_query.bind(keyword.clone());
            }
        }

        let rows = ch_query
            .bind(query.limit as u64)
            .fetch_all::<ClickHouseRequestLogQueryRow>()
            .await
            .context("failed to query clickhouse request-log rows")?;

        rows.into_iter()
            .map(RequestLogRow::try_from)
            .collect::<Result<Vec<_>>>()
            .context("failed to decode clickhouse request-log rows")
    }

    pub async fn fetch_billing_reconcile_facts(
        &self,
        start_ts: i64,
        end_ts: i64,
        cursor_created_at: i64,
        cursor_id: &str,
        limit: usize,
    ) -> Result<Vec<BillingReconcileFact>> {
        let capped_limit = limit.clamp(1, 10_000) as u64;
        let sql = format!(
            "SELECT id, tenant_id, api_key_id, request_id, model, service_tier, input_tokens, output_tokens, status_code, billing_phase, capture_status, created_at FROM {} WHERE created_at >= ? AND created_at <= ? AND tenant_id IS NOT NULL AND request_id IS NOT NULL AND status_code >= 200 AND status_code < 300 AND (billing_phase = 'released' OR input_tokens IS NOT NULL OR output_tokens IS NOT NULL) AND (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC LIMIT ?",
            self.request_log_table
        );

        let rows = self
            .ch_client
            .query(&sql)
            .bind(start_ts)
            .bind(end_ts)
            .bind(cursor_created_at)
            .bind(cursor_created_at)
            .bind(cursor_id.to_string())
            .bind(capped_limit)
            .fetch_all::<ClickHouseBillingReconcileFactRow>()
            .await
            .context("failed to query clickhouse billing reconcile facts")?;

        rows.into_iter()
            .map(BillingReconcileFact::try_from)
            .collect::<Result<Vec<_>>>()
            .context("failed to decode clickhouse billing reconcile facts")
    }
}
