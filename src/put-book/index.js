const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const ddbOptions = {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'
};

if (process.env.AWS_SAM_LOCAL) {
    ddbOptions.endpoint = 'http://dynamodb:8000';
    ddbOptions.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
}

if (process.env.E2E_TEST) {
    ddbOptions.endpoint = 'http://localhost:8000';
    ddbOptions.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
}

const client = new DynamoDBClient(ddbOptions);
const tableName = process.env.TABLE;

exports.handler = async event => {
    try {
        const book = JSON.parse(event.Records[0].body);
        const {isbn, title, year, author, review} = book;

        const params = {
            TableName: tableName,
            Item: { 
                isbn: {S: isbn},
                title: {S: title},
                year: {S: year},
                author: {S: author},
                reviews: {N: review.toString()}
            }
        };
        await client.send(new PutItemCommand(params));
        
        return;
    } catch (error) {
        console.log(error);
        throw error;
    }
   
};
