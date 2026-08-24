[planner-recovery] job bf8111ac-bb9e-4374-b370-1f313aeb2f38 falhou ao retomar: WorkflowFailedError: OpenRouter image error: {"success":false,"error":{"name":"ZodError","message":"[\n  {\n    \"code\": \"invalid_value\",\n    \"values\": [\n      \"512\",\n      \"1K\",\n      \"2K\",\n      \"4K\"\n    ],\n    \"path\": [\n      \"resolution\"\n    ],\n    \"message\": \"Invalid option: expected one of \\\"512\\\"|\\\"1K\\\"|\\\"2K\\\"|\\\"4K\\\"\"\n  }\n]"}}
    at WorkflowEngine.run (/home/diogo/fury-app-v2/apps/api/src/services/stateMachine/workflow.engine.ts:176:15)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async runPlannerWorkflow (/home/diogo/fury-app-v2/apps/api/src/planner-workflow-runner.ts:20:3) {
  jobId: 'bf8111ac-bb9e-4374-b370-1f313aeb2f38',
  stageId: 'image-generation'
}
[planner-worker] job failed {
  id: '2',
  error: 'OpenRouter image error: {"success":false,"error":{"name":"ZodError","message":"[\\n  {\\n    \\"code\\": \\"invalid_value\\",\\n    \\"values\\": [\\n      \\"512\\",\\n      \\"1K\\",\\n      \\"2K\\",\\n      \\"4K\\"\\n    ],\\n    \\"path\\": [\\n      \\"resolution\\"\\n    ],\\n    \\"message\\": \\"Invalid option: expected one of \\\\\\"512\\\\\\"|\\\\\\"1K\\\\\\"|\\\\\\"2K\\\\\\"|\\\\\\"4K\\\\\\"\\"\\n  }\\n]"}}'
}
