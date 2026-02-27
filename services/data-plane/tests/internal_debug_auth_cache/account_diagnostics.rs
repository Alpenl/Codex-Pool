#[tokio::test]
async fn internal_debug_auth_cache_evict_route_evicts_specific_token_when_validator_enabled() {
    let control_plane = MockServer::start().await;
    let tenant_id = Uuid::new_v4();
    let api_key_id = Uuid::new_v4();

    Mock::given(method("POST"))
        .and(path("/internal/v1/auth/validate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "tenant_id": tenant_id,
            "api_key_id": api_key_id,
            "enabled": true,
            "cache_ttl_sec": 30
        })))
        .mount(&control_plane)
        .await;

    let app = build_test_app(
        true,
        Some(format!("{}/internal/v1/auth/validate", control_plane.uri())),
        false,
        Vec::new(),
    )
    .await;

    let warmup_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/internal/v1/debug/auth-cache")
                .header("authorization", "Bearer cp_valid_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(warmup_response.status(), StatusCode::OK);

    let evict_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/evict")
                .header("authorization", "Bearer cp_valid_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_valid_token"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(evict_response.status(), StatusCode::OK);
    let body = evict_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert_eq!(payload["evicted"], true);
    assert_eq!(payload["positive_evicted"], true);
    assert_eq!(payload["negative_evicted"], false);
    assert_eq!(payload["cached_principal_total"], 0);
}

#[tokio::test]
async fn internal_debug_auth_cache_evict_route_evicts_negative_cache_token_when_validator_enabled()
{
    let control_plane = MockServer::start().await;
    let tenant_id = Uuid::new_v4();
    let api_key_id = Uuid::new_v4();

    Mock::given(method("POST"))
        .and(path("/internal/v1/auth/validate"))
        .and(body_json(json!({"token":"cp_admin_token"})))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "tenant_id": tenant_id,
            "api_key_id": api_key_id,
            "enabled": true,
            "cache_ttl_sec": 30
        })))
        .mount(&control_plane)
        .await;
    Mock::given(method("POST"))
        .and(path("/internal/v1/auth/validate"))
        .respond_with(ResponseTemplate::new(401))
        .mount(&control_plane)
        .await;

    let app = build_test_app(
        true,
        Some(format!("{}/internal/v1/auth/validate", control_plane.uri())),
        false,
        Vec::new(),
    )
    .await;

    let unauthorized_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/responses")
                .header("authorization", "Bearer cp_negative_token")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauthorized_response.status(), StatusCode::UNAUTHORIZED);

    let evict_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/evict")
                .header("authorization", "Bearer cp_admin_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_negative_token"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(evict_response.status(), StatusCode::OK);
    let body = evict_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert_eq!(payload["evicted"], true);
    assert_eq!(payload["positive_evicted"], false);
    assert_eq!(payload["negative_evicted"], true);
    assert_eq!(payload["cached_principal_total"], 1);
}

#[tokio::test]
async fn internal_debug_auth_cache_evict_route_returns_false_and_zero_when_validator_disabled() {
    let app = build_test_app(
        true,
        None,
        false,
        vec!["cp_allow_1".to_string(), "cp_allow_2".to_string()],
    )
    .await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/evict")
                .header("authorization", "Bearer cp_allow_1")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_allow_1"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], false);
    assert_eq!(payload["evicted"], false);
    assert_eq!(payload["positive_evicted"], false);
    assert_eq!(payload["negative_evicted"], false);
    assert_eq!(payload["cached_principal_total"], 0);
}

#[tokio::test]
async fn internal_debug_auth_cache_clear_route_returns_404_when_debug_routes_disabled() {
    let control_plane = MockServer::start().await;
    let app = build_test_app(
        false,
        Some(format!("{}/internal/v1/auth/validate", control_plane.uri())),
        false,
        Vec::new(),
    )
    .await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/clear")
                .header("authorization", "Bearer cp_disabled_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn internal_debug_auth_cache_clear_route_requires_bearer_token() {
    let control_plane = MockServer::start().await;
    let app = build_test_app(
        true,
        Some(format!("{}/internal/v1/auth/validate", control_plane.uri())),
        false,
        Vec::new(),
    )
    .await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/clear")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn internal_debug_auth_cache_clear_route_clears_cache_when_validator_enabled() {
    let control_plane = MockServer::start().await;
    let tenant_id = Uuid::new_v4();
    let api_key_id = Uuid::new_v4();

    Mock::given(method("POST"))
        .and(path("/internal/v1/auth/validate"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "tenant_id": tenant_id,
            "api_key_id": api_key_id,
            "enabled": true,
            "cache_ttl_sec": 30
        })))
        .mount(&control_plane)
        .await;

    let app = build_test_app(
        true,
        Some(format!("{}/internal/v1/auth/validate", control_plane.uri())),
        true,
        Vec::new(),
    )
    .await;

    let warmup_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/internal/v1/debug/auth-cache")
                .header("authorization", "Bearer cp_valid_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(warmup_response.status(), StatusCode::OK);

    let clear_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/clear")
                .header("authorization", "Bearer cp_valid_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(clear_response.status(), StatusCode::OK);
    let clear_body = clear_response
        .into_body()
        .collect()
        .await
        .unwrap()
        .to_bytes();
    let payload: Value = serde_json::from_slice(&clear_body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert_eq!(payload["cleared"], 1);
    assert_eq!(payload["cached_principal_total"], 0);
}

#[tokio::test]
async fn internal_debug_auth_cache_clear_route_returns_zero_when_validator_disabled() {
    let app = build_test_app(
        true,
        None,
        false,
        vec!["cp_allow_1".to_string(), "cp_allow_2".to_string()],
    )
    .await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/clear")
                .header("authorization", "Bearer cp_allow_1")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], false);
    assert_eq!(payload["cleared"], 0);
    assert_eq!(payload["cached_principal_total"], 0);
}
