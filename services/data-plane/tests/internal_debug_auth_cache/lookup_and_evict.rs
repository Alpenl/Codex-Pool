#[tokio::test]
async fn internal_debug_auth_cache_stats_reset_route_returns_zero_when_validator_disabled() {
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
                .uri("/internal/v1/debug/auth-cache/stats/reset")
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
    assert_eq!(payload["cache_hit_count_before"], 0);
    assert_eq!(payload["cache_miss_count_before"], 0);
    assert_eq!(payload["remote_validate_count_before"], 0);
    assert_eq!(payload["negative_cache_hit_count_before"], 0);
    assert_eq!(payload["negative_cache_store_count_before"], 0);
    assert_eq!(payload["cache_hit_count_after"], 0);
    assert_eq!(payload["cache_miss_count_after"], 0);
    assert_eq!(payload["remote_validate_count_after"], 0);
    assert_eq!(payload["negative_cache_hit_count_after"], 0);
    assert_eq!(payload["negative_cache_store_count_after"], 0);
}

#[tokio::test]
async fn internal_debug_auth_cache_stats_reset_route_resets_negative_cache_counters_when_validator_enabled(
) {
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

    let first_reset = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/stats/reset")
                .header("authorization", "Bearer cp_admin_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first_reset.status(), StatusCode::OK);

    let first_unauthorized = app
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
    assert_eq!(first_unauthorized.status(), StatusCode::UNAUTHORIZED);

    let second_unauthorized = app
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
    assert_eq!(second_unauthorized.status(), StatusCode::UNAUTHORIZED);

    let second_reset = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/stats/reset")
                .header("authorization", "Bearer cp_admin_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(second_reset.status(), StatusCode::OK);

    let body = second_reset.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert!(payload["negative_cache_hit_count_before"].as_u64().unwrap() > 0);
    assert!(
        payload["negative_cache_store_count_before"]
            .as_u64()
            .unwrap()
            > 0
    );
    assert_eq!(payload["negative_cache_hit_count_after"], 0);
    assert_eq!(payload["negative_cache_store_count_after"], 0);
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_returns_404_when_debug_routes_disabled() {
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
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("authorization", "Bearer cp_disabled_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_disabled_token"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_requires_bearer_token() {
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
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_missing_bearer"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_returns_400_for_invalid_body() {
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

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("authorization", "Bearer cp_valid_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":""}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["error"]["code"], "invalid_request");
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_hits_cached_token_when_validator_enabled() {
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
                .uri("/internal/v1/debug/state")
                .header("authorization", "Bearer cp_valid_token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(warmup_response.status(), StatusCode::OK);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("authorization", "Bearer cp_valid_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_valid_token"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert_eq!(payload["hit"], true);
    assert_eq!(payload["cached_negative"], false);
    assert_eq!(payload["lookup_status"], "positive_hit");
    assert_eq!(payload["tenant_id"], tenant_id.to_string());
    assert_eq!(payload["api_key_id"], api_key_id.to_string());
    assert_eq!(payload["enabled"], true);
    assert_eq!(payload["cached_principal_total"], 1);
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_misses_uncached_token_when_validator_enabled() {
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

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("authorization", "Bearer cp_valid_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_not_cached"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert_eq!(payload["hit"], false);
    assert_eq!(payload["cached_negative"], false);
    assert_eq!(payload["lookup_status"], "miss");
    assert_eq!(payload["tenant_id"], Value::Null);
    assert_eq!(payload["api_key_id"], Value::Null);
    assert_eq!(payload["enabled"], Value::Null);
    assert_eq!(payload["cached_principal_total"], 1);
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_identifies_negative_cache_hit_when_validator_enabled(
) {
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

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("authorization", "Bearer cp_admin_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_negative_token"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], true);
    assert_eq!(payload["hit"], false);
    assert_eq!(payload["cached_negative"], true);
    assert_eq!(payload["lookup_status"], "negative_hit");
    assert_eq!(payload["tenant_id"], Value::Null);
    assert_eq!(payload["api_key_id"], Value::Null);
    assert_eq!(payload["enabled"], Value::Null);
    assert_eq!(payload["cached_principal_total"], 1);
}

#[tokio::test]
async fn internal_debug_auth_cache_lookup_route_returns_disabled_response_when_validator_disabled()
{
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
                .uri("/internal/v1/debug/auth-cache/lookup")
                .header("authorization", "Bearer cp_allow_1")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_any"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(payload["auth_validator_enabled"], false);
    assert_eq!(payload["hit"], false);
    assert_eq!(payload["cached_negative"], false);
    assert_eq!(payload["lookup_status"], "validator_disabled");
    assert_eq!(payload["tenant_id"], Value::Null);
    assert_eq!(payload["api_key_id"], Value::Null);
    assert_eq!(payload["enabled"], Value::Null);
    assert_eq!(payload["cached_principal_total"], 0);
}

#[tokio::test]
async fn internal_debug_auth_cache_evict_route_returns_404_when_debug_routes_disabled() {
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
                .uri("/internal/v1/debug/auth-cache/evict")
                .header("authorization", "Bearer cp_disabled_token")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_disabled_token"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn internal_debug_auth_cache_evict_route_requires_bearer_token() {
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
                .uri("/internal/v1/debug/auth-cache/evict")
                .header("content-type", "application/json")
                .body(Body::from(r#"{"token":"cp_missing_bearer"}"#))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn internal_debug_auth_cache_evict_route_returns_400_for_invalid_body() {
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

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/debug/auth-cache/evict")
                .header("authorization", "Bearer cp_valid_token")
                .header("content-type", "application/json")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = response.into_body().collect().await.unwrap().to_bytes();
    let payload: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(payload["error"]["code"], "invalid_request");
}

