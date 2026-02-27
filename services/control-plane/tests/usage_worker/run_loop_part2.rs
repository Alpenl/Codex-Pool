#[tokio::test]
async fn dual_level_aggregation() {
    let account_id = Uuid::new_v4();
    let tenant_id = Uuid::new_v4();
    let api_key_id = Uuid::new_v4();

    let first = StreamMessage {
        message_id: "1708260000000-1".to_string(),
        event: sample_event(
            account_id,
            Utc.with_ymd_and_hms(2026, 2, 18, 14, 11, 1).unwrap(),
        ),
        tenant_id: Some(tenant_id),
        api_key_id: Some(api_key_id),
    };
    let second = StreamMessage {
        message_id: "1708260000000-2".to_string(),
        event: sample_event(
            account_id,
            Utc.with_ymd_and_hms(2026, 2, 18, 14, 45, 9).unwrap(),
        ),
        tenant_id: Some(tenant_id),
        api_key_id: Some(api_key_id),
    };

    let reader = RecordingStreamReader::with_responses(vec![], vec![first, second]);
    let repo = RecordingRepo::default();
    let worker = UsageAggregationWorker::new(reader, repo.clone());

    worker.run_once().await.unwrap();

    let account_rows = repo.account_rows.lock().unwrap().clone();
    assert_eq!(account_rows.len(), 1);
    assert_eq!(account_rows[0].request_count, 2);

    let tenant_rows = repo.tenant_api_key_rows.lock().unwrap().clone();
    assert_eq!(tenant_rows.len(), 1);
    assert_eq!(tenant_rows[0].request_count, 2);
}

#[tokio::test]
async fn missing_identity_fields_falls_back_to_account_only_aggregation() {
    let account_id = Uuid::new_v4();

    let message = StreamMessage {
        message_id: "1708260000000-3".to_string(),
        event: sample_event(
            account_id,
            Utc.with_ymd_and_hms(2026, 2, 18, 15, 2, 7).unwrap(),
        ),
        tenant_id: None,
        api_key_id: None,
    };

    let reader = RecordingStreamReader::with_responses(vec![], vec![message]);
    let repo = RecordingRepo::default();
    let worker = UsageAggregationWorker::new(reader, repo.clone());

    worker.run_once().await.unwrap();

    let account_rows = repo.account_rows.lock().unwrap().clone();
    assert_eq!(account_rows.len(), 1);
    assert_eq!(account_rows[0].request_count, 1);

    let tenant_rows = repo.tenant_api_key_rows.lock().unwrap().clone();
    assert!(tenant_rows.is_empty());
}

#[tokio::test]
async fn shutdown_flushes_and_acks_buffered_messages() {
    let account_id = Uuid::new_v4();
    let message = StreamMessage {
        message_id: "1708260000000-4".to_string(),
        event: sample_event(
            account_id,
            Utc.with_ymd_and_hms(2026, 2, 18, 15, 32, 11).unwrap(),
        ),
        tenant_id: None,
        api_key_id: None,
    };

    let reader = SequencedStreamReader::new(vec![vec![]], vec![vec![message]])
        .with_pause_on_empty_read(Arc::new(Notify::new()));
    let repo = RecordingRepo::default();
    let config = UsageWorkerConfig {
        stream_read_count: 10,
        stream_block: Duration::from_millis(20),
        reclaim_count: 10,
        reclaim_min_idle: Duration::from_millis(100),
        flush_min_batch: 100,
        flush_interval: Duration::from_secs(60),
        metrics_log_interval: Duration::from_secs(10),
        error_backoff: Duration::from_millis(1000),
        error_backoff_factor: 2,
        error_backoff_max: Duration::from_millis(10000),
        error_backoff_jitter_pct: 0,
        error_backoff_jitter_seed: None,
        max_consecutive_errors: 0,
    };
    let worker = UsageAggregationWorker::with_config(reader.clone(), repo.clone(), config);

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let handle = tokio::spawn(async move {
        worker
            .run_until_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
    });

    timeout(Duration::from_secs(1), async {
        loop {
            let read_calls = reader
                .snapshot()
                .calls
                .iter()
                .filter(|call| call.as_str() == "read")
                .count();
            if read_calls >= 1 {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();

    shutdown_tx.send(()).unwrap();

    let join_result = timeout(Duration::from_secs(2), handle).await.unwrap();
    join_result.unwrap().unwrap();

    let snapshot = reader.snapshot();
    assert_eq!(snapshot.acked, vec![vec!["1708260000000-4".to_string()]]);

    let account_rows = repo.account_rows.lock().unwrap().clone();
    assert_eq!(account_rows.len(), 1);
    assert_eq!(account_rows[0].request_count, 1);
}

#[tokio::test]
async fn interval_flush_still_works_without_reaching_batch_size() {
    let account_id = Uuid::new_v4();
    let message = StreamMessage {
        message_id: "1708260000000-5".to_string(),
        event: sample_event(
            account_id,
            Utc.with_ymd_and_hms(2026, 2, 18, 16, 12, 48).unwrap(),
        ),
        tenant_id: None,
        api_key_id: None,
    };

    let reader = SequencedStreamReader::new(vec![vec![]], vec![vec![message]]);
    let repo = RecordingRepo::default();
    let config = UsageWorkerConfig {
        stream_read_count: 5,
        stream_block: Duration::from_millis(5),
        reclaim_count: 5,
        reclaim_min_idle: Duration::from_millis(50),
        flush_min_batch: 100,
        flush_interval: Duration::from_millis(30),
        metrics_log_interval: Duration::from_secs(10),
        error_backoff: Duration::from_millis(1000),
        error_backoff_factor: 2,
        error_backoff_max: Duration::from_millis(10000),
        error_backoff_jitter_pct: 0,
        error_backoff_jitter_seed: None,
        max_consecutive_errors: 0,
    };
    let worker = UsageAggregationWorker::with_config(reader.clone(), repo.clone(), config);

    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let handle = tokio::spawn(async move {
        worker
            .run_until_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await
    });

    timeout(Duration::from_secs(2), async {
        loop {
            if !reader.snapshot().acked.is_empty() {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    shutdown_tx.send(()).unwrap();

    let join_result = timeout(Duration::from_secs(2), handle).await.unwrap();
    join_result.unwrap().unwrap();

    let snapshot = reader.snapshot();
    assert_eq!(snapshot.acked, vec![vec!["1708260000000-5".to_string()]]);

    let account_rows = repo.account_rows.lock().unwrap().clone();
    assert_eq!(account_rows.len(), 1);
    assert_eq!(account_rows[0].request_count, 1);
}

#[tokio::test]
async fn worker_exits_when_consecutive_errors_hit_limit() {
    let reader = ErrorSequenceStreamReader::new(
        vec![
            Err(anyhow::anyhow!("reclaim failed once")),
            Err(anyhow::anyhow!("reclaim failed twice")),
        ],
        vec![],
        vec![],
    );
    let repo = RecordingRepo::default();
    let config = UsageWorkerConfig {
        stream_read_count: 1,
        stream_block: Duration::from_millis(1),
        reclaim_count: 1,
        reclaim_min_idle: Duration::from_millis(1),
        flush_min_batch: 1,
        flush_interval: Duration::from_secs(1),
        metrics_log_interval: Duration::from_secs(10),
        error_backoff: Duration::from_millis(1),
        error_backoff_factor: 2,
        error_backoff_max: Duration::from_millis(10000),
        error_backoff_jitter_pct: 0,
        error_backoff_jitter_seed: None,
        max_consecutive_errors: 2,
    };

    let worker = UsageAggregationWorker::with_config(reader.clone(), repo, config);

    let error = worker
        .run_until_shutdown(std::future::pending::<()>())
        .await
        .unwrap_err();
    assert!(error.to_string().contains("max_consecutive_errors"));

    let snapshot = reader.snapshot();
    assert_eq!(snapshot.calls, vec!["ensure", "reclaim", "reclaim"]);
    assert!(snapshot.acked.is_empty());
}

#[tokio::test]
async fn successful_round_resets_consecutive_errors_counter() {
    let account_id = Uuid::new_v4();
    let message = StreamMessage {
        message_id: "1708260000000-reset".to_string(),
        event: sample_event(
            account_id,
            Utc.with_ymd_and_hms(2026, 2, 18, 16, 44, 21).unwrap(),
        ),
        tenant_id: None,
        api_key_id: None,
    };

    let reader = ErrorSequenceStreamReader::new(
        vec![
            Err(anyhow::anyhow!("reclaim failed before success")),
            Ok(Vec::new()),
            Err(anyhow::anyhow!("reclaim failed after success once")),
            Err(anyhow::anyhow!("reclaim failed after success twice")),
        ],
        vec![Ok(vec![message])],
        vec![Ok(())],
    );
    let repo = RecordingRepo::default();
    let config = UsageWorkerConfig {
        stream_read_count: 1,
        stream_block: Duration::from_millis(1),
        reclaim_count: 1,
        reclaim_min_idle: Duration::from_millis(1),
        flush_min_batch: 1,
        flush_interval: Duration::from_secs(1),
        metrics_log_interval: Duration::from_secs(10),
        error_backoff: Duration::from_millis(1),
        error_backoff_factor: 2,
        error_backoff_max: Duration::from_millis(10000),
        error_backoff_jitter_pct: 0,
        error_backoff_jitter_seed: None,
        max_consecutive_errors: 2,
    };

    let worker = UsageAggregationWorker::with_config(reader.clone(), repo.clone(), config);

    let error = worker
        .run_until_shutdown(std::future::pending::<()>())
        .await
        .unwrap_err();
    assert!(error.to_string().contains("max_consecutive_errors"));

    let snapshot = reader.snapshot();
    assert_eq!(
        snapshot.calls,
        vec!["ensure", "reclaim", "reclaim", "read", "ack", "reclaim", "reclaim"]
    );
    assert_eq!(
        snapshot.acked,
        vec![vec!["1708260000000-reset".to_string()]]
    );

    let account_rows = repo.account_rows.lock().unwrap().clone();
    assert_eq!(account_rows.len(), 1);
    assert_eq!(account_rows[0].request_count, 1);
}
