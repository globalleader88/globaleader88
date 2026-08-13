#!/usr/bin/env bash
#
# Provision the AWS resources the Client Intelligence Portal needs for a
# PRODUCTION deploy: a KMS key, a private encrypted S3 bucket, a least-privilege
# IAM user (for a non-AWS host like Render), and a Cognito user pool + app
# client. It then prints the exact environment values to paste into your host.
#
# Requirements: AWS CLI v2, logged in with permissions to create these
# resources (run it in AWS CloudShell for the simplest experience). It is
# idempotent-ish: re-running skips resources that already exist by name.
#
# Usage:
#   AWS_REGION=us-east-1 ./provision.sh
#   AWS_REGION=us-east-1 BUCKET=gc-portal-docs-acme ./provision.sh
#
# It does NOT enable Amazon Bedrock model access — that is a one-time console
# step (Bedrock → Model access → request Claude + Titan). The script checks it.

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
NAME_PREFIX="${NAME_PREFIX:-gc-portal}"
BUCKET="${BUCKET:-${NAME_PREFIX}-docs-${ACCOUNT_ID}}"
KMS_ALIAS="alias/${NAME_PREFIX}-s3"
IAM_USER="${NAME_PREFIX}-app"
POLICY_NAME="${NAME_PREFIX}-app-policy"
POOL_NAME="${NAME_PREFIX}-users"

CHAT_MODEL="${CHAT_MODEL:-anthropic.claude-3-5-sonnet-20240620-v1:0}"
LOW_MODEL="${LOW_MODEL:-anthropic.claude-3-haiku-20240307-v1:0}"
ADV_MODEL="${ADV_MODEL:-anthropic.claude-3-5-sonnet-20240620-v1:0}"
EMBED_MODEL="${EMBED_MODEL:-amazon.titan-embed-text-v2:0}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

say "Account ${ACCOUNT_ID} · region ${REGION}"

# ---------------------------------------------------------------------------
# 1) KMS key for S3 server-side encryption
# ---------------------------------------------------------------------------
say "KMS key (${KMS_ALIAS})"
if aws kms describe-key --key-id "${KMS_ALIAS}" --region "${REGION}" >/dev/null 2>&1; then
  KMS_KEY_ID="$(aws kms describe-key --key-id "${KMS_ALIAS}" --region "${REGION}" --query 'KeyMetadata.KeyId' --output text)"
  echo "exists: ${KMS_KEY_ID}"
else
  KMS_KEY_ID="$(aws kms create-key --region "${REGION}" \
    --description "${NAME_PREFIX} S3 document encryption" \
    --tags TagKey=app,TagValue=${NAME_PREFIX} \
    --query 'KeyMetadata.KeyId' --output text)"
  aws kms create-alias --region "${REGION}" --alias-name "${KMS_ALIAS}" --target-key-id "${KMS_KEY_ID}"
  echo "created: ${KMS_KEY_ID}"
fi
KMS_KEY_ARN="arn:aws:kms:${REGION}:${ACCOUNT_ID}:key/${KMS_KEY_ID}"

# ---------------------------------------------------------------------------
# 2) Private, encrypted, versioned S3 bucket
# ---------------------------------------------------------------------------
say "S3 bucket (${BUCKET})"
if aws s3api head-bucket --bucket "${BUCKET}" 2>/dev/null; then
  echo "exists"
else
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}"
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration LocationConstraint="${REGION}"
  fi
  echo "created"
fi

aws s3api put-public-access-block --bucket "${BUCKET}" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws s3api put-bucket-versioning --bucket "${BUCKET}" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption --bucket "${BUCKET}" \
  --server-side-encryption-configuration "{
    \"Rules\": [{
      \"ApplyServerSideEncryptionByDefault\": {\"SSEAlgorithm\": \"aws:kms\", \"KMSMasterKeyID\": \"${KMS_KEY_ARN}\"},
      \"BucketKeyEnabled\": true
    }]
  }"

# Deny any non-TLS access and any unencrypted put.
aws s3api put-bucket-policy --bucket "${BUCKET}" --policy "{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Sid\": \"DenyInsecureTransport\", \"Effect\": \"Deny\", \"Principal\": \"*\",
     \"Action\": \"s3:*\", \"Resource\": [\"arn:aws:s3:::${BUCKET}\", \"arn:aws:s3:::${BUCKET}/*\"],
     \"Condition\": {\"Bool\": {\"aws:SecureTransport\": \"false\"}}},
    {\"Sid\": \"DenyUnencryptedPuts\", \"Effect\": \"Deny\", \"Principal\": \"*\",
     \"Action\": \"s3:PutObject\", \"Resource\": \"arn:aws:s3:::${BUCKET}/*\",
     \"Condition\": {\"StringNotEquals\": {\"s3:x-amz-server-side-encryption\": \"aws:kms\"}}}
  ]
}"
echo "bucket hardened: block-public-access, SSE-KMS default, versioning, TLS-only"

# ---------------------------------------------------------------------------
# 3) Least-privilege IAM user for the app (Render / non-AWS host)
#    On AWS hosting (ECS/EC2) prefer an IAM ROLE instead of a user + keys.
# ---------------------------------------------------------------------------
say "IAM user (${IAM_USER}) + scoped policy"
aws iam get-user --user-name "${IAM_USER}" >/dev/null 2>&1 || aws iam create-user --user-name "${IAM_USER}" >/dev/null

POLICY_DOC="{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {\"Sid\": \"S3Docs\", \"Effect\": \"Allow\",
     \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\", \"s3:ListBucket\"],
     \"Resource\": [\"arn:aws:s3:::${BUCKET}\", \"arn:aws:s3:::${BUCKET}/organizations/*\"]},
    {\"Sid\": \"KmsForS3\", \"Effect\": \"Allow\",
     \"Action\": [\"kms:Encrypt\", \"kms:Decrypt\", \"kms:GenerateDataKey\", \"kms:DescribeKey\"],
     \"Resource\": \"${KMS_KEY_ARN}\"},
    {\"Sid\": \"BedrockInvoke\", \"Effect\": \"Allow\",
     \"Action\": [\"bedrock:InvokeModel\", \"bedrock:InvokeModelWithResponseStream\"],
     \"Resource\": [
       \"arn:aws:bedrock:${REGION}::foundation-model/${CHAT_MODEL}\",
       \"arn:aws:bedrock:${REGION}::foundation-model/${LOW_MODEL}\",
       \"arn:aws:bedrock:${REGION}::foundation-model/${ADV_MODEL}\",
       \"arn:aws:bedrock:${REGION}::foundation-model/${EMBED_MODEL}\"
     ]}
  ]
}"
POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/${POLICY_NAME}"
if aws iam get-policy --policy-arn "${POLICY_ARN}" >/dev/null 2>&1; then
  VER="$(aws iam create-policy-version --policy-arn "${POLICY_ARN}" --policy-document "${POLICY_DOC}" --set-as-default --query 'PolicyVersion.VersionId' --output text)"
  echo "policy updated (${VER})"
else
  aws iam create-policy --policy-name "${POLICY_NAME}" --policy-document "${POLICY_DOC}" >/dev/null
  echo "policy created"
fi
aws iam attach-user-policy --user-name "${IAM_USER}" --policy-arn "${POLICY_ARN}"

say "IAM access key"
echo "Creating a new access key for ${IAM_USER}. Store these secrets now — the"
echo "secret is shown only once. (Delete old keys in IAM if you re-run this.)"
KEY_JSON="$(aws iam create-access-key --user-name "${IAM_USER}")"
AWS_ACCESS_KEY_ID="$(echo "${KEY_JSON}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["AccessKey"]["AccessKeyId"])')"
AWS_SECRET_ACCESS_KEY="$(echo "${KEY_JSON}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["AccessKey"]["SecretAccessKey"])')"

# ---------------------------------------------------------------------------
# 4) Cognito user pool + app client (USER_PASSWORD_AUTH)
# ---------------------------------------------------------------------------
say "Cognito user pool (${POOL_NAME})"
POOL_ID="$(aws cognito-idp list-user-pools --max-results 60 --region "${REGION}" \
  --query "UserPools[?Name=='${POOL_NAME}'].Id | [0]" --output text)"
if [ "${POOL_ID}" = "None" ] || [ -z "${POOL_ID}" ]; then
  POOL_ID="$(aws cognito-idp create-user-pool --region "${REGION}" --pool-name "${POOL_NAME}" \
    --auto-verified-attributes email \
    --username-attributes email \
    --policies '{"PasswordPolicy":{"MinimumLength":12,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":true}}' \
    --query 'UserPool.Id' --output text)"
  echo "created: ${POOL_ID}"
else
  echo "exists: ${POOL_ID}"
fi

CLIENT_ID="$(aws cognito-idp list-user-pool-clients --user-pool-id "${POOL_ID}" --region "${REGION}" \
  --query "UserPoolClients[?ClientName=='${NAME_PREFIX}-web'].ClientId | [0]" --output text)"
if [ "${CLIENT_ID}" = "None" ] || [ -z "${CLIENT_ID}" ]; then
  CREATE="$(aws cognito-idp create-user-pool-client --region "${REGION}" --user-pool-id "${POOL_ID}" \
    --client-name "${NAME_PREFIX}-web" --generate-secret \
    --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH)"
  CLIENT_ID="$(echo "${CREATE}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["UserPoolClient"]["ClientId"])')"
  echo "client created: ${CLIENT_ID}"
fi
CLIENT_SECRET="$(aws cognito-idp describe-user-pool-client --region "${REGION}" \
  --user-pool-id "${POOL_ID}" --client-id "${CLIENT_ID}" \
  --query 'UserPoolClient.ClientSecret' --output text)"

# ---------------------------------------------------------------------------
# 5) Bedrock access check (best-effort)
# ---------------------------------------------------------------------------
say "Bedrock model access check"
if aws bedrock list-foundation-models --region "${REGION}" >/dev/null 2>&1; then
  echo "Bedrock reachable. Ensure model ACCESS is granted in the console:"
  echo "  Bedrock → Model access → enable Claude 3.5 Sonnet, Claude 3 Haiku, Titan Text Embeddings V2."
else
  echo "WARNING: could not list Bedrock models — enable Bedrock + request model access in the console."
fi

# ---------------------------------------------------------------------------
# Output: env values to paste into your host (Render service → Environment)
# ---------------------------------------------------------------------------
say "DONE — set these on your host (Render → gc-portal → Environment):"
cat <<EOF

  NODE_ENV=production
  ENABLE_DEV_AUTH=false
  ALLOW_INSECURE_DEMO=false
  AI_DRIVER=bedrock
  STORAGE_DRIVER=s3
  AWS_REGION=${REGION}
  AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
  AWS_S3_BUCKET=${BUCKET}
  AWS_KMS_KEY_ID=${KMS_KEY_ARN}
  AWS_BEDROCK_CHAT_MODEL_ID=${CHAT_MODEL}
  AWS_BEDROCK_LOW_COST_MODEL_ID=${LOW_MODEL}
  AWS_BEDROCK_ADVANCED_MODEL_ID=${ADV_MODEL}
  AWS_BEDROCK_EMBEDDING_MODEL_ID=${EMBED_MODEL}
  AWS_BEDROCK_EMBEDDING_DIMENSION=1024
  COGNITO_USER_POOL_ID=${POOL_ID}
  COGNITO_CLIENT_ID=${CLIENT_ID}
  COGNITO_CLIENT_SECRET=${CLIENT_SECRET}
  COGNITO_REGION=${REGION}

Also keep DATABASE_URL/DIRECT_URL (from your managed Postgres) and a strong
SESSION_SECRET. Store the AWS secret + Cognito secret somewhere safe now.
EOF
