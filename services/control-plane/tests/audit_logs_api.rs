use std::sync::Arc;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use control_plane::app::{
    build_app_with_store_ttl_and_usage_repo as cp_build_app_with_store_ttl_and_usage_repo,
    DEFAULT_AUTH_VALIDATE_CACHE_TTL_SEC,
};
use control_plane::store::postgres::PostgresStore;
use control_plane::store::ControlPlaneStore;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx_core::query::query;
use sqlx_postgres::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

use crate::support;

#[derive(Debug, Deserialize)]
struct AuditLogListItem {
    tenant_id: Option<Uuid>,
    action: String,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AuditLogListResponse {
    items: Vec<AuditLogListItem>,
}

fn test_db_url() -> Option<String> {
    std::env::var("CONTROL_PLANE_DATABASE_URL")
        .ok()
        .or_else(|| std::env::var("DATABASE_URL").ok())
}

fn build_app(store: Arc<dyn ControlPlaneStore>) -> axum::Router {
    support::ensure_test_security_env();
    cp_build_app_with_store_ttl_and_usage_repo(store, DEFAULT_AUTH_VALIDATE_CACHE_TTL_SEC, None)
}

async fn login_admin_token(app: &axum::Router) -> String {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/admin/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "username": "admin",
                        "password": "admin123456"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    payload["access_token"].as_str().unwrap().to_string()
}

async fn register_verified_tenant_token(app: &axum::Router) -> (Uuid, String) {
    let suffix = Uuid::new_v4().simple().to_string();
    let email = format!("tenant-audit-{suffix}@example.com");
    let password = "Password123!";
    let tenant_name = format!("tenant-audit-{suffix}");

    let register_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/tenant/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "tenant_name": tenant_name,
                        "email": email,
                        "password": password,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(register_response.status(), StatusCode::OK);
    let register_body = to_bytes(register_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let register_json: Value = serde_json::from_slice(&register_body).unwrap();
    let tenant_id = Uuid::parse_str(register_json["tenant_id"].as_str().unwrap()).unwrap();
    let debug_code = register_json["debug_code"]
        .as_str()
        .expect("tenant auth debug code should be exposed in tests");

    let verify_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/tenant/auth/verify-email")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "email": email,
                        "code": debug_code,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(verify_response.status(), StatusCode::NO_CONTENT);

    let login_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/tenant/auth/login")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "email": email,
                        "password": password,
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(login_response.status(), StatusCode::OK);
    let login_body = to_bytes(login_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let login_json: Value = serde_json::from_slice(&login_body).unwrap();
    let access_token = login_json["access_token"].as_str().unwrap().to_string();
    (tenant_id, access_token)
}

async fn insert_audit_log(
    pool: &PgPool,
    tenant_id: Option<Uuid>,
    actor_type: &str,
    actor_id: Option<Uuid>,
    action: &str,
    reason: Option<&str>,
) {
    query(
        r#"
        INSERT INTO audit_logs (
            id, actor_type, actor_id, tenant_id, action, reason, request_ip, user_agent,
            target_type, target_id, payload_json, result_status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        "#,
    )
    .bind(Uuid::new_v4())
    .bind(actor_type)
    .bind(actor_id)
    .bind(tenant_id)
    .bind(action)
    .bind(reason)
    .bind(Some("127.0.0.1".to_string()))
    .bind(Some("integration-test".to_string()))
    .bind(Some("audit_test".to_string()))
    .bind(Some("target".to_string()))
    .bind(json!({ "note": reason }))
    .bind("ok")
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn admin_audit_logs_api_supports_filtering_and_rbac() {
    let Some(db_url) = test_db_url() else {
        eprintln!(
            "skip admin_audit_logs_api_supports_filtering_and_rbac: set CONTROL_PLANE_DATABASE_URL"
        );
        return;
    };
    std::env::set_var("TENANT_AUTH_DEBUG_EXPOSE_CODE", "true");

    let store = Arc::new(PostgresStore::connect(&db_url).await.unwrap());
    let app = build_app(store.clone());
    let pool = store.clone_pool();

    let admin_token = login_admin_token(&app).await;
    let (tenant_id, tenant_token) = register_verified_tenant_token(&app).await;
    let (other_tenant_id, _) = register_verified_tenant_token(&app).await;
    let action = format!("test.audit.admin.{}", Uuid::new_v4().simple());

    insert_audit_log(
        &pool,
        Some(tenant_id),
        "tenant_user",
        Some(Uuid::new_v4()),
        &action,
        Some("alpha-only"),
    )
    .await;
    insert_audit_log(
        &pool,
        Some(other_tenant_id),
        "tenant_user",
        Some(Uuid::new_v4()),
        &action,
        Some("alpha-only-other-tenant"),
    )
    .await;
    insert_audit_log(
        &pool,
        Some(tenant_id),
        "tenant_user",
        Some(Uuid::new_v4()),
        "test.audit.other-action",
        Some("alpha-only"),
    )
    .await;

    let start_ts = chrono::Utc::now().timestamp() - 300;
    let end_ts = chrono::Utc::now().timestamp() + 300;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/v1/admin/audit-logs?start_ts={start_ts}&end_ts={end_ts}&tenant_id={tenant_id}&action={action}&keyword=alpha-only"
                ))
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: AuditLogListResponse = serde_json::from_slice(&body).unwrap();
    assert!(!payload.items.is_empty());
    assert!(payload
        .items
        .iter()
        .all(|item| item.tenant_id == Some(tenant_id) && item.action == action));
    assert!(payload.items.iter().any(|item| item
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("alpha-only")));

    let unauthorized = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/admin/audit-logs")
                .header("authorization", format!("Bearer {tenant_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn tenant_audit_logs_api_is_scoped_to_current_tenant() {
    let Some(db_url) = test_db_url() else {
        eprintln!("skip tenant_audit_logs_api_is_scoped_to_current_tenant: set CONTROL_PLANE_DATABASE_URL");
        return;
    };
    std::env::set_var("TENANT_AUTH_DEBUG_EXPOSE_CODE", "true");

    let store = Arc::new(PostgresStore::connect(&db_url).await.unwrap());
    let app = build_app(store.clone());
    let pool = store.clone_pool();

    let admin_token = login_admin_token(&app).await;
    let (tenant_id, tenant_token) = register_verified_tenant_token(&app).await;
    let (other_tenant_id, _other_token) = register_verified_tenant_token(&app).await;
    let action = format!("test.audit.tenant.{}", Uuid::new_v4().simple());

    insert_audit_log(
        &pool,
        Some(tenant_id),
        "tenant_user",
        Some(Uuid::new_v4()),
        &action,
        Some("tenant-visible"),
    )
    .await;
    insert_audit_log(
        &pool,
        Some(other_tenant_id),
        "tenant_user",
        Some(Uuid::new_v4()),
        &action,
        Some("other-tenant-hidden"),
    )
    .await;

    let start_ts = chrono::Utc::now().timestamp() - 300;
    let end_ts = chrono::Utc::now().timestamp() + 300;
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!(
                    "/api/v1/tenant/audit-logs?start_ts={start_ts}&end_ts={end_ts}&tenant_id={other_tenant_id}&action={action}"
                ))
                .header("authorization", format!("Bearer {tenant_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: AuditLogListResponse = serde_json::from_slice(&body).unwrap();
    assert!(!payload.items.is_empty());
    assert!(payload
        .items
        .iter()
        .all(|item| item.tenant_id == Some(tenant_id)));

    let unauthorized = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/tenant/audit-logs")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);
}
