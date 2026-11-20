FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py memory.py tools.py streaming.py telemetry.py runs.py approvals.py conversation_repository.py conversation_titles.py attachment_repository.py attachment_context.py ./
COPY action_outcomes.py approval_repository.py video_availability.py tool_budget.py plan_tools.py model_request_budget.py chat_read_tools.py response_messages.py ./
COPY assistant_policy.py checkpoints.py checkpoint_tools.py provider_policy.py guided_setup.py multi_provider_core.py stream_lifecycle.py ./
COPY approval_actions.py assistant_metrics.py editorial_evaluation.py turn_recovery.py ./
COPY chat_history_sql.py ./
COPY websocket_transport.py ./
COPY tokenizer ./tokenizer
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--ws-max-size", "65536"]
