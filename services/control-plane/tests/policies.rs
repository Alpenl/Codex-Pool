use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use control_plane::app::build_app as cp_build_app;
use serde_json::{json, Value};
use tower::ServiceExt;

use crate::support;

fn build_app() -> axum::Router {
    support::ensure_test_security_env();
    cp_build_app()
}

async fn login_admin_token(app: &axum::Router) -> String {
    let login_response = app
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
    assert_eq!(login_response.status(), StatusCode::OK);
    let login_body = to_bytes(login_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let login_json: Value = serde_json::from_slice(&login_body).unwrap();
    login_json["access_token"].as_str().unwrap().to_string()
}

fn internal_service_token() -> String {
    support::internal_service_token()
}

#[tokio::test]
async fn updates_routing_policy_and_bumps_snapshot_revision() {
    let app = build_app();
    let admin_token = login_admin_token(&app).await;

    let tenant_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/tenants")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::from(r#"{"name":"policy-tenant"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(tenant_response.status(), StatusCode::OK);
    let tenant_body = to_bytes(tenant_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let tenant_json: Value = serde_json::from_slice(&tenant_body).unwrap();
    let tenant_id = tenant_json["id"].as_str().unwrap();

    let initial_snapshot = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/data-plane/snapshot")
                .header(
                    "authorization",
                    format!("Bearer {}", internal_service_token()),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(initial_snapshot.status(), StatusCode::OK);
    let initial_body = to_bytes(initial_snapshot.into_body(), usize::MAX)
        .await
        .unwrap();
    let initial_json: Value = serde_json::from_slice(&initial_body).unwrap();
    let initial_revision = initial_json["revision"].as_u64().unwrap();

    let policy_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/policies/routing")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::from(
                    json!({
                        "tenant_id": tenant_id,
                        "strategy": "fill_first",
                        "max_retries": 3,
                        "stream_max_retries": 4
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(policy_response.status(), StatusCode::OK);

    let updated_snapshot = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/data-plane/snapshot")
                .header(
                    "authorization",
                    format!("Bearer {}", internal_service_token()),
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(updated_snapshot.status(), StatusCode::OK);
    let updated_body = to_bytes(updated_snapshot.into_body(), usize::MAX)
        .await
        .unwrap();
    let updated_json: Value = serde_json::from_slice(&updated_body).unwrap();
    assert!(updated_json["revision"].as_u64().unwrap() > initial_revision);
}
