# Repository Guidelines

## Project Structure & Module Organization
`template.yml` defines the SAM application. Lambda sources live in `src/put-book/` and `src/pre-traffic-check/`, with tests under `src/put-book/tests/unit/` and `src/put-book/tests/e2e/`. The CDK pipeline lives in `pipeline/bin/` and `pipeline/lib/`; CodeBuild specs are `pipeline/buildspec*.json`.

## Build, Test, and Development Commands
Use Node.js 24 and npm 11; `.nvmrc` pins the expected major version. Install dependencies inside each package, not at the repo root.

- `nvm use && cd src/put-book && npm ci && npm test` runs the Mocha unit suite with `TABLE=books`.
- `cd src/put-book && npm run e2e-test` runs DynamoDB-backed e2e tests. Use Docker or Finch to run `amazon/dynamodb-local` on port `8000`.
- `TABLE=books sam local invoke PutBookFunction -e events/sqs_event1.json --docker-network my-network` invokes the Lambda locally against containerized DynamoDB.
- `cd pipeline && npm ci && npm run build` compiles the CDK v2 pipeline TypeScript.
- `sam package ...` and `sam deploy ...` are the expected SAM packaging and deployment flow.

## Coding Style & Naming Conventions
Follow the style already present. Lambda code uses CommonJS, single quotes, semicolons, and concise async handlers. CDK code uses TypeScript classes with PascalCase constructs such as `PipelineStack`. Keep directory names kebab-case and test files ending in `.spec.js`. There is no dedicated linter, so match surrounding formatting.

## Testing Guidelines
Unit tests use `mocha`, `chai`, `sinon`, and `proxyquire`; e2e tests use Mocha against local DynamoDB. Add unit tests for handler logic and e2e coverage when persistence, IAM wiring, or event contracts change. CodeBuild uses a modern standard image plus `privileged: true` for Docker; do not re-add a deprecated `runtime-versions.docker` selector unless AWS requires it again.

## Commit & Pull Request Guidelines
Recent history favors short, imperative subjects such as `Bump mocha...` or `Update dependencies...`. Keep commits focused. Pull requests should include a clear description, linked issue when applicable, test evidence, and AWS deployment impact.

## Security & Configuration Tips
Never commit AWS credentials, generated artifacts, or secret values. The pipeline expects `github_username` in SSM Parameter Store and `github_token` in Secrets Manager as JSON: `{"github_token":"..."}`. The token must create repository webhooks. CDK deployment requires a bootstrapped target region, for example `cdk bootstrap aws://ACCOUNT/eu-west-1 --profile demos`.

## Agent-Specific Notes
Keep `AutoPublishAlias` environment-driven (`!Ref Environment`) unless the deployment model intentionally changes; staging and production rely on separate aliases. The Lambda packages vendor AWS SDK v3 clients because Node.js 24 Lambda runtimes do not support the old implicit `aws-sdk` v2 assumption safely.
