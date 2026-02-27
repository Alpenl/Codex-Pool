use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use control_plane::app::build_app as cp_build_app;
use serde_json::Value;
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
                    serde_json::json!({
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

async fn fetch_import_job_not_found_error(
    app: &axum::Router,
    admin_token: &str,
    accept_language: &str,
) -> Value {
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/upstream-accounts/oauth/import-jobs/00000000-0000-0000-0000-000000000000")
                .header("authorization", format!("Bearer {admin_token}"))
                .header("accept-language", accept_language)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
async fn oauth_import_job_not_found_message_is_localized_by_accept_language() {
    let app = build_app();
    let admin_token = login_admin_token(&app).await;

    let en_error = fetch_import_job_not_found_error(&app, &admin_token, "en-US,en;q=0.9").await;
    let zh_error = fetch_import_job_not_found_error(&app, &admin_token, "zh-CN,zh;q=0.9").await;

    assert_eq!(en_error["error"]["code"], "not_found");
    assert_eq!(zh_error["error"]["code"], "not_found");

    assert_eq!(en_error["error"]["message"], "oauth import job not found");
    assert_eq!(zh_error["error"]["message"], "未找到 OAuth 导入任务");
}
