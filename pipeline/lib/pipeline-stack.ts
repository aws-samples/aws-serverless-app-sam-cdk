import * as cdk from '@aws-cdk/core';
import * as codebuild from '@aws-cdk/aws-codebuild';
import * as codepipeline from '@aws-cdk/aws-codepipeline';
import * as codepipeline_actions from '@aws-cdk/aws-codepipeline-actions';
import * as ssm from '@aws-cdk/aws-ssm';

import { CodeBuildAction, GitHubSourceAction, ManualApprovalAction } from '@aws-cdk/aws-codepipeline-actions';
import { Bucket, BucketEncryption } from '@aws-cdk/aws-s3';

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const accountId = this.account;

    // Bucket for pipeline artifacts
    const pipelineArtifactBucket = new Bucket(this, 'CiCdPipelineArtifacts', {
      bucketName: `ci-cd-pipeline-artifacts-${accountId}`,
      encryption: BucketEncryption.S3_MANAGED
    });

    const appArtifactBucket = new Bucket(this, 'AppArtifacts', {
      bucketName: `aws-serverless-app-artifacts-${accountId}`,
      encryption: BucketEncryption.S3_MANAGED
    });

    // Source (https://docs.aws.amazon.com/cdk/api/latest/docs/aws-codepipeline-actions-readme.html)
    const sourceArtifacts = new codepipeline.Artifact();
    const sourceAction: GitHubSourceAction = new codepipeline_actions.GitHubSourceAction({
      actionName: 'Source',
      owner: ssm.StringParameter.fromStringParameterName(this, 'GithubUsername', 'github_username').stringValue,
      repo: 'aws-serverless-app-sam-cdk',
      oauthToken: cdk.SecretValue.secretsManager('github_token', {jsonField: 'github_token'}),
      output: sourceArtifacts,
      branch: 'master',
      trigger: codepipeline_actions.GitHubTrigger.WEBHOOK,
      variablesNamespace: 'SourceVariables'
    });

    // Build
    const buildProject = new codebuild.PipelineProject(this, 'CiCdBuild', {
      buildSpec: codebuild.BuildSpec.fromSourceFilename('pipeline/buildspec.json'),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_3_0
      },
      projectName: 'aws-serverless-app-build'
    });

    appArtifactBucket.grantPut(buildProject);

    const buildArtifacts = new codepipeline.Artifact();
    const buildAction: CodeBuildAction = new codepipeline_actions.CodeBuildAction({
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
        buildImage: codebuild.LinuxBuildImage.STANDARD_3_0,
        privileged: true
      },
      projectName: 'aws-serverless-app-test'
    });

    const testAction: CodeBuildAction = new codepipeline_actions.CodeBuildAction({
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
        buildImage: codebuild.LinuxBuildImage.STANDARD_3_0
      },
      projectName: 'aws-serverless-app-deploy'
    });

    appArtifactBucket.grantRead(deployProject);
    deployProject.role?.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AWSCloudFormationFullAccess'});
    deployProject.role?.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonSQSFullAccess'});
    deployProject.role?.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess'});
    deployProject.role?.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambdaFullAccess'});
    deployProject.role?.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/IAMFullAccess'});
    deployProject.role?.addManagedPolicy({managedPolicyArn: 'arn:aws:iam::aws:policy/AWSCodeDeployFullAccess'});

    // Deploy to staging
    const deployToStagingAction: CodeBuildAction = new codepipeline_actions.CodeBuildAction({
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
    const manualApprovalAction: ManualApprovalAction = new codepipeline_actions.ManualApprovalAction({
      actionName: 'Review',
      additionalInformation: 'Ensure AWS Lambda function works correctly in Staging and release date is agreed with Product Owners',
      runOrder: 1
    });

    const deployToProductionAction: CodeBuildAction = new codepipeline_actions.CodeBuildAction({
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
