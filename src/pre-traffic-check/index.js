const sdk = require('aws-sdk');

const cdClient = new sdk.CodeDeploy({apiVersion: '2014-10-06'});
const lambdaClient = new sdk.Lambda();
const ddbClient = new sdk.DynamoDB({apiVersion: '2012-08-10'});

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
        await lambdaClient.invoke(lParams).promise();
        
        const ddbParams = {
            TableName: tableName,
            Key: {isbn: {S: book.isbn}},
            ConsistentRead: true
        };

        console.log('DynamoDB getItem params', JSON.stringify(ddbParams, null, 2));
        await wait();
        const {Item} = await ddbClient.getItem(ddbParams).promise();
        console.log('DynamoDB item', JSON.stringify(Item, null, 2));

        if (!Item) {
            throw new Error('Test book not inserted in DynamoDB');
        }

        delete ddbParams.ConsistentRead;
        await ddbClient.deleteItem(ddbParams).promise();
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

    return await cdClient.putLifecycleEventHookExecutionStatus(cdParams).promise();
};

function wait(ms) {
    ms = ms || 1500;
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}