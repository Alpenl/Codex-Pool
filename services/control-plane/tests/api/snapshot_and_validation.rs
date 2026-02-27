#[tokio::test]
async fn oauth_import_job_summary_returns_not_found_for_unknown_job_id() {
    let app = build_app();
    let admin_token = login_admin_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/upstream-accounts/oauth/import-jobs/00000000-0000-0000-0000-000000000000")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["error"]["code"], "not_found");
}

#[tokio::test]
async fn oauth_import_job_items_returns_not_found_for_unknown_job_id() {
    let app = build_app();
    let admin_token = login_admin_token(&app).await;

    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/upstream-accounts/oauth/import-jobs/00000000-0000-0000-0000-000000000000/items")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let value: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(value["error"]["code"], "not_found");
}

#[tokio::test]
async fn admin_login_sets_http_only_cookie_and_me_accepts_cookie_auth() {
    let app = build_app();

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
    let set_cookie = login_response
        .headers()
        .get("set-cookie")
        .and_then(|value| value.to_str().ok())
        .expect("login response should set admin session cookie")
        .to_string();
    assert!(set_cookie.contains("cp_admin_session="));
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Lax"));

    let login_body = to_bytes(login_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let login_json: Value = serde_json::from_slice(&login_body).unwrap();
    assert!(login_json["access_token"].is_string());

    let cookie_pair = set_cookie
        .split(';')
        .next()
        .expect("set-cookie must contain cookie pair")
        .to_string();

    let me_response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/admin/auth/me")
                .header("cookie", cookie_pair)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(me_response.status(), StatusCode::OK);
    let me_body = to_bytes(me_response.into_body(), usize::MAX).await.unwrap();
    let me_json: Value = serde_json::from_slice(&me_body).unwrap();
    assert_eq!(me_json["username"], "admin");
}

#[tokio::test]
async fn admin_logout_returns_clear_cookie_header() {
    let app = build_app();

    let logout_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/admin/auth/logout")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(logout_response.status(), StatusCode::NO_CONTENT);
    let set_cookie = logout_response
        .headers()
        .get("set-cookie")
        .and_then(|value| value.to_str().ok())
        .expect("logout response should clear admin session cookie")
        .to_string();
    assert!(set_cookie.contains("cp_admin_session="));
    assert!(set_cookie.contains("Max-Age=0"));
    assert!(set_cookie.contains("HttpOnly"));
}
