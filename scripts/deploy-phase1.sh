#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

STACK_NAME="${STACK_NAME:-pokepredict-dev-stack}"
PIPELINE_SOURCE="${SOURCE_NAME:-tcgdex}"
SEED_SOURCE="${SEED_SOURCE:-$PIPELINE_SOURCE}"
RUN_SEED="false"
RUN_PIPELINE="false"

print_usage() {
  cat <<'USAGE'
Usage: bash scripts/deploy-phase1.sh [--seed] [--run]

Options:
  --seed   Seed cards after deploy.
  --run    Trigger one manual ingestion execution after deploy.
  --help   Show this help text.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)
      RUN_SEED="true"
      ;;
    --run)
      RUN_PIPELINE="true"
      ;;
    --help|-h)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
  shift
done

echo "[phase1] Building shared + pipeline"
pnpm --filter @pokepredict/shared build
pnpm --filter @pokepredict/pipeline build

echo "[phase1] Deploying CDK stack: $STACK_NAME"
pnpm --filter @pokepredict/cdk exec cdk deploy "$STACK_NAME" --require-approval never

echo "[phase1] Reading CloudFormation outputs"
TABLE_CARDS="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='CardsTableName'].OutputValue" --output text)"
RAW_BUCKET="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='RawBucketName'].OutputValue" --output text)"
INGESTION_ARN="$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" --query "Stacks[0].Outputs[?OutputKey=='IngestionStateMachineArn'].OutputValue" --output text)"

SEED_COMMAND="generate:data"
if [[ "$SEED_SOURCE" == "tcgdex" ]]; then
  SEED_COMMAND="generate:data:tcgdex"
fi

if [[ "$RUN_SEED" == "true" ]]; then
  echo "[phase1] Seeding cards into $TABLE_CARDS using source=$SEED_SOURCE ($SEED_COMMAND)"
  TABLE_CARDS="$TABLE_CARDS" pnpm "$SEED_COMMAND"
else
  echo "[phase1] Skipping seed (pass --seed to enable)"
fi

cat > .phase1.env <<ENVFILE
TABLE_CARDS=$TABLE_CARDS
RAW_BUCKET=$RAW_BUCKET
INGESTION_ARN=$INGESTION_ARN
STACK_NAME=$STACK_NAME
PIPELINE_SOURCE=$PIPELINE_SOURCE
SEED_SOURCE=$SEED_SOURCE
ENVFILE

echo "[phase1] Wrote outputs to .phase1.env"

if [[ "$RUN_PIPELINE" == "true" ]]; then
  RUN_ID="run_manual_$(date +%s)"
  AS_OF="$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")"
  echo "[phase1] Triggering manual execution ($RUN_ID) with source=$PIPELINE_SOURCE"
  EXEC_ARN="$(aws stepfunctions start-execution \
    --state-machine-arn "$INGESTION_ARN" \
    --input "{\"source\":\"$PIPELINE_SOURCE\",\"mode\":\"manual\",\"runId\":\"$RUN_ID\",\"asOf\":\"$AS_OF\"}" \
    --query executionArn --output text)"

  echo "[phase1] Execution ARN: $EXEC_ARN"
  echo "[phase1] Polling execution status..."

  while true; do
    STATUS="$(aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --query status --output text)"
    echo "  status=$STATUS"
    if [[ "$STATUS" == "SUCCEEDED" ]]; then
      break
    fi
    if [[ "$STATUS" == "FAILED" || "$STATUS" == "TIMED_OUT" || "$STATUS" == "ABORTED" ]]; then
      aws stepfunctions describe-execution --execution-arn "$EXEC_ARN" --query "{status:status,error:error,cause:cause}" --output json
      exit 1
    fi
    sleep 3
  done

  echo "[phase1] Recent raw objects:"
  aws s3 ls "s3://$RAW_BUCKET/raw/" --recursive | tail -n 10 || true
fi

echo "[phase1] Done"
