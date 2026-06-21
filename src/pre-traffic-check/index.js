const { CodeDeployClient, PutLifecycleEventHookExecutionStatusCommand } = require('@aws-sdk/client-codedeploy');
const { DeleteItemCommand, DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { InvokeCommand, LambdaClient } = require('@aws-sdk/client-lambda');

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const cdClient = new CodeDeployClient({ region });
const lambdaClient = new LambdaClient({ region });
const ddbClient = new DynamoDBClient({ region });

const tableName = process.env.TABLE;

exports.handler = async event => {
    let status = 'Succeeded';
    try {
        console.log('Entering PreTraffic Hook!');

        console.log('CodeDeploy event', event);
	
        const functionToTest = process.env.FN_NEW_VERSION;
        console.log('Testing new function version: ' + functionToTest);
    
        const book = {isbn: '1-111-111-111', title:'Test', year: '111', author: 'Test', review: 1};
        const sqsEvent = {Records:[{body: JSON.stringify(book)}]};
        const lParams = {
            FunctionName: functionToTest,
            InvocationType: 'Event',
            Payload: JSON.stringify(sqsEvent)
        };
        await lambdaClient.send(new InvokeCommand(lParams));
        
        const ddbParams = {
            TableName: tableName,
            Key: {isbn: {S: book.isbn}},
            ConsistentRead: true
        };

        console.log('DynamoDB getItem params', JSON.stringify(ddbParams, null, 2));
        await wait();
        const {Item} = await ddbClient.send(new GetItemCommand(ddbParams));
        console.log('DynamoDB item', JSON.stringify(Item, null, 2));

        if (!Item) {
            throw new Error('Test book not inserted in DynamoDB');
        }

        delete ddbParams.ConsistentRead;
        await ddbClient.send(new DeleteItemCommand(ddbParams));
        console.log('Test DynamoDB item deleted');

    } catch (e) {
        console.log(e);
        status = 'Failed';
    }

    const cdParams = {
        deploymentId: event.DeploymentId,
        lifecycleEventHookExecutionId: event.LifecycleEventHookExecutionId,
        status
    };

    return await cdClient.send(new PutLifecycleEventHookExecutionStatusCommand(cdParams));
};

function wait(ms) {
    ms = ms || 1500;
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}
