FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py memory.py tools.py streaming.py telemetry.py runs.py approvals.py conversation_repository.py conversation_titles.py attachment_repository.py attachment_context.py ./
COPY action_outcomes.py approval_repository.py video_availability.py tool_budget.py plan_tools.py model_request_budget.py ./
COPY tokenizer ./tokenizer
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
