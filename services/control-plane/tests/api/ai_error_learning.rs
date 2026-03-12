#[tokio::test]
async fn ai_error_learning_snapshot_exposes_defaults() {
    let app = build_app();

    let response = app
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

    assert_eq!(response.status(), StatusCode::OK);
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let payload: Value = serde_json::from_slice(&body).unwrap();

    assert_eq!(
        payload["ai_error_learning_settings"],
        json!({
            "enabled": false,
            "first_seen_timeout_ms": 2000,
            "review_hit_threshold": 10
        })
    );
    assert_eq!(payload["approved_upstream_error_templates"], json!([]));
}

#[tokio::test]
async fn ai_error_learning_internal_resolve_reuses_templates_and_marks_review_pending() {
    let app = build_app();

    let first_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/upstream-errors/resolve")
                .header(
                    "authorization",
                    format!("Bearer {}", internal_service_token()),
                )
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "fingerprint": "openai_compatible:400:model_not_found",
                        "provider": "openai_compatible",
                        "normalized_status_code": 400,
                        "normalized_upstream_message": "The model {model} does not exist",
                        "target_locale": "zh-CN",
                        "model": "gpt-5.4"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(first_response.status(), StatusCode::OK);
    let first_body = to_bytes(first_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let first_json: Value = serde_json::from_slice(&first_body).unwrap();
    assert_eq!(first_json["template"]["status"], "provisional_live");
    assert_eq!(first_json["template"]["hit_count"], 1);
    assert_eq!(
        first_json["template"]["templates"]["zh-CN"],
        "请求的模型当前不可用。"
    );

    let template_id = first_json["template"]["id"]
        .as_str()
        .expect("template id")
        .to_string();

    for _ in 0..9 {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/internal/v1/upstream-errors/resolve")
                    .header(
                        "authorization",
                        format!("Bearer {}", internal_service_token()),
                    )
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({
                            "fingerprint": "openai_compatible:400:model_not_found",
                            "provider": "openai_compatible",
                            "normalized_status_code": 400,
                            "normalized_upstream_message": "The model {model} does not exist",
                            "target_locale": "en",
                            "model": "gpt-5.4"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    let admin_token = login_admin_token(&app).await;
    let list_response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/admin/model-routing/upstream-errors")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = to_bytes(list_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let list_json: Value = serde_json::from_slice(&list_body).unwrap();
    assert_eq!(list_json["templates"][0]["id"], template_id);
    assert_eq!(list_json["templates"][0]["status"], "review_pending");
    assert_eq!(list_json["templates"][0]["hit_count"], 10);
    assert_eq!(
        list_json["templates"][0]["templates"]["en"],
        "The requested model is not available."
    );
}

#[tokio::test]
async fn ai_error_learning_admin_review_endpoints_work_and_reject_raw_prompt_payloads() {
    let app = build_app();
    let admin_token = login_admin_token(&app).await;

    let invalid_payload_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/upstream-errors/resolve")
                .header(
                    "authorization",
                    format!("Bearer {}", internal_service_token()),
                )
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "fingerprint": "openai_compatible:400:generic",
                        "provider": "openai_compatible",
                        "normalized_status_code": 400,
                        "normalized_upstream_message": "Unknown upstream request failure",
                        "target_locale": "en",
                        "user_prompt": "do not store me"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(invalid_payload_response.status(), StatusCode::BAD_REQUEST);

    let resolve_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/upstream-errors/resolve")
                .header(
                    "authorization",
                    format!("Bearer {}", internal_service_token()),
                )
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "fingerprint": "openai_compatible:429:usage_limit",
                        "provider": "openai_compatible",
                        "normalized_status_code": 429,
                        "normalized_upstream_message": "The usage limit has been reached",
                        "target_locale": "en"
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resolve_response.status(), StatusCode::OK);
    let resolve_body = to_bytes(resolve_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let resolve_json: Value = serde_json::from_slice(&resolve_body).unwrap();
    let template_id = resolve_json["template"]["id"].as_str().expect("template id");

    let update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/v1/admin/model-routing/upstream-errors/{template_id}"
                ))
                .header("authorization", format!("Bearer {admin_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "semantic_error_code": "quota_exhausted",
                        "action": "retry_cross_account",
                        "retry_scope": "cross_account",
                        "templates": {
                            "en": "The upstream quota is exhausted. Please retry shortly.",
                            "zh-CN": "上游额度已耗尽，请稍后重试。"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_response.status(), StatusCode::OK);

    let rewrite_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/admin/model-routing/upstream-errors/{template_id}/rewrite"
                ))
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rewrite_response.status(), StatusCode::OK);
    let rewrite_body = to_bytes(rewrite_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rewrite_json: Value = serde_json::from_slice(&rewrite_body).unwrap();
    assert!(rewrite_json["template"]["templates"]["ja"].is_string());

    let approve_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/admin/model-routing/upstream-errors/{template_id}/approve"
                ))
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(approve_response.status(), StatusCode::OK);

    let snapshot_response = app
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
    assert_eq!(snapshot_response.status(), StatusCode::OK);
    let snapshot_body = to_bytes(snapshot_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let snapshot_json: Value = serde_json::from_slice(&snapshot_body).unwrap();
    assert_eq!(
        snapshot_json["approved_upstream_error_templates"][0]["id"],
        template_id
    );

    let reject_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!(
                    "/api/v1/admin/model-routing/upstream-errors/{template_id}/reject"
                ))
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reject_response.status(), StatusCode::OK);
}

#[tokio::test]
async fn ai_error_learning_internal_resolve_uses_sanitized_raw_hint_for_heuristics() {
    let app = build_app();

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/internal/v1/upstream-errors/resolve")
                .header(
                    "authorization",
                    format!("Bearer {}", internal_service_token()),
                )
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "fingerprint": "openai_compatible:400:unsupported-model-from-sanitized-raw",
                        "provider": "openai_compatible",
                        "normalized_status_code": 400,
                        "normalized_upstream_message": "Unknown upstream request failure",
                        "sanitized_upstream_raw": "{\"detail\":\"The '{model}' model is not supported when using Codex with a ChatGPT account.\",\"input\":\"[redacted]\"}",
                        "target_locale": "en",
                        "model": "gpt-5.4"
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
    assert_eq!(payload["template"]["semantic_error_code"], "unsupported_model");
    assert_eq!(
        payload["template"]["templates"]["en"],
        "The requested model is not available."
    );
}

#[tokio::test]
async fn ai_error_learning_admin_builtin_templates_support_update_rewrite_and_reset() {
    let app = build_app();
    let admin_token = login_admin_token(&app).await;

    let list_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/v1/admin/model-routing/builtin-error-templates")
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(list_response.status(), StatusCode::OK);
    let list_body = to_bytes(list_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let list_json: Value = serde_json::from_slice(&list_body).unwrap();
    assert!(
        list_json["templates"]
            .as_array()
            .is_some_and(|items| !items.is_empty())
    );
    assert_eq!(
        list_json["templates"][0]["kind"].as_str(),
        Some("gateway_error")
    );
    assert_eq!(
        list_json["templates"]
            .as_array()
            .unwrap()
            .iter()
            .find(|item| item["kind"] == "heuristic_upstream" && item["code"] == "unsupported_model")
            .and_then(|item| item["templates"]["en"].as_str()),
        Some("The requested model is not available.")
    );

    let update_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(
                    "/api/v1/admin/model-routing/builtin-error-templates/heuristic_upstream/unsupported_model",
                )
                .header("authorization", format!("Bearer {admin_token}"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "templates": {
                            "en": "The requested model is unavailable on the selected upstream account.",
                            "zh-CN": "当前上游账号暂不支持该模型。"
                        }
                    })
                    .to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(update_response.status(), StatusCode::OK);
    let update_body = to_bytes(update_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let update_json: Value = serde_json::from_slice(&update_body).unwrap();
    assert_eq!(
        update_json["template"]["templates"]["zh-CN"].as_str(),
        Some("当前上游账号暂不支持该模型。")
    );
    assert_eq!(
        update_json["template"]["default_templates"]["en"].as_str(),
        Some("The requested model is not available.")
    );
    assert_eq!(
        update_json["template"]["action"].as_str(),
        Some("return_failure")
    );

    let rewrite_response = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(
                    "/api/v1/admin/model-routing/builtin-error-templates/gateway_error/no_upstream_account/rewrite",
                )
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(rewrite_response.status(), StatusCode::OK);
    let rewrite_body = to_bytes(rewrite_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let rewrite_json: Value = serde_json::from_slice(&rewrite_body).unwrap();
    assert_eq!(rewrite_json["template"]["kind"].as_str(), Some("gateway_error"));
    assert!(rewrite_json["template"]["templates"]["ja"].is_string());

    let reset_response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(
                    "/api/v1/admin/model-routing/builtin-error-templates/heuristic_upstream/unsupported_model/reset",
                )
                .header("authorization", format!("Bearer {admin_token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(reset_response.status(), StatusCode::OK);
    let reset_body = to_bytes(reset_response.into_body(), usize::MAX)
        .await
        .unwrap();
    let reset_json: Value = serde_json::from_slice(&reset_body).unwrap();
    assert_eq!(
        reset_json["template"]["templates"]["en"].as_str(),
        Some("The requested model is not available.")
    );
    assert_eq!(reset_json["template"]["is_overridden"], Value::Bool(false));
}
