import { SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipelineActions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export class PipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const accountId = this.account;

    // Bucket for pipeline artifacts
    const pipelineArtifactBucket = new s3.Bucket(this, 'CiCdPipelineArtifacts', {
      bucketName: `ci-cd-pipeline-artifacts-${accountId}`,
      encryption: s3.BucketEncryption.S3_MANAGED
    });

    const appArtifactBucket = new s3.Bucket(this, 'AppArtifacts', {
      bucketName: `aws-serverless-app-artifacts-${accountId}`,
      encryption: s3.BucketEncryption.S3_MANAGED
    });

    // Source
    const sourceArtifacts = new codepipeline.Artifact();
    const sourceAction = new codepipelineActions.GitHubSourceAction({
      actionName: 'Source',
      owner: ssm.StringParameter.fromStringParameterName(this, 'GithubUsername', 'github_username').stringValue,
      repo: 'aws-serverless-app-sam-cdk',
      oauthToken: SecretValue.secretsManager('github_token', {jsonField: 'github_token'}),
      output: sourceArtifacts,
      branch: 'main',
      trigger: codepipelineActions.GitHubTrigger.WEBHOOK,
      variablesNamespace: 'SourceVariables'
    });

    // Build
    const buildProject = new codebuild.PipelineProject(this, 'CiCdBuild', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('pipeline/buildspec.json'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0
      },
      projectName: 'aws-serverless-app-build'
    });

    appArtifactBucket.grantPut(buildProject);

    const buildArtifacts = new codepipeline.Artifact();
    const buildAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Build',
      input: sourceArtifacts,
      environmentVariables: {
        S3_BUCKET: {value: appArtifactBucket.bucketName},
        GIT_BRANCH: {value: sourceAction.variables.branchName}
      },
      project: buildProject,
      variablesNamespace: 'BuildVariables',
      outputs: [buildArtifacts]
    });

    // Test
    const testProject = new codebuild.PipelineProject(this, 'CiCdTest', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('pipeline/buildspec-test.json'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        privileged: true
      },
      projectName: 'aws-serverless-app-test'
    });

    const testAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Test',
      input: sourceArtifacts,
      environmentVariables: {
        TABLE: {value: 'books'},
        E2E_TEST: {value: 'true'}
      },
      project: testProject
    });

    // Deploy
    const deployProject = new codebuild.PipelineProject(this, 'CiCdDeploy', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('pipeline/buildspec-deploy.json'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0
      },
      projectName: 'aws-serverless-app-deploy'
    });

    appArtifactBucket.grantRead(deployProject);
    deployProject.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCloudFormationFullAccess'));
    deployProject.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'));
    deployProject.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'));
    deployProject.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambda_FullAccess'));
    deployProject.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('IAMFullAccess'));
    deployProject.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AWSCodeDeployFullAccess'));

    // Deploy to staging
    const deployToStagingAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Deploy',
      input: sourceArtifacts,
      environmentVariables: {
        STACK_NAME: {value: 'aws-serverless-app-staging'},
        ENVIRONMENT: {value: 'staging'},
        ARTIFACTS_PATH: {value: buildAction.variable('ARTIFACTS_PATH')}
      },
      project: deployProject
    });

    // Deploy to production
    const manualApprovalAction = new codepipelineActions.ManualApprovalAction({
      actionName: 'Review',
      additionalInformation: 'Ensure AWS Lambda function works correctly in Staging and release date is agreed with Product Owners',
      runOrder: 1
    });

    const deployToProductionAction = new codepipelineActions.CodeBuildAction({
      actionName: 'Deploy',
      input: sourceArtifacts,
      environmentVariables: {
        STACK_NAME: {value: 'aws-serverless-app-production'},
        ENVIRONMENT: {value: 'production'},
        ARTIFACTS_PATH: {value: buildAction.variable('ARTIFACTS_PATH')}
      },
      project: deployProject,
      runOrder: 2
    });

    // Pipeline
    new codepipeline.Pipeline(this, 'CiCdPipeline', {
      pipelineName: 'aws-serverless-app',
      artifactBucket: pipelineArtifactBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [sourceAction],
        }, {
          stageName: 'Build',
          actions: [buildAction]
        }, {
          stageName: 'Test',
          actions: [testAction]
        }, {
          stageName: 'Deploy-to-Staging',
          actions: [deployToStagingAction]
        }, {
          stageName: 'Deploy-to-Production',
          actions: [manualApprovalAction, deployToProductionAction]
        }
      ]
    });
  }
}
