fn tenant_backend_unavailable() -> anyhow::Error {
    anyhow!("tenant auth service requires the postgres-backend cargo feature")
}

impl TenantAuthService {
    pub fn from_pool(_pool: PgPool) -> Result<Self> {
        Err(tenant_backend_unavailable())
    }

    pub fn build_session_cookie(&self, token: &str) -> String {
        format!(
            "{}={token}; Path=/; HttpOnly; SameSite=Lax",
            self.session_cookie_name
        )
    }

    pub fn build_session_clear_cookie(&self) -> String {
        format!(
            "{}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
            self.session_cookie_name
        )
    }

    pub fn extract_cookie_token(&self, _headers: &axum::http::HeaderMap) -> Option<String> {
        None
    }

    pub fn verify_bearer_header(&self, _authorization: Option<&str>) -> Result<TenantPrincipal> {
        Err(tenant_backend_unavailable())
    }

    pub fn verify_token(&self, _token: &str) -> Result<TenantPrincipal> {
        Err(tenant_backend_unavailable())
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

    pub async fn ensure_principal_active(&self, _principal: &TenantPrincipal) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn register(&self, _req: TenantRegisterRequest) -> Result<TenantRegisterResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn verify_email(&self, _req: TenantVerifyEmailRequest) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn login(
        &self,
        _req: TenantLoginRequest,
        _request_ip: Option<&str>,
    ) -> Result<Option<TenantLoginResponse>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn forgot_password(
        &self,
        _req: TenantForgotPasswordRequest,
    ) -> Result<Option<String>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn reset_password(&self, _req: TenantResetPasswordRequest) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn list_tenant_api_keys(&self, _tenant_id: Uuid) -> Result<Vec<TenantApiKeyRecord>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn create_tenant_api_key(
        &self,
        _tenant_id: Uuid,
        _req: TenantCreateApiKeyRequest,
    ) -> Result<TenantCreateApiKeyResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn patch_tenant_api_key(
        &self,
        _tenant_id: Uuid,
        _key_id: Uuid,
        _req: TenantPatchApiKeyRequest,
    ) -> Result<TenantApiKeyRecord> {
        Err(tenant_backend_unavailable())
    }

    pub async fn delete_tenant_api_key(&self, _tenant_id: Uuid, _key_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn get_credit_balance(&self, _tenant_id: Uuid) -> Result<TenantCreditBalanceResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn get_credit_summary(&self, _tenant_id: Uuid) -> Result<TenantCreditSummaryResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn list_credit_ledger(
        &self,
        _tenant_id: Uuid,
        _limit: usize,
    ) -> Result<TenantCreditLedgerResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn daily_checkin(&self, _tenant_id: Uuid) -> Result<TenantDailyCheckinResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_create_tenant(
        &self,
        _req: AdminTenantCreateRequest,
    ) -> Result<AdminTenantItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_list_tenants(&self) -> Result<Vec<AdminTenantItem>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_ensure_default_tenant(&self) -> Result<AdminTenantItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_patch_tenant(
        &self,
        _tenant_id: Uuid,
        _req: AdminTenantPatchRequest,
    ) -> Result<AdminTenantItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_recharge_tenant(
        &self,
        _tenant_id: Uuid,
        _req: AdminRechargeRequest,
    ) -> Result<AdminRechargeResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_list_model_pricing(&self) -> Result<Vec<ModelPricingItem>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_upsert_model_pricing(
        &self,
        _req: ModelPricingUpsertRequest,
    ) -> Result<ModelPricingItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_delete_model_pricing(&self, _pricing_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_list_billing_pricing_rules(&self) -> Result<Vec<BillingPricingRuleItem>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_upsert_billing_pricing_rule(
        &self,
        _req: BillingPricingRuleUpsertRequest,
    ) -> Result<BillingPricingRuleItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_delete_billing_pricing_rule(&self, _rule_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_list_model_entities(&self) -> Result<Vec<AdminModelEntityItem>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_upsert_model_entity(
        &self,
        _req: AdminModelEntityUpsertRequest,
    ) -> Result<AdminModelEntityItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_delete_model_entity(&self, _entity_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_impersonate(
        &self,
        _admin_user_id: Uuid,
        _req: AdminImpersonateRequest,
    ) -> Result<AdminImpersonateResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_revoke_impersonation(&self, _session_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_precheck(&self, _tenant_id: Uuid) -> Result<BillingPrecheckResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_authorize(
        &self,
        _req: BillingAuthorizeRequest,
    ) -> Result<BillingAuthorizeResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_capture(
        &self,
        _req: BillingCaptureRequest,
    ) -> Result<BillingCaptureResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_release(
        &self,
        _req: BillingReleaseRequest,
    ) -> Result<BillingReleaseResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_reconcile_request_fact(
        &self,
        _req: BillingReconcileFactRequest,
    ) -> Result<BillingReconcileStats> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_reconcile_once(
        &self,
        _req: BillingReconcileRequest,
    ) -> Result<BillingReconcileStats> {
        Err(tenant_backend_unavailable())
    }

    pub async fn billing_pricing(
        &self,
        _req: BillingPricingRequest,
    ) -> Result<BillingPricingResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn write_audit_log(&self, _entry: AuditLogWriteRequest) -> Result<()> {
        Ok(())
    }

    pub async fn list_audit_logs(&self, _query: AuditLogListQuery) -> Result<AuditLogListResponse> {
        Ok(AuditLogListResponse { items: Vec::new() })
    }

    pub async fn admin_list_api_key_groups(&self) -> Result<ApiKeyGroupAdminListResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn tenant_list_api_key_groups(&self) -> Result<Vec<ApiKeyGroupItem>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_upsert_api_key_group(
        &self,
        _req: ApiKeyGroupUpsertRequest,
    ) -> Result<ApiKeyGroupItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_delete_api_key_group(&self, _group_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_upsert_api_key_group_model_policy(
        &self,
        _req: ApiKeyGroupModelPolicyUpsertRequest,
    ) -> Result<ApiKeyGroupModelPolicyItem> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_delete_api_key_group_model_policy(&self, _policy_id: Uuid) -> Result<()> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_list_openai_model_catalog(&self) -> Result<Vec<OpenAiModelCatalogItem>> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_sync_openai_models_catalog(&self) -> Result<OpenAiModelsSyncResponse> {
        Err(tenant_backend_unavailable())
    }

    pub async fn admin_sync_openai_models_catalog_with_client(
        &self,
        _client: Option<reqwest::Client>,
    ) -> Result<OpenAiModelsSyncResponse> {
        Err(tenant_backend_unavailable())
    }
}

pub fn extract_client_ip(headers: &axum::http::HeaderMap) -> Option<String> {
    headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .or_else(|| {
            headers
                .get("x-real-ip")
                .and_then(|value| value.to_str().ok())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
}
