#[async_trait]
impl UsageAggregationRepository for ClickHouseUsageRepo {
    async fn upsert_hourly(
        &self,
        account_rows: Vec<HourlyAccountUsageRow>,
        tenant_api_key_rows: Vec<HourlyTenantApiKeyUsageRow>,
        tenant_account_rows: Vec<HourlyTenantAccountUsageRow>,
    ) -> Result<()> {
        self.insert_account_rows(account_rows).await?;
        self.insert_tenant_api_key_rows(tenant_api_key_rows).await?;
        self.insert_tenant_account_rows(tenant_account_rows).await
    }

    async fn upsert_request_logs(&self, rows: Vec<RequestLogRow>) -> Result<()> {
        self.insert_request_log_rows(rows).await
    }
}

#[async_trait]
impl UsageQueryRepository for ClickHouseUsageRepo {
    async fn query_hourly_accounts(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        account_id: Option<Uuid>,
    ) -> Result<Vec<HourlyAccountUsagePoint>> {
        self.fetch_hourly_account_rows(start_ts, end_ts, limit, account_id)
            .await
    }

    async fn query_hourly_tenant_api_keys(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        tenant_id: Option<Uuid>,
        api_key_id: Option<Uuid>,
    ) -> Result<Vec<HourlyTenantApiKeyUsagePoint>> {
        self.fetch_hourly_tenant_api_key_rows(start_ts, end_ts, limit, tenant_id, api_key_id)
            .await
    }

    async fn query_hourly_account_totals(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        account_id: Option<Uuid>,
    ) -> Result<Vec<HourlyUsageTotalPoint>> {
        self.fetch_hourly_account_totals(start_ts, end_ts, limit, account_id)
            .await
    }

    async fn query_hourly_tenant_api_key_totals(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        tenant_id: Option<Uuid>,
        api_key_id: Option<Uuid>,
    ) -> Result<Vec<HourlyUsageTotalPoint>> {
        self.fetch_hourly_tenant_api_key_totals(start_ts, end_ts, limit, tenant_id, api_key_id)
            .await
    }

    async fn query_hourly_tenant_totals(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        tenant_id: Option<Uuid>,
        api_key_id: Option<Uuid>,
    ) -> Result<Vec<HourlyTenantUsageTotalPoint>> {
        self.fetch_hourly_tenant_totals(start_ts, end_ts, limit, tenant_id, api_key_id)
            .await
    }

    async fn query_summary(
        &self,
        start_ts: i64,
        end_ts: i64,
        tenant_id: Option<Uuid>,
        account_id: Option<Uuid>,
        api_key_id: Option<Uuid>,
    ) -> Result<UsageSummaryQueryResponse> {
        self.fetch_summary(start_ts, end_ts, tenant_id, account_id, api_key_id)
            .await
    }

    async fn query_tenant_leaderboard(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        tenant_id: Option<Uuid>,
    ) -> Result<Vec<TenantUsageLeaderboardItem>> {
        self.fetch_tenant_leaderboard(start_ts, end_ts, limit, tenant_id)
            .await
    }

    async fn query_account_leaderboard(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        account_id: Option<Uuid>,
    ) -> Result<Vec<AccountUsageLeaderboardItem>> {
        self.fetch_account_leaderboard(start_ts, end_ts, limit, account_id)
            .await
    }

    async fn query_tenant_scoped_account_leaderboard(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        tenant_id: Uuid,
        account_id: Option<Uuid>,
    ) -> Result<Vec<AccountUsageLeaderboardItem>> {
        self.fetch_tenant_scoped_account_leaderboard(start_ts, end_ts, limit, tenant_id, account_id)
            .await
    }

    async fn query_api_key_leaderboard(
        &self,
        start_ts: i64,
        end_ts: i64,
        limit: u32,
        tenant_id: Option<Uuid>,
        api_key_id: Option<Uuid>,
    ) -> Result<Vec<ApiKeyUsageLeaderboardItem>> {
        self.fetch_api_key_leaderboard(start_ts, end_ts, limit, tenant_id, api_key_id)
            .await
    }

    async fn query_request_logs(&self, query: RequestLogQuery) -> Result<Vec<RequestLogRow>> {
        self.fetch_request_logs(query).await
    }
}
